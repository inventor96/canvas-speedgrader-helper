import { CSH_MESSAGE_TYPES } from '../../shared/message-types.js';
import { observeUntil } from '../../shared/observe-until.js';
import { getCurrentCanvasStudentFullName } from './settings-injector.js';

let closeSpeedgraderTabAfterSubmitCommentEnabled = false;
let autoCompleteQueueItemAfterCommentSubmitEnabled = false;
let autoOpenNextQueueItemAfterCompleteEnabled = false;
let closeOnSubmitCommentListenerAttached = false;
let closeOnSubmitCommentPending = false;

function getPersistedCommentCount() {
  const commentElements = document.querySelectorAll('div[data-testid^="comment-"]');
  return Array.from(commentElements).filter((el) => {
    const testId = el.getAttribute('data-testid') || '';
    return /^comment-\d+$/.test(testId);
  }).length;
}

function waitForPersistedCommentCountIncrease(previousCount, timeoutMs = 15000) {
  return observeUntil(() => getPersistedCommentCount() > previousCount, {
    timeout: timeoutMs,
  });
}

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
  }

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
    el.appendChild(makeRow('csh-open-next-cb', 'Start next queue submission'));

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

    document.addEventListener('mouseout', (event) => {
      if (!_el || _el.style.display === 'none') return;
      const leaving = event.target;
      const entering = event.relatedTarget;
      if (!_isSubmitButton(leaving) && !_isPopup(leaving)) return;
      if (_isSubmitButton(entering) || _isPopup(entering)) return;
      _startHideTimer();
    });
  }

  return { init };
})();

function initializeCloseOnSubmitCommentSetting() {
  if (!chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) {
    attachCloseOnSubmitCommentListener();
    return;
  }

  chrome.storage.sync.get({
    closeSpeedgraderTabAfterSubmitComment: false,
    autoCompleteQueueItemAfterCommentSubmit: false,
    autoOpenNextQueueItemAfterComplete: false,
  }, (data) => {
    closeSpeedgraderTabAfterSubmitCommentEnabled = !!data.closeSpeedgraderTabAfterSubmitComment;
    autoCompleteQueueItemAfterCommentSubmitEnabled = !!data.autoCompleteQueueItemAfterCommentSubmit;
    autoOpenNextQueueItemAfterCompleteEnabled = !!data.autoOpenNextQueueItemAfterComplete;
    attachCloseOnSubmitCommentListener();
    SubmitCommentPopup.init();
  });
}

initializeCloseOnSubmitCommentSetting();

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
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
