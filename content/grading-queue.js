(() => {
  'use strict';

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
   * Wait until a select reflects the expected value.
   */
  function waitForSelectValue(select, expectedValue, timeoutMs = 5000) {
    return new Promise((resolve) => {
      if (!select || !select.isConnected) {
        resolve(false);
        return;
      }

      if (String(select.value) === String(expectedValue)) {
        resolve(true);
        return;
      }

      const startedAt = Date.now();
      const poll = () => {
        if (!select.isConnected) {
          resolve(false);
          return;
        }

        if (String(select.value) === String(expectedValue)) {
          resolve(true);
          return;
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
   * Listen for group check result messages from the service worker
   */
  function attachGroupCheckResultListener() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          // Listen for the enriched grading status message from SpeedGrader.
          if (!message || message.type !== CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS || !message.sameGroup) {
            return;
          }

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
                const settled = await waitForSelectValue(selectionResult.select, selectionResult.expectedValue, 5000);
                if (!settled) {
                  console.warn('CSH: Timed out waiting for grading status select to update before completion');
                  return;
                }
              }
            }

            if (shouldAutoCompleteAfterGroupMatch) {
              clickCompleteByStudentName(message.queuedName);
            }
          });
        } catch (e) {
          console.error('Error handling group check result message:', e);
        }
      });
    } catch (e) {
      console.error('Error attaching group check result listener:', e);
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
   * Click the first available grade button in the queue.
   */
  function clickFirstGradeButton() {
    const gradeButtons = Array.from(document.querySelectorAll('[data-control-name="GraderButton"] button'));
    const firstAvailable = gradeButtons.find((button) => !button.disabled && button.isConnected);
    if (!firstAvailable) {
      console.log('CSH: No available grade button found after completion');
      return;
    }

    firstAvailable.click();
    console.log('CSH: Opened next queue item after completion');
  }

  /**
   * Handle completion clicks by optionally opening the next queue item.
   */
  function maybeOpenNextQueueItemAfterComplete(completeButton) {
    if (!completeButton) return;

    chrome.storage.sync.get({ autoOpenNextQueueItemAfterComplete: false }, async (data) => {
      if (!data.autoOpenNextQueueItemAfterComplete) {
        return;
      }

      const wasRemoved = await waitForElementRemoval(completeButton);
      if (!wasRemoved) {
        console.warn('CSH: Timed out waiting for completion control removal');
        return;
      }

      clickFirstGradeButton();
    });
  }

  /**
   * Initialize the page by setting up click listeners on grading buttons
   */
  function initializeGradingQueueListener() {
    // Use event delegation to handle dynamically added buttons
    document.addEventListener('click', (event) => {
      // First check if a complete button was clicked, and handle that separately
      const completeButton = event.target.closest('[data-control-name="CompleteButton"] button');
      if (completeButton) {
        maybeOpenNextQueueItemAfterComplete(completeButton);
      }

      // Check if a grading button was clicked
      const button = event.target.closest('[data-control-name="GraderButton"] button');
      if (!button) return;

      // Extract the student name from the queue item
      const studentNameElement = button
        .closest('[data-control-name="ActionButtons"]')
        ?.parentElement
        ?.querySelector('[data-control-name="txtStudentName"]');

      if (!studentNameElement) {
        console.warn('CSH: Could not find student name element in Grading Queue');
        return;
      }

      const studentName = studentNameElement.textContent.trim();
      if (!studentName) {
        console.warn('CSH: Student name is empty in Grading Queue');
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
      initializeGradingQueueListener();
      attachGroupCheckResultListener();
    });
  } else {
    initializeGradingQueueListener();
    attachGroupCheckResultListener();
  }

  console.log('CSH: Grading Queue listener initialized');
})();
