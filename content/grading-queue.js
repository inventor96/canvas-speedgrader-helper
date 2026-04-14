(() => {
  'use strict';

  let _pendingAutoOpenOverride = null;
  let _defaultAutoOpenNextQueueItemAfterComplete = false;
  let _autoClickLoadQueueWhenEmpty = false;
  let _autoClickLoadQueueEveryHourWhenLessThanTenItems = false;
  let _loadQueueHourlyTimerId = null;
  let _queueRepopulationRetryActive = false;
  const _queuePopupStateByStudentName = Object.create(null);
  const LOAD_QUEUE_BUTTON_SELECTOR = 'div[data-control-name="ButtonCanvas1_1"] button';
  const LOAD_QUEUE_HOURLY_INTERVAL_MS = 60 * 60 * 1000;
  const LOAD_QUEUE_MIN_ITEMS_THRESHOLD = 10;

  /**
   * Grading Queue Helper Script
   * 
   * This script runs on the PowerApps Grading Queue page.
   * It captures the student name when a grading button is clicked, and stores it
   * in extension storage so that SpeedGrader can compare and verify the correct
   * student is being graded.
   */

  /**
   * Find the queue row container for a given student name.
   */
  function getQueueRowByStudentName(studentName) {
    if (!studentName) {
      console.warn('CSH: No student name provided');
      return null;
    }

    // Find all student name elements
    const studentNameElements = document.querySelectorAll('[data-control-name="txtStudentName"]');

    // Find the one with matching text
    const matchingElement = Array.from(studentNameElements).find(el =>
      el.textContent.trim() === studentName.trim()
    );

    if (!matchingElement) {
      console.warn('CSH: Could not find student name element for:', studentName);
      return null;
    }

    // Go up to find the parent row, then find the select
    const row = matchingElement.closest('[data-control-name="ColumnLabels"]')?.parentElement;
    if (!row) {
      console.warn('CSH: Could not find row for student name element');
      return null;
    }

    return row;
  }

  /**
   * Return the display student name for a queue row.
   */
  function getStudentNameFromRow(row) {
    if (!row) return '';
    const studentNameElement = row.querySelector('[data-control-name="txtStudentName"]');
    return studentNameElement?.textContent?.trim() || '';
  }

  /**
   * Find the queue row container from a row action button element.
   */
  function getQueueRowFromActionButton(button) {
    if (!button || typeof button.closest !== 'function') return null;
    return button.closest('[data-control-name="ActionButtons"]')?.parentElement || null;
  }

  /**
   * Find the queue row container from a completion button element.
   */
  function getQueueRowFromCompleteButton(completeButton) {
    if (!completeButton || typeof completeButton.closest !== 'function') return null;

    // Complete controls can be wrapped differently across PowerApps renders.
    const actionButtonsParent = completeButton.closest('[data-control-name="ActionButtons"]')?.parentElement;
    if (actionButtonsParent) return actionButtonsParent;

    const columnLabelsParent = completeButton.closest('[data-control-name="ColumnLabels"]')?.parentElement;
    if (columnLabelsParent) return columnLabelsParent;

    const completeControl = completeButton.closest('[data-control-name="CompleteButton"]');
    if (!completeControl) return null;

    return completeControl.closest('[data-control-name="ColumnLabels"]')?.parentElement || completeControl.parentElement || null;
  }

  /**
   * Get a normalized student key used for transient popup state.
   */
  function getStudentKey(studentName) {
    return String(studentName || '').trim();
  }

  /**
   * Read per-student queue popup state, creating it from extension defaults if needed.
   */
  function getStudentQueuePopupState(studentName) {
    const key = getStudentKey(studentName);
    if (!key) {
      return {
        autoOpenNextQueueItemAfterComplete: _defaultAutoOpenNextQueueItemAfterComplete,
      };
    }

    if (!_queuePopupStateByStudentName[key]) {
      _queuePopupStateByStudentName[key] = {
        autoOpenNextQueueItemAfterComplete: _defaultAutoOpenNextQueueItemAfterComplete,
      };
    }

    return _queuePopupStateByStudentName[key];
  }

  /**
   * Write per-student queue popup state.
   */
  function setStudentQueuePopupState(studentName, patch) {
    const key = getStudentKey(studentName);
    if (!key) return;

    const existing = getStudentQueuePopupState(key);
    _queuePopupStateByStudentName[key] = {
      ...existing,
      ...patch,
    };
  }

  /**
   * Seed queue popup defaults from synced extension settings.
   */
  function initializeQueuePopupDefaults(callback) {
    if (!chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) {
      callback();
      return;
    }

    chrome.storage.sync.get({
      autoOpenNextQueueItemAfterComplete: false,
      autoClickLoadQueueWhenEmpty: false,
      autoClickLoadQueueEveryHourWhenLessThanTenItems: false,
    }, (data) => {
      _defaultAutoOpenNextQueueItemAfterComplete = !!data.autoOpenNextQueueItemAfterComplete;
      _autoClickLoadQueueWhenEmpty = !!data.autoClickLoadQueueWhenEmpty;
      _autoClickLoadQueueEveryHourWhenLessThanTenItems = !!data.autoClickLoadQueueEveryHourWhenLessThanTenItems;
      if (_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
        resetHourlyLoadQueueTimer('initial settings load');
      }
      callback();
    });
  }

  /**
   * Clear the hourly Load Queue timer if one exists.
   */
  function clearHourlyLoadQueueTimer(reason = 'not specified') {
    if (_loadQueueHourlyTimerId === null) return;
    clearTimeout(_loadQueueHourlyTimerId);
    _loadQueueHourlyTimerId = null;
    console.log('CSH: Cleared hourly Load Queue timer:', reason);
  }

  /**
   * Count queue items currently visible in the grading queue.
   */
  function getCurrentQueueItemCount() {
    const studentNameElements = Array.from(document.querySelectorAll('[data-control-name="txtStudentName"]'));
    return studentNameElements.filter((element) => {
      if (!element || !element.isConnected) return false;
      return !!(element.textContent || '').trim();
    }).length;
  }

  /**
   * Run the hourly queue-size check and click Load Queue when below threshold.
   */
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

  /**
   * Start or restart the hourly Load Queue timer when the feature is enabled.
   */
  function resetHourlyLoadQueueTimer(reason = 'not specified') {
    clearHourlyLoadQueueTimer('timer reset requested');

    if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
      return;
    }

    _loadQueueHourlyTimerId = setTimeout(runHourlyLoadQueueCheck, LOAD_QUEUE_HOURLY_INTERVAL_MS);
    console.log('CSH: Started hourly Load Queue timer:', reason);
  }

  /**
   * Handle any successful Load Queue click (manual or automatic).
   */
  function onLoadQueueButtonClicked(source) {
    if (!_autoClickLoadQueueEveryHourWhenLessThanTenItems) {
      return;
    }

    resetHourlyLoadQueueTimer(`Load Queue clicked (${source})`);
  }

  /**
   * Click the "Load Queue" button when queue items are exhausted.
   */
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

  /**
   * Keep local queue settings in sync when extension settings are changed.
   */
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

  /**
   * Retry once for a short window so queue repopulation can finish before
   * attempting to open the next submission.
   */
  function retryOpenNextAfterQueueLoad(maxChecks = 15, intervalMs = 1000) {
    if (_queueRepopulationRetryActive) {
      console.log('CSH: Queue repopulation retry already active; skipping duplicate retry');
      return;
    }

    _queueRepopulationRetryActive = true;
    let checksCompleted = 0;

    const checkForGradeButton = () => {
      if (tryClickFirstGradeButton()) {
        _queueRepopulationRetryActive = false;
        console.log('CSH: Opened next queue item after queue repopulation');
        return;
      }

      checksCompleted += 1;
      if (checksCompleted >= maxChecks) {
        _queueRepopulationRetryActive = false;
        console.warn('CSH: Queue repopulation retry timed out after 15 seconds');
        return;
      }

      setTimeout(checkForGradeButton, intervalMs);
    };

    setTimeout(checkForGradeButton, intervalMs);
  }

  /**
   * Get the first available grade button, if any.
   */
  function getFirstAvailableGradeButton() {
    const gradeButtons = Array.from(document.querySelectorAll('[data-control-name="GraderButton"] button'));
    return gradeButtons.find((button) => !button.disabled && button.isConnected) || null;
  }

  /**
   * Find grading status select for a queue row.
   */
  function getGradingStatusSelect(row) {
    if (!row) return null;
    const select = row.querySelector('[data-control-name="GradingStatusCmbx"] select');
    if (!select) {
      console.warn('CSH: Could not find grading status select in row');
      return null;
    }
    return select;
  }

  /**
   * Find the option value for "Already Graded" in a select.
   */
  function getAlreadyGradedOptionValue(gradingStatusSelect) {
    if (!gradingStatusSelect) return null;

    const options = Array.from(gradingStatusSelect.options);
    const alreadyGradedOption = options.find(option =>
      option.textContent.trim() === 'Already Graded'
    );

    if (!alreadyGradedOption) {
      console.warn('CSH: Could not find "Already Graded" option in grading status select');
      return null;
    }

    return alreadyGradedOption.value;
  }

  /**
   * Wait until the grading status select for a student keeps the expected value
   * across PowerApps row re-renders for a short stability window.
   */
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

  /**
   * Select the "Already Graded" option in the grading status dropdown for the given student name.
   */
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

  /**
   * Click "Complete" for the given student row.
   */
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

  /**
   * Listen for group check result messages and auto-complete messages from the service worker
   */
  function attachGroupCheckResultListener() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          // Handle group check grading status messages
          if (message && message.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS && message.sameGroup) {
            console.log('CSH: Received group match grading status for student:', message.queuedName, '| isGraded:', message.isGraded);

            chrome.storage.sync.get({
              autoSelectAlreadyGradedWhenGroupMatched: false,
              autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded: false,
            }, async (data) => {
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

                // If completion automation is also active, wait until the select value settles first.
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

          // Handle auto-complete after comment submission
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

  /**
   * Wait until an element is detached from the DOM.
   */
  function waitForElementRemoval(element, timeoutMs = 15000) {
    return new Promise((resolve) => {
      if (!element || !element.isConnected) {
        resolve(true);
        return;
      }

      const timeoutId = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, timeoutMs);

      const observer = new MutationObserver(() => {
        if (!element.isConnected) {
          clearTimeout(timeoutId);
          observer.disconnect();
          resolve(true);
        }
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    });
  }

  /**
   * Attempt to click the first available grade button.
   */
  function tryClickFirstGradeButton() {
    const firstAvailable = getFirstAvailableGradeButton();
    if (!firstAvailable) {
      return false;
    }

    firstAvailable.click();
    return true;
  }

  const QueueCompletePopup = (() => {
    let _el = null;
    let _hideTimer = null;
    let _activeStudentName = '';
    const HIDE_DELAY_MS = 1500;

    function _isPopup(node) {
      if (!_el || !node) return false;
      return node === _el || (typeof _el.contains === 'function' && _el.contains(node));
    }

    function _isCompleteButton(node) {
      return !!(node && typeof node.closest === 'function' && node.closest('[data-control-name="CompleteButton"] button'));
    }

    function _cancelHideTimer() {
      if (_hideTimer !== null) {
        clearTimeout(_hideTimer);
        _hideTimer = null;
      }
    }

    function _startHideTimer() {
      _cancelHideTimer();
      _hideTimer = setTimeout(() => {
        if (_el) _el.style.display = 'none';
      }, HIDE_DELAY_MS);
    }

    function _syncCheckboxesForStudent(studentName) {
      const state = getStudentQueuePopupState(studentName);
      const cbNext = document.getElementById('csh-queue-open-next-cb');
      if (cbNext) {
        cbNext.checked = !!state.autoOpenNextQueueItemAfterComplete;
      }
    }

    function _show(completeButtonEl, studentName) {
      if (!_el) return;

      _activeStudentName = studentName || '';
      _syncCheckboxesForStudent(_activeStudentName);

      const rect = completeButtonEl.getBoundingClientRect();
      _el.style.left = rect.left + 'px';
      _el.style.top = rect.top + 'px';
      _el.style.display = 'block';
    }

    function _create() {
      const el = document.createElement('div');
      el.id = 'csh-queue-complete-popup';
      el.style.cssText = [
        'position:fixed',
        'z-index:99999',
        'background:#fff',
        'border:1px solid #c7cdd1',
        'border-radius:4px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
        'padding:8px 12px',
        'display:none',
        'transform:translate(calc(-100% - 8px), 0)',
        'min-width:220px',
        'font-size:13px',
        'line-height:1.5',
        'color:#2d3b45',
        'font-family:Lato,LatoWeb,sans-serif',
        'user-select:none',
      ].join(';');

      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;padding:2px 0;white-space:nowrap;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = 'csh-queue-open-next-cb';
      cb.style.cssText = 'margin:0;cursor:pointer;flex-shrink:0;';

      const span = document.createElement('span');
      span.textContent = 'Start next queue submission';

      label.appendChild(cb);
      label.appendChild(span);
      el.appendChild(label);

      el.addEventListener('change', (event) => {
        const target = event.target;
        if (!target || target.type !== 'checkbox') return;
        if (target.id !== 'csh-queue-open-next-cb') return;

        setStudentQueuePopupState(_activeStudentName, {
          autoOpenNextQueueItemAfterComplete: !!target.checked,
        });
      });

      document.body.appendChild(el);
      return el;
    }

    function init() {
      if (_el) return;
      _el = _create();

      document.addEventListener('mouseover', (event) => {
        if (_isCompleteButton(event.target)) {
          const completeButton = event.target.closest('[data-control-name="CompleteButton"] button');
          const row = getQueueRowFromCompleteButton(completeButton);
          const studentName = getStudentNameFromRow(row);

          _cancelHideTimer();
          _show(completeButton, studentName);
          return;
        }

        if (_isPopup(event.target)) {
          _cancelHideTimer();
        }
      });

      document.addEventListener('mouseout', (event) => {
        if (!_el || _el.style.display === 'none') return;
        const leaving = event.target;
        const entering = event.relatedTarget;

        if (!_isCompleteButton(leaving) && !_isPopup(leaving)) return;
        if (_isCompleteButton(entering) || _isPopup(entering)) return;

        _startHideTimer();
      });
    }

    function hideAfterDelay() {
      if (!_el || _el.style.display === 'none') return;
      _startHideTimer();
    }

    return { init, hideAfterDelay };
  })();

  /**
   * Handle completion clicks by optionally opening the next queue item.
   */
  function maybeOpenNextQueueItemAfterComplete(completeButton, studentName) {
    if (!completeButton) return;

    // Capture and clear any transient override set by the comment-submit flow.
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
        retryOpenNextAfterQueueLoad(15, 1000);
      }
    });
  }

  /**
   * Initialize the page by setting up click listeners on grading buttons
   */
  function initializeGradingQueueListener() {
    // Use event delegation to handle dynamically added buttons
    document.addEventListener('click', (event) => {
      const loadQueueButton = event.target.closest(LOAD_QUEUE_BUTTON_SELECTOR);
      if (loadQueueButton && !loadQueueButton.disabled) {
        onLoadQueueButtonClicked(event.isTrusted ? 'manual' : 'automatic');
      }

      // First check if a complete button was clicked, and handle that separately
      const completeButton = event.target.closest('[data-control-name="CompleteButton"] button');
      if (completeButton) {
        const completeRow = getQueueRowFromCompleteButton(completeButton);
        const completeStudentName = getStudentNameFromRow(completeRow);
        QueueCompletePopup.hideAfterDelay();
        maybeOpenNextQueueItemAfterComplete(completeButton, completeStudentName);
      }

      // Check if a grading button was clicked
      const button = event.target.closest('[data-control-name="GraderButton"] button');
      if (!button) return;

      // Extract the student name from the queue item
      const row = getQueueRowFromActionButton(button);
      const studentName = getStudentNameFromRow(row);
      if (!studentName) {
        console.warn('CSH: Could not find student name element in Grading Queue');
        return;
      }

      // Store the student name in extension storage with a timestamp
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
    }, true); // Use capture phase to ensure we catch the event
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

  // Wait for the page to be ready, then initialize
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
})();
