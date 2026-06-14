import { logger } from '@/shared/logger.js';
import { get } from '@/page/modules/settings-store.js';
import { whenReady } from '@/page/modules/submission-dispatcher.js';
import { init, attachSettingsUpdateListener, waitForStoredSettings } from '@/page/modules/settings-bridge.js';
import { waitForTinyMCE } from '@/page/modules/placeholder-engine.js';
import { attachCommentModeObserver } from '@/page/modules/comment-mode-controller.js';
import { handleRubricFunctionality } from '@/page/modules/rubric-controller.js';
import { attachGroupsResultListener, checkQueuedStudentName } from '@/page/modules/notification-ui.js';
import { check } from '@/page/modules/name-sanity-check.js';
import { getNext } from '@/page/modules/highlight-class-selector.js';
import { waitForElement } from '@/page/modules/helpers/dom-utils.js';

/** Initialises all SpeedGrader feature modules once settings are available. */
function initializeAllFeatures() {
  whenReady((api) => {
      logger.log('SubmissionCoordinator ready');
      logger.log('Fetching submission text via api.getText()...');

      api.getText()
        .then((text) => {
          const preview = typeof text === 'string' ? text.slice(0, 500) : String(text);
          logger.log('Submission text received successfully!');
          logger.log('Character count:', typeof text === 'string' ? text.length : 'N/A');
          logger.log('Preview (first 500 chars):');
          logger.log(preview);
          if (typeof text === 'string' && text.length > 500) {
            logger.log('... (truncated, full length:', text.length, 'chars)');
          }

          if (typeof text !== 'string' || text.length < 20) {
            logger.log('Text too short for highlight demo, skipping');
            return;
          }

          // Generate random highlight ranges for demonstration
          const ranges = [];
          const count = 2 + Math.floor(Math.random() * 3);
          const minChunk = 10;
          const maxChunk = 80;
          const used = [];

          for (let i = 0; i < count; i++) {
            let start, end, attempts = 0;
            do {
              const chunkLen = minChunk + Math.floor(Math.random() * (maxChunk - minChunk + 1));
              start = Math.floor(Math.random() * (text.length - chunkLen));
              end = start + chunkLen;
              attempts++;
            } while (
              attempts < 20 &&
              used.some(([s, e]) => start < e && end > s)
            );

            if (attempts < 20) {
              used.push([start, end]);
              ranges.push({ start, end });
            }
          }

          if (ranges.length === 0) return;

          logger.log('Applying ' + ranges.length + ' random highlight(s) individually...');

          const classNames = [];
          let completed = 0;
          ranges.forEach((r, i) => {
            const snippet = text.slice(r.start, r.end).replace(/\s+/g, ' ').trim();
            const className = getNext();
            if (!className) {
              logger.log('  Range ' + (i + 1) + ': skipped (no class available)');
              return;
            }

            classNames[i] = className;

            logger.log('  Range ' + (i + 1) + ': chars ' + r.start + '\u2013' + r.end + ' \u2192 "' + snippet.slice(0, 60) + (snippet.length > 60 ? '\u2026' : '') + '" (' + className + ')');
            logger.log('  Range ' + (i + 1) + ' expected [' + className + ']: "' + text.slice(r.start, r.end) + '"');

            api.applyHighlights([r], className)
              .then(() => {
                completed++;
                if (completed === ranges.length) {
                  logger.log('All ' + ranges.length + ' highlights applied successfully!');

                  // Pick a random highlight and scroll to the start of it
                  const pick = Math.floor(Math.random() * ranges.length);
                  const { start, end } = ranges[pick];
                  const scrollClassName = classNames[pick];
                  const scrollSnippet = text.slice(start, end).replace(/\s+/g, ' ').trim();
                  logger.log('Scrolling to highlight ' + (pick + 1) + ': offset ' + start + ' (' + scrollClassName + ') \u2192 "' + scrollSnippet.slice(0, 60) + (scrollSnippet.length > 60 ? '\u2026' : '') + '"');
                  api.scrollIntoViewByOffset(start).catch((err) => {
                    logger.error('Scroll failed:', err.message);
                  });
                }
              })
              .catch((err) => {
                logger.error('Failed to apply range ' + (i + 1) + ' (' + className + '):', err.message);
              });
          });
        })
        .catch((err) => {
          logger.error('Failed to fetch submission text:', err.message);
        });
    });

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
