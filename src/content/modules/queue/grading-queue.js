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

let _pendingAutoOpenOverride = null;
let _autoClickLoadQueueWhenEmpty = SYNCED_SETTINGS.autoClickLoadQueueWhenEmpty;
let _autoClickLoadQueueEveryHourWhenLessThanTenItems = SYNCED_SETTINGS.autoClickLoadQueueEveryHourWhenLessThanTenItems;
let _loadQueueHourlyTimerId = null;
let _queueRepopulationRetryActive = false;
const LOAD_QUEUE_BUTTON_SELECTOR = 'div[data-control-name="ButtonCanvas1_1"] button';
const LOAD_QUEUE_HOURLY_INTERVAL_MS = 60 * 60 * 1000;
const LOAD_QUEUE_MIN_ITEMS_THRESHOLD = 10;

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

function clearHourlyLoadQueueTimer(reason = 'not specified') {
  if (_loadQueueHourlyTimerId === null) return;
  clearTimeout(_loadQueueHourlyTimerId);
  _loadQueueHourlyTimerId = null;
  console.log('CSH: Cleared hourly Load Queue timer:', reason);
}

function runHourlyLoadQueueCheck() {
  _loadQueueHourlyTimerId = null;

  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  const queueItemCount = getCurrentQueueItemCount();
  if (queueItemCount < LOAD_QUEUE_MIN_ITEMS_THRESHOLD) {
    console.log('CSH: Hourly queue check found fewer than 10 items; clicking Load Queue');
    const didClickLoadQueue = clickLoadQueueButton('hourly queue check');

    if (!didClickLoadQueue) {
      resetHourlyLoadQueueTimer('hourly queue check click failed');
    }
    return;
  }

  console.log('CSH: Hourly queue check found', queueItemCount, 'items; no Load Queue click needed');
  resetHourlyLoadQueueTimer('hourly queue check complete');
}

function resetHourlyLoadQueueTimer(reason = 'not specified') {
  clearHourlyLoadQueueTimer('timer reset requested');

  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  _loadQueueHourlyTimerId = setTimeout(runHourlyLoadQueueCheck, LOAD_QUEUE_HOURLY_INTERVAL_MS);
  console.log('CSH: Started hourly Load Queue timer:', reason);
}

function onLoadQueueButtonClicked(source) {
  if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
    return;
  }

  resetHourlyLoadQueueTimer(`Load Queue clicked (${source})`);
}

function clickLoadQueueButton(reason = 'automation') {
  const loadQueueButton = document.querySelector(LOAD_QUEUE_BUTTON_SELECTOR);
  if (!loadQueueButton || loadQueueButton.disabled) {
    console.warn('CSH: Could not find enabled Load Queue button');
    return false;
  }

  loadQueueButton.click();
  console.log('CSH: Clicked Load Queue:', reason);
  return true;
}

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

function retryOpenNextAfterQueueLoad(timeoutMs = 15000) {
  if (_queueRepopulationRetryActive) {
    console.log('CSH: Queue repopulation retry already active; skipping duplicate retry');
    return;
  }

  _queueRepopulationRetryActive = true;

  if (tryClickFirstGradeButton()) {
    _queueRepopulationRetryActive = false;
    console.log('CSH: Opened next queue item after queue repopulation');
    return;
  }

  const observer = new MutationObserver(() => {
    if (tryClickFirstGradeButton()) {
      observer.disconnect();
      clearTimeout(timeoutId);
      _queueRepopulationRetryActive = false;
      console.log('CSH: Opened next queue item after queue repopulation');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const timeoutId = setTimeout(() => {
    observer.disconnect();
    _queueRepopulationRetryActive = false;
    console.warn('CSH: Queue repopulation retry timed out');
  }, timeoutMs);
}

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
            console.log('CSH: Re-applied grading status while waiting for value to settle:', studentName);
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

  console.log('CSH: Selected "Already Graded" for student:', studentName);
  return { selected: true, select: gradingStatusSelect, expectedValue: alreadyGradedValue };
}

function clickCompleteByStudentName(studentName) {
  const row = getQueueRowByStudentName(studentName);
  if (!row) return false;

  const completeButton = row.querySelector('[data-control-name="CompleteButton"] button');
  if (!completeButton || completeButton.disabled) {
    console.warn('CSH: Could not find enabled Complete button for student:', studentName);
    return false;
  }

  completeButton.click();
  console.log('CSH: Clicked Complete for student:', studentName);
  return true;
}

function attachGroupCheckResultListener() {
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        if (message && message.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS && message.sameGroup) {
          console.log('CSH: Received group match grading status for student:', message.queuedName, '| isGraded:', message.isGraded);

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
                  console.warn('CSH: Timed out waiting for grading status select to persist before completion');
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
          console.log('CSH: Received request to complete queue item for student:', message.queuedName);
          if (typeof message.autoOpenNextQueueItemAfterComplete === 'boolean') {
            _pendingAutoOpenOverride = message.autoOpenNextQueueItemAfterComplete;
          }
          clickCompleteByStudentName(message.queuedName);
          return;
        }
      } catch (e) {
        console.error('Error handling message:', e);
      }
    });
  } catch (e) {
    console.error('Error attaching message listener:', e);
  }
}

