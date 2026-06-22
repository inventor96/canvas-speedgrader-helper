import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { observeUntil } from '@/shared/observe-until.js';
import { SYNCED_SETTINGS } from '@/shared/settings.js';
import { getCurrentCanvasStudentFullName } from './settings-injector.js';

/** Live copies of the settings that can be overridden per-action via the popup. */
let closeSpeedgraderTabAfterSubmitCommentEnabled = SYNCED_SETTINGS.closeSpeedgraderTabAfterSubmitComment;
let autoCompleteQueueItemAfterCommentSubmitEnabled = SYNCED_SETTINGS.autoCompleteQueueItemAfterCommentSubmit;
let autoOpenNextQueueItemAfterCompleteEnabled = SYNCED_SETTINGS.autoOpenNextQueueItemAfterComplete;
let closeOnSubmitCommentListenerAttached = false;
let closeOnSubmitCommentPending = false;
let _queueCount = null;

/** Counts the persisted comment elements on the page. */
function getPersistedCommentCount() {
  const commentElements = document.querySelectorAll('div[data-testid^="comment-"]');
  return Array.from(commentElements).filter((el) => {
    const testId = el.getAttribute('data-testid') || '';
    return /^comment-\d+$/.test(testId);
  }).length;
}

/** Waits for the comment count to increase (confirms the comment was persisted). */
function waitForPersistedCommentCountIncrease(previousCount, timeoutMs = 15000) {
  return observeUntil(() => getPersistedCommentCount() > previousCount, {
    timeout: timeoutMs,
  });
}

/** Attaches a click handler on the submit comment button that auto-closes and/or completes the queue. */
function attachCloseOnSubmitCommentListener() {
  if (closeOnSubmitCommentListenerAttached) return;
  closeOnSubmitCommentListenerAttached = true;

  document.addEventListener('click', async (event) => {
    const submitCommentButton = event.target.closest('button[data-testid="submit-comment-button"]');
    if (!submitCommentButton) return;
    if (!closeSpeedgraderTabAfterSubmitCommentEnabled && !autoCompleteQueueItemAfterCommentSubmitEnabled) return;
    if (closeOnSubmitCommentPending) return;

    closeOnSubmitCommentPending = true;
    const previousCount = getPersistedCommentCount();

    // Wait for the comment to actually appear before taking action
    const commentAppeared = await waitForPersistedCommentCountIncrease(previousCount);
    closeOnSubmitCommentPending = false;

    if (!commentAppeared) return;

    if (!chrome.runtime || !chrome.runtime.sendMessage) return;

    if (closeSpeedgraderTabAfterSubmitCommentEnabled) {
      chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
        void chrome.runtime?.lastError;
      });
    }

    if (autoCompleteQueueItemAfterCommentSubmitEnabled) {
      const studentName = getCurrentCanvasStudentFullName();
      if (studentName) {
        chrome.runtime.sendMessage({
          type: CSH_MESSAGE_TYPES.CLICK_QUEUE_COMPLETE_AFTER_COMMENT,
          queuedName: studentName,
          autoOpenNextQueueItemAfterComplete: autoOpenNextQueueItemAfterCompleteEnabled,
        }, () => {
          void chrome.runtime?.lastError;
        });
      }
    }
  }, true);
}

