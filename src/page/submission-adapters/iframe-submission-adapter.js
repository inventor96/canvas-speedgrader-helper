import { CSH_MESSAGE_TYPES } from '../../shared/message-types.js';

const REQUEST_TIMEOUT_MS = 20000;
const READY_TIMEOUT_MS = 15000;

export const IframeSubmissionAdapter = {
  _iframeElement: null,
  _pendingRequests: new Map(),
  _ready: false,
  _readyCallbacks: [],
  _iframeLoaded: false,
  _childAdapterReady: false,
  _readyTimeoutId: null,
  _readyRequestIntervalId: null,

  canHandle(submissionElement) {
    try {
      const iframe = submissionElement.querySelector('iframe');
      return !!iframe;
    } catch (e) {
      return false;
    }
  },

  whenReady(callback) {
    if (this._ready) {
      callback(this);
      return;
    }
    this._readyCallbacks.push(callback);
  },

  _markReady() {
    if (this._ready) return;
    this._ready = true;
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }
    if (this._readyRequestIntervalId !== null) {
      clearInterval(this._readyRequestIntervalId);
      this._readyRequestIntervalId = null;
    }
    const cbs = this._readyCallbacks;
    this._readyCallbacks = [];
    cbs.forEach((cb) => cb(this));
  },

  init(submissionElement) {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }
    if (this._readyRequestIntervalId !== null) {
      clearInterval(this._readyRequestIntervalId);
      this._readyRequestIntervalId = null;
    }
    this._ready = false;
    this._iframeLoaded = false;
    this._childAdapterReady = false;
    this._iframeElement = submissionElement.querySelector('iframe');
    if (!this._iframeElement) {
      throw new Error('IframeSubmissionAdapter: No iframe found in submission element');
    }
    this._setupMessageListener();
    this._waitForIframeReady();
  },

  _waitForIframeReady() {
    const checkIframeLoaded = () => {
      if (this._iframeLoaded) return;
      this._iframeLoaded = true;
      this._checkBothReady();
    };

    let readyState;
    try {
      readyState = this._iframeElement.contentDocument?.readyState;
    } catch (e) {}
    if (readyState === 'complete' || readyState === 'interactive') {
      this._iframeLoaded = true;
    } else {
      this._iframeElement.addEventListener('load', checkIframeLoaded, { once: true });
    }

    this._startReadyRequests();
    this._startReadyTimeout();
    this._checkBothReady();
  },

  _checkBothReady() {
    if (this._childAdapterReady) {
      this._markReady();
    }
  },

  _sendReadyAck() {
    if (!this._iframeElement || !this._iframeElement.contentWindow) {
      return;
    }

    try {
      this._iframeElement.contentWindow.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_ACK,
      }, '*');
    } catch (e) {}
  },

  _startReadyRequests() {
    const sendReadyRequest = () => {
      if (this._ready || !this._iframeElement || !this._iframeElement.contentWindow) {
        return;
      }
      try {
        this._iframeElement.contentWindow.postMessage({
          type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST,
        }, '*');
      } catch (e) {}
    };

    sendReadyRequest();
    this._readyRequestIntervalId = setInterval(sendReadyRequest, 1000);
  },

  _startReadyTimeout() {
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
    }

    this._readyTimeoutId = setTimeout(() => {
      if (this._ready) return;
      if (this._readyRequestIntervalId !== null) {
        clearInterval(this._readyRequestIntervalId);
        this._readyRequestIntervalId = null;
      }
    }, READY_TIMEOUT_MS);
  },

  async getText() {
    return new Promise((resolve, reject) => {
      this.whenReady(() => {
        this._sendIframeRequest('getText', {}).then(resolve).catch(reject);
      });
    });
  },

  async applyHighlights(ranges, cssHighlightName) {
    return new Promise((resolve, reject) => {
      this.whenReady(() => {
        this._sendIframeRequest('applyHighlights', { ranges, cssHighlightName }).then(resolve).catch(reject);
      });
    });
  },

  async scrollIntoView(selector, options = {}) {
    return new Promise((resolve, reject) => {
      this.whenReady(() => {
        this._sendIframeRequest('scrollIntoView', { selector, options }).then(resolve).catch(reject);
      });
    });
  },

  _sendIframeRequest(action, params) {
    return new Promise((resolve, reject) => {
      if (!this._iframeElement || !this._iframeElement.contentWindow) {
        reject(new Error('IframeSubmissionAdapter: iframe is not accessible'));
        return;
      }

      const requestId = `iframe_req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timeoutId = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(new Error(`IframeSubmissionAdapter: request timeout (${action})`));
      }, REQUEST_TIMEOUT_MS);

      this._pendingRequests.set(requestId, { resolve, reject, timeoutId });

      try {
        this._iframeElement.contentWindow.postMessage({
          type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST,
          requestId,
          action,
          params,
        }, '*');
      } catch (e) {
        this._pendingRequests.delete(requestId);
        clearTimeout(timeoutId);
        reject(new Error(`IframeSubmissionAdapter: failed to send message: ${e.message}`));
      }
    });
  },

  _setupMessageListener() {
    const handleMessage = (event) => {
      try {
        if (!this._iframeElement || event.source !== this._iframeElement.contentWindow) {
          return;
        }

        const msg = event.data;
        if (!msg || !msg.type) {
          return;
        }

        if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY) {
          this._sendReadyAck();
          if (this._childAdapterReady) {
            return;
          }
          this._childAdapterReady = true;
          this._checkBothReady();
          return;
        }

        if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE) {
          return;
        }

        const { requestId, success, result, error } = msg;
        const pending = this._pendingRequests.get(requestId);
        if (!pending) {
          return;
        }

        this._pendingRequests.delete(requestId);
        clearTimeout(pending.timeoutId);

        if (success) {
          pending.resolve(result);
        } else {
          pending.reject(new Error(error || 'IframeSubmissionAdapter: unknown error'));
        }
      } catch (e) {}
    };

    if (!this._messageListenerAttached) {
      window.addEventListener('message', handleMessage);
      this._messageListenerAttached = true;
      this._handleMessage = handleMessage;
    }
  },

  destroy() {
    if (this._messageListenerAttached && this._handleMessage) {
      window.removeEventListener('message', this._handleMessage);
      this._messageListenerAttached = false;
    }
    this._pendingRequests.clear();
    this._iframeElement = null;
    this._ready = false;
    this._readyCallbacks = [];
    this._iframeLoaded = false;
    this._childAdapterReady = false;
    if (this._readyTimeoutId !== null) {
      clearTimeout(this._readyTimeoutId);
      this._readyTimeoutId = null;
    }
    if (this._readyRequestIntervalId !== null) {
      clearInterval(this._readyRequestIntervalId);
      this._readyRequestIntervalId = null;
    }
  },
};
