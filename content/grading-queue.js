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
    document.addEventListener('DOMContentLoaded', initializeGradingQueueListener);
  } else {
    initializeGradingQueueListener();
  }

  console.log('CSH: Grading Queue listener initialized');
})();