/** Hover popup that appears over the "Submit Comment" button to toggle automation settings. */
const SubmitCommentPopup = (() => {
  let _el = null;
  let _hideTimer = null;
  const HIDE_DELAY_MS = 1500;

  function _isPopup(node) {
    if (!_el || !node) return false;
    return node === _el || (typeof _el.contains === 'function' && _el.contains(node));
  }

  function _isSubmitButton(node) {
    return !!(node && typeof node.closest === 'function' && node.closest('button[data-testid="submit-comment-button"]'));
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

  /** Positions and shows the popup near the submit button. */
  function _show(buttonEl) {
    if (!_el) return;
    const rect = buttonEl.getBoundingClientRect();
    _el.style.left = 'auto';
    _el.style.right = (window.innerWidth - rect.right) + 'px';
    _el.style.top = rect.top + 'px';
    _el.style.display = 'block';
    const cbClose = document.getElementById('csh-close-tab-cb');
    const cbComplete = document.getElementById('csh-complete-queue-cb');
    const cbNext = document.getElementById('csh-open-next-cb');
    if (cbClose) cbClose.checked = closeSpeedgraderTabAfterSubmitCommentEnabled;
    if (cbComplete) cbComplete.checked = autoCompleteQueueItemAfterCommentSubmitEnabled;
    if (cbNext) cbNext.checked = autoOpenNextQueueItemAfterCompleteEnabled;
    _updateQueueCountLabel();
  }

  /** Creates the popup DOM element with three checkboxes. */
  function _create() {
    const el = document.createElement('div');
    el.id = 'csh-submit-popup';
    el.style.cssText = [
      'position:fixed',
      'z-index:99999',
      'background:#fff',
      'border:1px solid #c7cdd1',
      'border-radius:4px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
      'padding:8px 12px',
      'display:none',
      'transform:translateY(calc(-100% - 8px))',
      'min-width:220px',
      'font-size:13px',
      'line-height:1.5',
      'color:#2d3b45',
      'font-family:Lato,LatoWeb,sans-serif',
      'user-select:none',
    ].join(';');

    function makeRow(id, labelText) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;padding:2px 0;white-space:nowrap;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.style.cssText = 'margin:0;cursor:pointer;flex-shrink:0;';
      const span = document.createElement('span');
      span.textContent = labelText;
      label.appendChild(cb);
      label.appendChild(span);
      return label;
    }

    el.appendChild(makeRow('csh-close-tab-cb', 'Close tab on comment submission'));
    el.appendChild(makeRow('csh-complete-queue-cb', 'Click "Complete" in the queue'));

    const nextRow = makeRow('csh-open-next-cb', 'Start next queue submission');
    nextRow.style.flexWrap = 'wrap';
    const countLine = document.createElement('i');
    countLine.id = 'csh-queue-count-line';
    countLine.style.cssText = 'font-style:italic;font-size:12px;color:#888;width:100%;padding-left:20px;white-space:nowrap;';
    countLine.textContent = '(0 more in the queue)';
    nextRow.appendChild(countLine);
    el.appendChild(nextRow);

    // Sync checkbox changes into the live settings
    el.addEventListener('change', (event) => {
      const cb = event.target;
      if (!cb || cb.type !== 'checkbox') return;
      if (cb.id === 'csh-close-tab-cb') {
        closeSpeedgraderTabAfterSubmitCommentEnabled = cb.checked;
      } else if (cb.id === 'csh-complete-queue-cb') {
        autoCompleteQueueItemAfterCommentSubmitEnabled = cb.checked;
      } else if (cb.id === 'csh-open-next-cb') {
        autoOpenNextQueueItemAfterCompleteEnabled = cb.checked;
      }
    });

    document.body.appendChild(el);
    return el;
  }

  function init() {
    if (_el) return;
    if (!document.body) {
      const observer = new MutationObserver(() => {
        if (document.body) {
          observer.disconnect();
          init();
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    _el = _create();

    // Show popup on hover over the submit button
    document.addEventListener('mouseover', (event) => {
      if (_isSubmitButton(event.target)) {
        _cancelHideTimer();
        if (_el.style.display === 'none') {
          const btn = event.target.closest('button[data-testid="submit-comment-button"]');
          _show(btn);
        }
        return;
      }
      if (_isPopup(event.target)) {
        _cancelHideTimer();
      }
    });

    // Hide popup after a delay when leaving the button or popup
    document.addEventListener('mouseout', (event) => {
      if (!_el || _el.style.display === 'none') return;
      const leaving = event.target;
      const entering = event.relatedTarget;
      if (!_isSubmitButton(leaving) && !_isPopup(leaving)) return;
      if (_isSubmitButton(entering) || _isPopup(entering)) return;
      _startHideTimer();
    });
  }

  function _updateQueueCountLabel() {
    if (!_el) return;
    const countLine = document.getElementById('csh-queue-count-line');
    if (!countLine) return;
    if (typeof _queueCount === 'number' && _queueCount >= 0) {
      countLine.textContent = `(${_queueCount} more in the queue)`;
      countLine.style.display = 'block';
    } else {
      countLine.style.display = 'none';
    }
  }

  return { init, updateQueueCountLabel: _updateQueueCountLabel };
})();

/** Loads settings from storage, attaches submit listener, and initialises the popup. */
function initializeCloseOnSubmitCommentSetting() {
  if (!chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) {
    attachCloseOnSubmitCommentListener();
    return;
  }

  chrome.storage.sync.get(SYNCED_SETTINGS, (data) => {
    closeSpeedgraderTabAfterSubmitCommentEnabled = !!data.closeSpeedgraderTabAfterSubmitComment;
    autoCompleteQueueItemAfterCommentSubmitEnabled = !!data.autoCompleteQueueItemAfterCommentSubmit;
    autoOpenNextQueueItemAfterCompleteEnabled = !!data.autoOpenNextQueueItemAfterComplete;
    attachCloseOnSubmitCommentListener();
    SubmitCommentPopup.init();
  });
}

/** Reads the queued queue count from local storage and updates the popup label. */
function initializeQueueCount() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) return;
  chrome.storage.local.get({ queuedQueueCount: null }, (data) => {
    _queueCount = data.queuedQueueCount;
    SubmitCommentPopup.updateQueueCountLabel();
  });
}

initializeCloseOnSubmitCommentSetting();
initializeQueueCount();

// Keep live settings in sync with storage changes
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.queuedQueueCount) {
        _queueCount = changes.queuedQueueCount.newValue;
        SubmitCommentPopup.updateQueueCountLabel();
      }
      return;
    }

    if (areaName !== 'sync') return;
    if (changes.closeSpeedgraderTabAfterSubmitComment) {
      closeSpeedgraderTabAfterSubmitCommentEnabled = !!changes.closeSpeedgraderTabAfterSubmitComment.newValue;
    }
    if (changes.autoCompleteQueueItemAfterCommentSubmit) {
      autoCompleteQueueItemAfterCommentSubmitEnabled = !!changes.autoCompleteQueueItemAfterCommentSubmit.newValue;
    }
    if (changes.autoOpenNextQueueItemAfterComplete) {
      autoOpenNextQueueItemAfterCompleteEnabled = !!changes.autoOpenNextQueueItemAfterComplete.newValue;
    }
  });
}
