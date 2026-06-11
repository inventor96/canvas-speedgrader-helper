/**
 * Base iframe submission adapter
 * 
 * Handles all iframe-based submission types by communicating with iframe content via postMessage.
 * Detects specific iframe type (document renderer, discussion posts, etc.) based on iframe URL
 * and routes requests to the appropriate sub-adapter running inside the iframe.
 */
(() => {
  'use strict';

  const REQUEST_TIMEOUT_MS = 20000;
  const READY_TIMEOUT_MS = 15000;

  /**
   * IframeSubmissionAdapter - Base adapter for iframe-based submissions
   */
  const IframeSubmissionAdapter = {
    // Instance state
    _iframeElement: null,
    _pendingRequests: new Map(), // requestId → {resolve, reject, timeout}

    // Readiness state
    _ready: false,
    _readyCallbacks: [],
    _iframeLoaded: false,
    _childAdapterReady: false,
    _readyTimeoutId: null,
    _readyRequestIntervalId: null,

    /**
     * Check if this adapter can handle the submission
     */
    canHandle(submissionElement) {
      try {
        const iframe = submissionElement.querySelector('iframe');
        return !!iframe;
      } catch (e) {
        return false;
      }
    },

    /**
     * Register a callback to be called when the adapter is fully ready.
     * If already ready, the callback is invoked immediately.
     * @param {Function} callback - Receives the adapter as the argument
     */
    whenReady(callback) {
      if (this._ready) {
        callback(this);
        return;
      }
      this._readyCallbacks.push(callback);
    },

    /**
     * Mark the adapter as ready and drain pending callbacks
     * @private
     */
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

    /**
     * Initialize adapter with submission element
     */
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

    /**
     * Monitor iframe content readiness: listens for both the iframe load
     * event and the child adapter's ready message.
     * @private
     */
    _waitForIframeReady() {
      // Condition 1: iframe src has loaded (browser-level content load)
      const checkIframeLoaded = () => {
        if (this._iframeLoaded) return;
        this._iframeLoaded = true;
        this._checkBothReady();
      };

      // If the iframe already loaded before we set up the listener
      let readyState;
      try {
        readyState = this._iframeElement.contentDocument?.readyState;
      } catch (e) {
        // cross-origin iframe, wait for load event
      }
      if (readyState === 'complete' || readyState === 'interactive') {
        this._iframeLoaded = true;
      } else {
        this._iframeElement.addEventListener('load', checkIframeLoaded, { once: true });
      }

      // Condition 2: child adapter script loaded and sent ready message
      // Handled via _setupMessageListener's ADAPTER_READY handling
      this._startReadyRequests();
      this._startReadyTimeout();
      this._checkBothReady();
    },

    /**
     * Check if both conditions are satisfied and mark ready
     * @private
     */
    _checkBothReady() {
      if (this._childAdapterReady) {
        this._markReady();
      }
    },

    /**
     * Confirm to the iframe loader that readiness was received.
     * @private
     */
    _sendReadyAck() {
      if (!this._iframeElement || !this._iframeElement.contentWindow) {
        return;
      }

      try {
        this._iframeElement.contentWindow.postMessage({
          type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_ACK,
        }, '*');
      } catch (e) {
        // Ignore
      }
    },

    /**
     * Ask the iframe content loader to repeat its ready signal.
     * @private
     */
    _startReadyRequests() {
      const sendReadyRequest = () => {
        if (this._ready || !this._iframeElement || !this._iframeElement.contentWindow) {
          return;
        }
        try {
          this._iframeElement.contentWindow.postMessage({
            type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST,
          }, '*');
        } catch (e) {
          // Ignore
        }
      };

      sendReadyRequest();
      this._readyRequestIntervalId = setInterval(sendReadyRequest, 1000);
    },

    /**
     * Log useful diagnostics if the child iframe adapter never announces readiness.
     * @private
     */
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

    /**
     * Get text from submission via iframe
     */
    async getText() {
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          this._sendIframeRequest('getText', {}).then(resolve).catch(reject);
        });
      });
    },

    /**
     * Apply highlights to submission via iframe
     */
    async applyHighlights(ranges, cssHighlightName) {
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          this._sendIframeRequest('applyHighlights', { ranges, cssHighlightName }).then(resolve).catch(reject);
        });
      });
    },

    /**
     * Scroll element into view via iframe
     */
    async scrollIntoView(selector, options = {}) {
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          this._sendIframeRequest('scrollIntoView', { selector, options }).then(resolve).catch(reject);
        });
      });
    },

    /**
     * Send request to iframe and wait for response
     * @private
     */
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

    /**
     * Set up listener for iframe responses and adapter-ready signal
     * @private
     */
    _setupMessageListener() {
      // Use arrow function to preserve 'this' context
      const handleMessage = (event) => {
        try {
          // Only process messages from the iframe
          if (!this._iframeElement || event.source !== this._iframeElement.contentWindow) {
            return;
          }

          const msg = event.data;
          if (!msg || !msg.type) {
            return;
          }

          // Handle child adapter ready signal
          if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY) {
            this._sendReadyAck();
            if (this._childAdapterReady) {
              return;
            }
            this._childAdapterReady = true;
            this._checkBothReady();
            return;
          }

          // Handle submission operation responses
          if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE) {
            return;
          }

          const { requestId, success, result, error } = msg;
          const pending = this._pendingRequests.get(requestId);
          if (!pending) {
            return; // Request already timed out or response already received
          }

          this._pendingRequests.delete(requestId);
          clearTimeout(pending.timeoutId);

          if (success) {
            pending.resolve(result);
          } else {
            pending.reject(new Error(error || 'IframeSubmissionAdapter: unknown error'));
          }
        } catch (e) {
          // Ignore message processing errors
        }
      };

      // Store listener so we can remove it later if needed
      if (!this._messageListenerAttached) {
        window.addEventListener('message', handleMessage);
        this._messageListenerAttached = true;
        this._handleMessage = handleMessage;
      }
    },

    /**
     * Clean up resources
     */
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

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.CSH_IframeSubmissionAdapter = IframeSubmissionAdapter;
  }
})();
