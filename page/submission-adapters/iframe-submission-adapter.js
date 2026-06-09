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
        const can = !!iframe;
        console.log('[CSH] IframeSubmissionAdapter.canHandle:', can, '(iframe src:', iframe?.src?.slice(0, 80), ')');
        return can;
      } catch (e) {
        console.warn('[CSH] IframeSubmissionAdapter.canHandle error:', e.message);
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
        console.log('[CSH] IframeSubmissionAdapter.whenReady: already ready, calling immediately');
        callback(this);
        return;
      }
      console.log('[CSH] IframeSubmissionAdapter.whenReady: not ready yet, queuing callback');
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
      console.log('[CSH] IframeSubmissionAdapter ready - draining', this._readyCallbacks.length, 'pending callbacks');
      const cbs = this._readyCallbacks;
      this._readyCallbacks = [];
      cbs.forEach((cb) => cb(this));
    },

    /**
     * Initialize adapter with submission element
     */
    init(submissionElement) {
      console.log('[CSH] IframeSubmissionAdapter.init called');
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
      console.log('[CSH] IframeSubmissionAdapter: using iframe src:', this._iframeElement.src || '(empty)');
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
        console.log('[CSH] IframeSubmissionAdapter: iframe load event fired');
        this._iframeLoaded = true;
        this._checkBothReady();
      };

      // If the iframe already loaded before we set up the listener
      let readyState;
      try {
        readyState = this._iframeElement.contentDocument?.readyState;
      } catch (e) {
        console.log('[CSH] IframeSubmissionAdapter: iframe document readyState not readable:', e.message);
      }
      if (readyState === 'complete' || readyState === 'interactive') {
        console.log('[CSH] IframeSubmissionAdapter: iframe already loaded (readyState:', readyState, ')');
        this._iframeLoaded = true;
      } else {
        console.log('[CSH] IframeSubmissionAdapter: waiting for iframe load event (readyState:', readyState, ')');
        this._iframeElement.addEventListener('load', checkIframeLoaded, { once: true });
      }

      // Condition 2: child adapter script loaded and sent ready message
      // Handled via _setupMessageListener's ADAPTER_READY handling
      console.log('[CSH] IframeSubmissionAdapter: waiting for child adapter ready signal');
      this._startReadyRequests();
      this._startReadyTimeout();
      this._checkBothReady();
    },

    /**
     * Check if both conditions are satisfied and mark ready
     * @private
     */
    _checkBothReady() {
      console.log('[CSH] IframeSubmissionAdapter._checkBothReady: iframeLoaded=' + this._iframeLoaded + ', childAdapterReady=' + this._childAdapterReady);
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
        console.log('[CSH] IframeSubmissionAdapter: acknowledged child adapter ready');
      } catch (e) {
        console.warn('[CSH] IframeSubmissionAdapter: failed to acknowledge child ready signal:', e.message);
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
          console.log('[CSH] IframeSubmissionAdapter: requested child ready signal');
        } catch (e) {
          console.warn('[CSH] IframeSubmissionAdapter: failed to request child ready signal:', e.message);
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
        let currentIframeHref = '';
        let currentIframeHrefError = '';
        try {
          currentIframeHref = this._iframeElement?.contentWindow?.location?.href || '';
        } catch (e) {
          currentIframeHrefError = e.message || String(e);
        }
        console.error('[CSH] IframeSubmissionAdapter: timed out waiting for iframe adapter readiness', {
          iframeLoaded: this._iframeLoaded,
          childAdapterReady: this._childAdapterReady,
          iframeSrc: this._iframeElement?.src || '',
          currentIframeHref,
          currentIframeHrefError,
        });
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
      console.log('[CSH] IframeSubmissionAdapter.getText called');
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          console.log('[CSH] IframeSubmissionAdapter.getText: adapter ready, sending request');
          this._sendIframeRequest('getText', {}).then(resolve).catch(reject);
        });
      });
    },

    /**
     * Apply highlights to submission via iframe
     */
    async applyHighlights(ranges, cssHighlightName) {
      console.log('[CSH] IframeSubmissionAdapter.applyHighlights called');
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          console.log('[CSH] IframeSubmissionAdapter.applyHighlights: adapter ready, sending request');
          this._sendIframeRequest('applyHighlights', { ranges, cssHighlightName }).then(resolve).catch(reject);
        });
      });
    },

    /**
     * Scroll element into view via iframe
     */
    async scrollIntoView(selector, options = {}) {
      console.log('[CSH] IframeSubmissionAdapter.scrollIntoView called');
      return new Promise((resolve, reject) => {
        this.whenReady(() => {
          console.log('[CSH] IframeSubmissionAdapter.scrollIntoView: adapter ready, sending request');
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
        console.log('[CSH] IframeSubmissionAdapter: sending request:', action, '(requestId:', requestId, ')');
        const timeoutId = setTimeout(() => {
          this._pendingRequests.delete(requestId);
          console.error('[CSH] IframeSubmissionAdapter: request timeout:', action, '(requestId:', requestId, ')');
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
          console.log('[CSH] IframeSubmissionAdapter: posted message to iframe contentWindow');
        } catch (e) {
          this._pendingRequests.delete(requestId);
          clearTimeout(timeoutId);
          console.error('[CSH] IframeSubmissionAdapter: failed to post message:', e.message);
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
            console.log('[CSH] IframeSubmissionAdapter: child adapter ready:', msg.adapterName);
            this._checkBothReady();
            return;
          }

          // Handle submission operation responses
          if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE) {
            return;
          }

          const { requestId, success, result, error } = msg;
          console.log('[CSH] IframeSubmissionAdapter: received response (requestId:', requestId, ', success:', success, ')');
          const pending = this._pendingRequests.get(requestId);
          if (!pending) {
            console.log('[CSH] IframeSubmissionAdapter: orphaned response (already timed out or duplicate)');
            return; // Request already timed out or response already received
          }

          this._pendingRequests.delete(requestId);
          clearTimeout(pending.timeoutId);

          if (success) {
            console.log('[CSH] IframeSubmissionAdapter: resolving request:', requestId);
            pending.resolve(result);
          } else {
            console.log('[CSH] IframeSubmissionAdapter: rejecting request:', requestId, '-', error);
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
