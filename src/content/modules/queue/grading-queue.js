import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { SYNCED_SETTINGS } from '@/shared/settings.js';
import {
  getQueueRowByStudentName,
  getStudentNameFromRow,
  getQueueRowFromActionButton,
  getQueueRowFromCompleteButton,
  getFirstAvailableGradeButton,
  getGradingStatusSelect,
  getAlreadyGradedOptionValue,
  getCurrentQueueItemCount,
  waitForElementRemoval,
  tryClickFirstGradeButton,
} from './queue-helpers.js';
import { QueueCompletePopup, getStudentQueuePopupState, setStudentQueuePopupState, setDefaultAutoOpenNext } from './queue-complete-popup.js';
import { logger } from '@/shared/logger.js';

let _pendingAutoOpenOverride = null;
let _autoClickLoadQueueWhenEmpty = SYNCED_SETTINGS.autoClickLoadQueueWhenEmpty;
let _autoClickLoadQueueEveryHourWhenLessThanTenItems = SYNCED_SETTINGS.autoClickLoadQueueEveryHourWhenLessThanTenItems;
let _loadQueueHourlyTimerId = null;
let _queueRepopulationRetryActive = false;
const LOAD_QUEUE_BUTTON_SELECTOR = 'div[data-control-name="ButtonCanvas1_1"] button';
const LOAD_QUEUE_HOURLY_INTERVAL_MS = 60 * 60 * 1000;
const LOAD_QUEUE_MIN_ITEMS_THRESHOLD = 10;

/** Loads queue-related settings from storage and initialises feature flags. */
function initializeQueuePopupDefaults(callback) {
  if (!chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) {
    callback();
    return;
  }

  chrome.storage.sync.get(SYNCED_SETTINGS, (data) => {
    setDefaultAutoOpenNext(data.autoOpenNextQueueItemAfterComplete);
    _autoClickLoadQueueWhenEmpty = !!data.autoClickLoadQueueWhenEmpty;
    _autoClickLoadQueueEveryHourWhenLessThanTenItems = !!data.autoClickLoadQueueEveryHourWhenLessThanTenItems;
    if (_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
      resetHourlyLoadQueueTimer('initial settings load');
    }
    callback();
  });
}

/** Cancels the hourly Load Queue timer. */
function clearHourlyLoadQueueTimer(reason = 'not specified') {
  if (_loadQueueHourlyTimerId === null) return;
  clearTimeout(_loadQueueHourlyTimerId);
  _loadQueueHourlyTimerId = null;
  logger.log('Cleared hourly Load Queue timer:', reason);
}

/** Checks queue size and clicks "Load Queue" if items are below the threshold. */
function runHourlyLoadQueueCheck() {
  _loadQueueHourlyTimerId = null;

  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  const queueItemCount = getCurrentQueueItemCount();
  if (queueItemCount < LOAD_QUEUE_MIN_ITEMS_THRESHOLD) {
    logger.log('Hourly queue check found fewer than 10 items; clicking Load Queue');
    const didClickLoadQueue = clickLoadQueueButton('hourly queue check');

    if (!didClickLoadQueue) {
      resetHourlyLoadQueueTimer('hourly queue check click failed');
    }
    return;
  }

  logger.log('Hourly queue check found', queueItemCount, 'items; no Load Queue click needed');
  resetHourlyLoadQueueTimer('hourly queue check complete');
}

/** Starts (or restarts) the hourly Load Queue timer. */
function resetHourlyLoadQueueTimer(reason = 'not specified') {
  clearHourlyLoadQueueTimer('timer reset requested');

  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  _loadQueueHourlyTimerId = setTimeout(runHourlyLoadQueueCheck, LOAD_QUEUE_HOURLY_INTERVAL_MS);
  logger.log('Started hourly Load Queue timer:', reason);
}

/** Called whenever the Load Queue button is clicked, to reset the hourly timer. */
function onLoadQueueButtonClicked(source) {
  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  resetHourlyLoadQueueTimer(`Load Queue clicked (${source})`);
}

/** Finds and clicks the "Load Queue" button. Returns true if clicked. */
function clickLoadQueueButton(reason = 'automation') {
  const loadQueueButton = document.querySelector(LOAD_QUEUE_BUTTON_SELECTOR);
  if (!loadQueueButton || loadQueueButton.disabled) {
    logger.warn('Could not find enabled Load Queue button');
    return false;
  }

  loadQueueButton.click();
  logger.log('Clicked Load Queue:', reason);
  return true;
}

