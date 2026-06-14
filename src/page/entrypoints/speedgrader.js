import { logger } from '@/shared/logger.js';
import { get } from '@/page/modules/settings-store.js';
import { whenReady } from '@/page/modules/submission-dispatcher.js';
import { init, attachSettingsUpdateListener, waitForStoredSettings } from '@/page/modules/settings-bridge.js';
import { waitForTinyMCE } from '@/page/modules/placeholder-engine.js';
import { attachCommentModeObserver } from '@/page/modules/comment-mode-controller.js';
import { handleRubricFunctionality } from '@/page/modules/rubric-controller.js';
import { attachGroupsResultListener, checkQueuedStudentName } from '@/page/modules/notification-ui.js';
import { check } from '@/page/modules/name-sanity-check.js';
import { waitForElement } from '@/page/modules/helpers/dom-utils.js';

/** Initialises all SpeedGrader feature modules once settings are available. */
function initializeAllFeatures() {
  // API readiness callback — use api.getText(), api.applyHighlights(),
  // api.scrollIntoViewByOffset() here once features need them.
  whenReady(() => {});

  waitForTinyMCE();

  attachCommentModeObserver();

  handleRubricFunctionality();

  // Check for queued student name mismatch on load
  try {
    attachGroupsResultListener();

    setTimeout(() => checkQueuedStudentName(), 500);
  } catch (e) {
    logger.error('Error initializing queue student name check:', e);
  }

  // Name sanity check: detect all-uppercase/lowercase names
  if (get('enableNameSanityCheck')) {
    try {
      setTimeout(() => {
        const STUDENT_SELECTOR = 'button[data-testid="student-select-trigger"] [data-testid="selected-student"]';
        check();
        waitForElement(STUDENT_SELECTOR, 20000).then((el) => {
          if (el) check();
        });
      }, 1000);
    } catch (e) {
      logger.error('Error initializing name sanity check:', e);
    }
  }
}

/** Bootstraps the settings bridge and waits for stored settings before initialising features. */
function tryInit() {
  if (!init()) return false;
  attachSettingsUpdateListener();
  waitForStoredSettings(initializeAllFeatures);
  return true;
}

// Retry init if the data-csh-settings attribute doesn't exist yet
if (!tryInit()) {
  const observer = new MutationObserver(() => {
    if (tryInit()) {
      observer.disconnect();
    }
  });
  observer.observe(document.head, { attributes: true, attributeFilter: ['data-csh-settings'] });
}
