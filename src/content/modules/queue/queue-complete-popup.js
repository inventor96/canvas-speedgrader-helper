import { getStudentNameFromRow, getQueueRowFromCompleteButton, getStudentKey } from './queue-helpers.js';
import { SYNCED_SETTINGS } from '@/shared/settings.js';

const _queuePopupStateByStudentName = Object.create(null);
let _defaultAutoOpenNextQueueItemAfterComplete = SYNCED_SETTINGS.autoOpenNextQueueItemAfterComplete;

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

function setStudentQueuePopupState(studentName, patch) {
  const key = getStudentKey(studentName);
  if (!key) return;

  const existing = getStudentQueuePopupState(key);
  _queuePopupStateByStudentName[key] = {
    ...existing,
    ...patch,
  };
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

function setDefaultAutoOpenNext(value) {
  _defaultAutoOpenNextQueueItemAfterComplete = !!value;
}

export { QueueCompletePopup, getStudentQueuePopupState, setStudentQueuePopupState, setDefaultAutoOpenNext };
