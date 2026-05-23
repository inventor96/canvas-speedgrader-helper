/**
 * Base iframe submission adapter
 * 
 * Handles all iframe-based submission types by communicating with iframe content via postMessage.
 * Detects specific iframe type (document renderer, discussion posts, etc.) based on iframe URL
 * and routes requests to the appropriate sub-adapter running inside the iframe.
 */
(() => {
  'use strict';

  const REQUEST_TIMEOUT_MS = 5000;
  const IFRAME_CONTAINER_SELECTOR = '.speedgrader-preview-frame';

  /**
   * IframeSubmissionAdapter - Base adapter for iframe-based submissions
   */
  const IframeSubmissionAdapter = {
    // Instance state
    _iframeElement: null,
    _pendingRequests: new Map(), // requestId → {resolve, reject, timeout}

    /**
     * Check if this adapter can handle the submission
     */
    canHandle(submissionElement) {
      try {
        const iframe = submissionElement.querySelector('iframe');
        return !!(iframe && iframe.src);
      } catch (e) {
        return false;
      }
    },

    /**
     * Initialize adapter with submission element
     */
    init(submissionElement) {
      this._iframeElement = submissionElement.querySelector('iframe');
      if (!this._iframeElement) {
        throw new Error('IframeSubmissionAdapter: No iframe found in submission element');
      }
      this._setupMessageListener();
    },

    /**
     * Get text from submission via iframe
     */
    async getText() {
      return this._sendIframeRequest('getText', {});
    },

    /**
     * Apply highlights to submission via iframe
     */
    async applyHighlights(ranges, cssHighlightName) {
      return this._sendIframeRequest('applyHighlights', { ranges, cssHighlightName });
    },

    /**
     * Scroll element into view via iframe
     */
    async scrollIntoView(selector, options = {}) {
      return this._sendIframeRequest('scrollIntoView', { selector, options });
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
     * Set up listener for iframe responses
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
          if (!msg || msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE) {
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
    },
  };

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.CSH_IframeSubmissionAdapter = IframeSubmissionAdapter;
  }
})();
