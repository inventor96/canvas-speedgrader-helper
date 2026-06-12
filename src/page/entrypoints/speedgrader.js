import { get } from '../modules/settings-store.js';
import { whenReady } from '../modules/submission-dispatcher.js';
import { init, attachSettingsUpdateListener, waitForStoredSettings } from '../modules/settings-bridge.js';
import { waitForTinyMCE } from '../modules/placeholder-engine.js';
import { attachCommentModeObserver } from '../modules/comment-mode-controller.js';
import { handleRubricFunctionality } from '../modules/rubric-controller.js';
import { attachGroupsResultListener, checkQueuedStudentName } from '../modules/notification-ui.js';
import { check } from '../modules/name-sanity-check.js';
import { getNext } from '../modules/highlight-class-selector.js';

function initializeAllFeatures() {
  whenReady((api) => {
      console.log('%c[CSH DEMO] SubmissionCoordinator ready \u2014 full pipeline is live!', 'font-weight:bold;color:#2ecc71;font-size:14px');
      console.log('[CSH DEMO] Request path: speedgrader.js \u2192 SubmissionDispatcher \u2192 IframeSubmissionAdapter \u2192 (postMessage) \u2192 iframe-content-loader \u2192 adapter');
      console.log('[CSH DEMO] Fetching submission text via api.getText()...');

      api.getText()
        .then((text) => {
          const preview = typeof text === 'string' ? text.slice(0, 500) : String(text);
          console.log('%c[CSH DEMO] \u2713 Submission text received successfully!', 'font-weight:bold;color:#2ecc71');
          console.log('[CSH DEMO] Character count:', typeof text === 'string' ? text.length : 'N/A');
          console.log('[CSH DEMO] Preview (first 500 chars):');
          console.log('%c' + preview, 'color:#555;background:#f5f5f5;padding:4px 8px;border-left:3px solid #2ecc71');
          if (typeof text === 'string' && text.length > 500) {
            console.log('[CSH DEMO] ... (truncated, full length:', text.length, 'chars)');
          }

          if (typeof text !== 'string' || text.length < 20) {
            console.log('%c[CSH DEMO] \u26a0 Text too short for highlight demo, skipping', 'color:#f39c12');
            return;
          }

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

          console.log('%c[CSH DEMO] \ud83c\udfa8 Applying ' + ranges.length + ' random highlight(s) individually...', 'font-weight:bold;color:#8e44ad');

          let completed = 0;
          ranges.forEach((r, i) => {
            const snippet = text.slice(r.start, r.end).replace(/\s+/g, ' ').trim();
            const className = getNext();
            if (!className) {
              console.log('[CSH DEMO]   Range ' + (i + 1) + ': skipped (no class available)');
              return;
            }

            console.log('[CSH DEMO]   Range ' + (i + 1) + ': chars ' + r.start + '\u2013' + r.end + ' \u2192 "' + snippet.slice(0, 60) + (snippet.length > 60 ? '\u2026' : '') + '" (' + className + ')');
            console.log('[CSH DEMO]   Range ' + (i + 1) + ' expected [' + className + ']: "' + text.slice(r.start, r.end) + '"');

            api.applyHighlights([r], className)
              .then(() => {
                completed++;
                if (completed === ranges.length) {
                  console.log('%c[CSH DEMO] \u2713 All ' + ranges.length + ' highlights applied successfully!', 'font-weight:bold;color:#2ecc71');
                }
              })
              .catch((err) => {
                console.error('%c[CSH DEMO] \u2717 Failed to apply range ' + (i + 1) + ' (' + className + '):', 'font-weight:bold;color:#e74c3c', err.message);
              });
          });
        })
        .catch((err) => {
          console.error('%c[CSH DEMO] \u2717 Failed to fetch submission text:', 'font-weight:bold;color:#e74c3c', err.message);
        });
    });

  waitForTinyMCE();

  attachCommentModeObserver();

  handleRubricFunctionality();

  try {
    attachGroupsResultListener();

    setTimeout(() => checkQueuedStudentName(), 500);
  } catch (e) {
    console.error('Error initializing queue student name check:', e);
  }

  if (get('enableNameSanityCheck')) {
    try {
      setTimeout(() => {
        const tryCheck = (retry = 0) => {
          check();
          if (retry < 20 && !document.querySelector('button[data-testid="student-select-trigger"] [data-testid="selected-student"]')) {
            setTimeout(() => tryCheck(retry + 1), 1000);
          }
        };
        tryCheck();
      }, 1000);
    } catch (e) {
      console.error('Error initializing name sanity check:', e);
    }
  }
}

function tryInit() {
  if (!init()) return false;
  attachSettingsUpdateListener();
  waitForStoredSettings(initializeAllFeatures);
  return true;
}

if (!tryInit()) {
  const observer = new MutationObserver(() => {
    if (tryInit()) {
      observer.disconnect();
    }
  });
  observer.observe(document.head, { attributes: true, attributeFilter: ['data-csh-settings'] });
}