/** Listens for synced setting changes and updates local flags. */
function attachSyncedSettingsChangeListener() {
  if (!chrome.storage || !chrome.storage.onChanged) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    if (changes.autoClickLoadQueueWhenEmpty) {
      _autoClickLoadQueueWhenEmpty = !!changes.autoClickLoadQueueWhenEmpty.newValue;
    }

    if (changes.autoClickLoadQueueEveryHourWhenLessThanTenItems) {
      const newEnabled = !!changes.autoClickLoadQueueEveryHourWhenLessThanTenItems.newValue;
      const wasEnabled = _autoClickLoadQueueEveryHourWhenLessThanTenItems;
      _autoClickLoadQueueEveryHourWhenLessThanTenItems = newEnabled;

      if (!newEnabled) {
        clearHourlyLoadQueueTimer('setting disabled');
        return;
      }

      if (!wasEnabled && _loadQueueHourlyTimerId === null) {
        resetHourlyLoadQueueTimer('setting enabled');
      }
    }
  });
}

/** Watches for the queue to repopulate after clicking Load Queue, then opens the first item. */
function retryOpenNextAfterQueueLoad(timeoutMs = 15000) {
  if (_queueRepopulationRetryActive) {
    logger.log('Queue repopulation retry already active; skipping duplicate retry');
    return;
  }

  _queueRepopulationRetryActive = true;

  if (tryClickFirstGradeButton()) {
    _queueRepopulationRetryActive = false;
    logger.log('Opened next queue item after queue repopulation');
    return;
  }

  const observer = new MutationObserver(() => {
    if (tryClickFirstGradeButton()) {
      observer.disconnect();
      clearTimeout(timeoutId);
      _queueRepopulationRetryActive = false;
      logger.log('Opened next queue item after queue repopulation');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const timeoutId = setTimeout(() => {
    observer.disconnect();
    _queueRepopulationRetryActive = false;
    logger.warn('Queue repopulation retry timed out');
  }, timeoutMs);
}

/** Polls until a student's grading status select has a stable expected value. */
function waitForSelectValueByStudentName(
  studentName,
  expectedValue,
  timeoutMs = 5000,
  stableMs = 750,
  retryAfterChecks = 3
) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let matchedSince = null;
    let checksSinceRetry = 0;

    const poll = () => {
      const row = getQueueRowByStudentName(studentName);
      const select = getGradingStatusSelect(row);
      const currentValue = select ? String(select.value) : null;

      if (currentValue === String(expectedValue)) {
        checksSinceRetry = 0;

        if (matchedSince === null) {
          matchedSince = Date.now();
        }

        if (Date.now() - matchedSince >= stableMs) {
          resolve(true);
          return;
        }
      } else {
        matchedSince = null;

        if (select) {
          checksSinceRetry += 1;

          if (checksSinceRetry >= retryAfterChecks) {
            checksSinceRetry = 0;
            select.value = String(expectedValue);
            select.dispatchEvent(new Event('change', { bubbles: true }));
            logger.log('Re-applied grading status while waiting for value to settle:', studentName);
          }
        }
      }

      if (Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }

      setTimeout(poll, 100);
    };

    poll();
  });
}

/** Sets the grading status to "Already Graded" for a given student in the queue. */
function selectAlreadyGradedByStudentName(studentName) {
  const row = getQueueRowByStudentName(studentName);
  if (!row) {
    return { selected: false, select: null, expectedValue: null };
  }

  const gradingStatusSelect = getGradingStatusSelect(row);
  if (!gradingStatusSelect) {
    return { selected: false, select: null, expectedValue: null };
  }

  const alreadyGradedValue = getAlreadyGradedOptionValue(gradingStatusSelect);
  if (!alreadyGradedValue) {
    return { selected: false, select: gradingStatusSelect, expectedValue: null };
  }

  gradingStatusSelect.value = alreadyGradedValue;

  gradingStatusSelect.dispatchEvent(new Event('change', { bubbles: true }));

  logger.log('Selected "Already Graded" for student:', studentName);
  return { selected: true, select: gradingStatusSelect, expectedValue: alreadyGradedValue };
}

/** Clicks the "Complete" button for a given student in the queue. */
function clickCompleteByStudentName(studentName) {
  const row = getQueueRowByStudentName(studentName);
  if (!row) return false;

  const completeButton = row.querySelector('[data-control-name="CompleteButton"] button');
  if (!completeButton || completeButton.disabled) {
    logger.warn('Could not find enabled Complete button for student:', studentName);
    return false;
  }

  completeButton.click();
  logger.log('Clicked Complete for student:', studentName);
  return true;
}

