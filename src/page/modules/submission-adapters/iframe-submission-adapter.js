import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';

const REQUEST_TIMEOUT_MS = 20000;

let _iframeElement = null;
const _pendingRequests = new Map();
let _ready = false;
let _readyCallbacks = [];
let _iframeLoaded = false;
let _childAdapterReady = false;
let _messageListenerAttached = false;
let _handleMessage = null;

export function canHandle(submissionElement) {
  try {
    const iframe = submissionElement.querySelector('iframe');
    return !!iframe;
  } catch (e) {
    return false;
  }
}

export function whenReady(callback) {
  if (_ready) {
    callback();
    return;
  }
  _readyCallbacks.push(callback);
}

function markReady() {
  if (_ready) return;
  _ready = true;
  const cbs = _readyCallbacks;
  _readyCallbacks = [];
  cbs.forEach((cb) => cb());
}

export function init(submissionElement) {
  _ready = false;
  _iframeLoaded = false;
  _childAdapterReady = false;
  _iframeElement = submissionElement.querySelector('iframe');
  if (!_iframeElement) {
    throw new Error('IframeSubmissionAdapter: No iframe found in submission element');
  }
  setupMessageListener();
  waitForIframeReady();
}

function waitForIframeReady() {
  const checkIframeLoaded = () => {
    if (_iframeLoaded) return;
    _iframeLoaded = true;
    checkBothReady();
  };

  let readyState;
  try {
    readyState = _iframeElement.contentDocument?.readyState;
  } catch (e) {}
  if (readyState === 'complete' || readyState === 'interactive') {
    _iframeLoaded = true;
  } else {
    _iframeElement.addEventListener('load', checkIframeLoaded, { once: true });
  }

  // Send one ready request to prompt the child adapter to respond
  sendReadyRequest();
  checkBothReady();
}

function sendReadyRequest() {
  if (!_iframeElement || !_iframeElement.contentWindow) {
    return;
  }
  try {
    _iframeElement.contentWindow.postMessage({
      type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST,
    }, '*');
  } catch (e) {}
}

function checkBothReady() {
  if (_childAdapterReady) {
    markReady();
  }
}

export function getText() {
  return new Promise((resolve, reject) => {
    whenReady(() => {
      sendIframeRequest('getText', {}).then(resolve).catch(reject);
    });
  });
}

export function applyHighlights(ranges, cssHighlightName) {
  return new Promise((resolve, reject) => {
    whenReady(() => {
      sendIframeRequest('applyHighlights', { ranges, cssHighlightName }).then(resolve).catch(reject);
    });
  });
}

export function scrollIntoViewByOffset(charOffset, options = {}) {
  return new Promise((resolve, reject) => {
    whenReady(() => {
      sendIframeRequest('scrollIntoViewByOffset', { charOffset, options }).then(resolve).catch(reject);
    });
  });
}

function sendIframeRequest(action, params) {
  return new Promise((resolve, reject) => {
    if (!_iframeElement || !_iframeElement.contentWindow) {
      reject(new Error('IframeSubmissionAdapter: iframe is not accessible'));
      return;
    }

    const requestId = `iframe_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timeoutId = setTimeout(() => {
      _pendingRequests.delete(requestId);
      reject(new Error(`IframeSubmissionAdapter: request timeout (${action})`));
    }, REQUEST_TIMEOUT_MS);

    _pendingRequests.set(requestId, { resolve, reject, timeoutId });

    try {
      _iframeElement.contentWindow.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST,
        requestId,
        action,
        params,
      }, '*');
    } catch (e) {
      _pendingRequests.delete(requestId);
      clearTimeout(timeoutId);
      reject(new Error(`IframeSubmissionAdapter: failed to send message: ${e.message}`));
    }
  });
}

function setupMessageListener() {
  _handleMessage = (event) => {
    try {
      if (!_iframeElement || event.source !== _iframeElement.contentWindow) {
        return;
      }

      const msg = event.data;
      if (!msg || !msg.type) {
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY) {
        if (_childAdapterReady) {
          return;
        }
        _childAdapterReady = true;
        checkBothReady();
        return;
      }

      if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE) {
        return;
      }

      const { requestId, success, result, error } = msg;
      const pending = _pendingRequests.get(requestId);
      if (!pending) {
        return;
      }

      _pendingRequests.delete(requestId);
      clearTimeout(pending.timeoutId);

      if (success) {
        pending.resolve(result);
      } else {
        pending.reject(new Error(error || 'IframeSubmissionAdapter: unknown error'));
      }
    } catch (e) {}
  };

  if (!_messageListenerAttached) {
    window.addEventListener('message', _handleMessage);
    _messageListenerAttached = true;
  }
}

export function destroy() {
  if (_messageListenerAttached && _handleMessage) {
    window.removeEventListener('message', _handleMessage);
    _messageListenerAttached = false;
  }
  _pendingRequests.clear();
  _iframeElement = null;
  _ready = false;
  _readyCallbacks = [];
  _iframeLoaded = false;
  _childAdapterReady = false;
}

export const IframeSubmissionAdapter = { canHandle, init, whenReady, getText, applyHighlights, scrollIntoViewByOffset, destroy };
