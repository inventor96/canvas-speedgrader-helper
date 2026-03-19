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
   * Select the "Already Graded" option in the grading status dropdown for the given student name
   */
  function selectAlreadyGradedByStudentName(studentName) {
    if (!studentName) {
      console.warn('CSH: No student name provided');
      return;
    }

    // Find all student name elements
    const studentNameElements = document.querySelectorAll('[data-control-name="txtStudentName"]');

    // Find the one with matching text
    const matchingElement = Array.from(studentNameElements).find(el =>
      el.textContent.trim() === studentName.trim()
    );

    if (!matchingElement) {
      console.warn('CSH: Could not find student name element for:', studentName);
      return;
    }

    // Go up to find the parent row, then find the select
    const row = matchingElement.closest('[data-control-name="ColumnLabels"]')?.parentElement;
    if (!row) {
      console.warn('CSH: Could not find row for student name element');
      return;
    }

    // Find the grading status select within this row
    const gradingStatusSelect = row.querySelector('[data-control-name="GradingStatusCmbx"] select');
    if (!gradingStatusSelect) {
      console.warn('CSH: Could not find grading status select in row');
      return;
    }

    // Find the "Already Graded" option by its text content
    const options = Array.from(gradingStatusSelect.options);
    const alreadyGradedOption = options.find(option =>
      option.textContent.trim() === 'Already Graded'
    );

    if (!alreadyGradedOption) {
      console.warn('CSH: Could not find "Already Graded" option in grading status select');
      return;
    }

    // Select the option using the value attribute
    gradingStatusSelect.value = alreadyGradedOption.value;

    // Trigger change event to ensure any listeners are notified
    gradingStatusSelect.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('CSH: Selected "Already Graded" for student:', studentName);
  }

  /**
   * Listen for group check result messages from the service worker
   */
  function attachGroupCheckResultListener() {
    try {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        try {
          // Check if this is a group check result indicating same group was found
          if (!message || message.type !== CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT || !message.sameGroup) {
            return;
          }

          console.log('CSH: Received group match notification for student:', message.queuedName);

          // Check if setting is enabled before acting
          chrome.storage.sync.get(['autoSelectAlreadyGradedWhenGroupMatched'], (data) => {
            if (!data.autoSelectAlreadyGradedWhenGroupMatched) {
              return;
            }

            selectAlreadyGradedByStudentName(message.queuedName);
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
   * Initialize the page by setting up click listeners on grading buttons
   */
  function initializeGradingQueueListener() {
    // Use event delegation to handle dynamically added buttons
    document.addEventListener('click', (event) => {
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