/** Listens for runtime messages about groups check results and queue completion. */
function attachGroupCheckResultListener() {
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message && message.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS && message.sameGroup) {
          logger.log('Received group match grading status for student:', message.queuedName, '| isGraded:', message.isGraded);

          chrome.storage.sync.get(SYNCED_SETTINGS, async (data) => {
            const shouldAutoSelectAlreadyGraded = !!data.autoSelectAlreadyGradedWhenGroupMatched && !!message.isGraded;
            const shouldAutoCompleteAfterGroupMatch = !!data.autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded && !!message.isGraded;

            if (!shouldAutoSelectAlreadyGraded && !shouldAutoCompleteAfterGroupMatch) {
              return;
            }

            if (shouldAutoSelectAlreadyGraded) {
              const selectionResult = selectAlreadyGradedByStudentName(message.queuedName);
              if (!selectionResult.selected) {
                return;
              }

              if (shouldAutoCompleteAfterGroupMatch) {
                const settled = await waitForSelectValueByStudentName(
                  message.queuedName,
                  selectionResult.expectedValue,
                  5000,
                  750
                );
                if (!settled) {
                  logger.warn('Timed out waiting for grading status select to persist before completion');
                  return;
                }
              }
            }

            if (shouldAutoCompleteAfterGroupMatch) {
              clickCompleteByStudentName(message.queuedName);
            }
          });
          return;
        }

        if (message && message.type === CSH_MESSAGE_TYPES.CLICK_QUEUE_COMPLETE_AFTER_COMMENT) {
          logger.log('Received request to complete queue item for student:', message.queuedName);
          if (typeof message.autoOpenNextQueueItemAfterComplete === 'boolean') {
            _pendingAutoOpenOverride = message.autoOpenNextQueueItemAfterComplete;
          }
          clickCompleteByStudentName(message.queuedName);
          return;
        }
      } catch (e) {
        logger.error('Error handling message:', e);
      }
    });
  } catch (e) {
    logger.error('Error attaching message listener:', e);
  }
}

/** After a complete button click, optionally opens the next queue item or clicks Load Queue. */
function maybeOpenNextQueueItemAfterComplete(completeButton, studentName) {
  if (!completeButton) return;

  const override = _pendingAutoOpenOverride;
  _pendingAutoOpenOverride = null;
  const studentState = getStudentQueuePopupState(studentName);
  const shouldAutoOpenNextQueueItem = typeof override === 'boolean'
    ? override
    : !!studentState.autoOpenNextQueueItemAfterComplete;

  // Wait for the completion control to be removed from the DOM
  waitForElementRemoval(completeButton).then((wasRemoved) => {
    if (!wasRemoved) {
      logger.warn('Timed out waiting for completion control removal');
      return;
    }

    if (shouldAutoOpenNextQueueItem && tryClickFirstGradeButton()) {
      logger.log('Opened next queue item after completion');
      return;
    }

    const hasAvailableGradeButton = !!getFirstAvailableGradeButton();
    if (hasAvailableGradeButton) {
      return;
    }

    if (!_autoClickLoadQueueWhenEmpty || !shouldAutoOpenNextQueueItem) {
      return;
    }

    const didClickLoadQueue = clickLoadQueueButton();
    if (didClickLoadQueue) {
      retryOpenNextAfterQueueLoad(15000);
    }
  });
}

/** Wires up the click listener for the entire grading queue (Grade, Complete, Load Queue buttons). */
function initializeGradingQueueListener() {
  document.addEventListener('click', (event) => {
    const loadQueueButton = event.target.closest(LOAD_QUEUE_BUTTON_SELECTOR);
    if (loadQueueButton && !loadQueueButton.disabled) {
      onLoadQueueButtonClicked(event.isTrusted ? 'manual' : 'automatic');
    }

    // After clicking Complete, handle auto-open-next logic
    const completeButton = event.target.closest('[data-control-name="CompleteButton"] button');
    if (completeButton) {
      const completeRow = getQueueRowFromCompleteButton(completeButton);
      const completeStudentName = getStudentNameFromRow(completeRow);
      QueueCompletePopup.hideAfterDelay();
      maybeOpenNextQueueItemAfterComplete(completeButton, completeStudentName);
    }

    // After clicking a Grade button, save the student name to local storage
    const button = event.target.closest('[data-control-name="GraderButton"] button');
    if (!button) return;

    const row = getQueueRowFromActionButton(button);
    const studentName = getStudentNameFromRow(row);
    if (!studentName) {
      logger.warn('Could not find student name element in Grading Queue');
      return;
    }

    const queuedStudent = {
      name: studentName,
      timestamp: Date.now()
    };

    const queueItemCount = getCurrentQueueItemCount();
    const remainingCount = Math.max(0, queueItemCount - 1);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(
        { queuedStudentName: queuedStudent, queuedQueueCount: remainingCount },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logger.warn('Failed to save queued student data', chrome.runtime.lastError);
          } else {
            logger.log('Saved queued student name:', studentName, '| queue count:', remainingCount);
          }
        }
      );
    } else {
      logger.warn('chrome.storage.local not available');
    }
  }, true);
}

let inIframe = false;
try {
  inIframe = window.top !== window;
} catch (e) {
  inIframe = true;
}
logger.log('Grading Queue script loaded', {
  href: window.location.href,
  inIframe
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeQueuePopupDefaults(() => {
      initializeGradingQueueListener();
      attachGroupCheckResultListener();
      attachSyncedSettingsChangeListener();
      QueueCompletePopup.init();
    });
  });
} else {
  initializeQueuePopupDefaults(() => {
    initializeGradingQueueListener();
    attachGroupCheckResultListener();
    attachSyncedSettingsChangeListener();
    QueueCompletePopup.init();
  });
}

logger.log('Grading Queue listener initialized');