function maybeOpenNextQueueItemAfterComplete(completeButton, studentName) {
  if (!completeButton) return;

  const override = _pendingAutoOpenOverride;
  _pendingAutoOpenOverride = null;
  const studentState = getStudentQueuePopupState(studentName);
  const shouldAutoOpenNextQueueItem = typeof override === 'boolean'
    ? override
    : !!studentState.autoOpenNextQueueItemAfterComplete;

  waitForElementRemoval(completeButton).then((wasRemoved) => {
    if (!wasRemoved) {
      console.warn('CSH: Timed out waiting for completion control removal');
      return;
    }

    if (shouldAutoOpenNextQueueItem && tryClickFirstGradeButton()) {
      console.log('CSH: Opened next queue item after completion');
      return;
    }

    const hasAvailableGradeButton = !!getFirstAvailableGradeButton();
    if (hasAvailableGradeButton) {
      return;
    }

    if (!_autoClickLoadQueueWhenEmpty) {
      return;
    }

    const didClickLoadQueue = clickLoadQueueButton();
    if (didClickLoadQueue && shouldAutoOpenNextQueueItem) {
      retryOpenNextAfterQueueLoad(15000);
    }
  });
}

function initializeGradingQueueListener() {
  document.addEventListener('click', (event) => {
    const loadQueueButton = event.target.closest(LOAD_QUEUE_BUTTON_SELECTOR);
    if (loadQueueButton && !loadQueueButton.disabled) {
      onLoadQueueButtonClicked(event.isTrusted ? 'manual' : 'automatic');
    }

    const completeButton = event.target.closest('[data-control-name="CompleteButton"] button');
    if (completeButton) {
      const completeRow = getQueueRowFromCompleteButton(completeButton);
      const completeStudentName = getStudentNameFromRow(completeRow);
      QueueCompletePopup.hideAfterDelay();
      maybeOpenNextQueueItemAfterComplete(completeButton, completeStudentName);
    }

    const button = event.target.closest('[data-control-name="GraderButton"] button');
    if (!button) return;

    const row = getQueueRowFromActionButton(button);
    const studentName = getStudentNameFromRow(row);
    if (!studentName) {
      console.warn('CSH: Could not find student name element in Grading Queue');
      return;
    }

    const queuedStudent = {
      name: studentName,
      timestamp: Date.now()
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(
        { queuedStudentName: queuedStudent },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            console.warn('CSH: Failed to save queued student name', chrome.runtime.lastError);
          } else {
            console.log('CSH: Saved queued student name:', studentName);
          }
        }
      );
    } else {
      console.warn('CSH: chrome.storage.local not available');
    }
  }, true);
}

let inIframe = false;
try {
  inIframe = window.top !== window;
} catch (e) {
  inIframe = true;
}
console.log('CSH: Grading Queue script loaded', {
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

console.log('CSH: Grading Queue listener initialized');
