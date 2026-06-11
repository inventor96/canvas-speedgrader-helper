/**
 * Iframe Content Loader
 * 
 * Content script that runs inside iframe contexts (canvadocs.instructure.com, etc.)
 * Detects iframe type based on current URL and connects to the appropriate submission adapter.
 * Sets up postMessage communication channel for dispatcher requests.
 */
(() => {
  'use strict';

  let readyNotificationIntervalId = null;

  /**
   * Detect iframe type based on current URL
   */
  function detectIframeType() {
    const url = window.location.href || '';
    
    // Document renderer (Canvadoc)
    if (url.includes('canvasdocs.instructure.com') || url.includes('canvadocs.instructure.com')) {
      return 'document-renderer';
    }

    if (url.includes('instructure.com') && url.includes('/api/v1/canvadoc_session')) {
      return 'document-renderer';
    }

    // Discussion posts (byupw or other Canvas instances)
    if (url.includes('instructure.com') && (url.includes('/courses/') || url.includes('/assignments/'))) {
      if (url.includes('submission') && (url.includes('preview=1') || url.includes('version=0'))) {
        return 'discussion-posts';
      }
    }

    return null;
  }

  /**
   * Get the adapter name for the iframe type
   */
  function getAdapterName(iframeType) {
    const mapping = {
      'document-renderer': 'DocumentRendererAdapter',
      'discussion-posts': 'DiscussionPostsAdapter',
    };
    return mapping[iframeType] || null;
  }

  /**
   * Get the already-loaded adapter from this content script's isolated world.
   */
  function getAdapter(adapterName) {
    if (adapterName === 'DocumentRendererAdapter') {
      return window.CSH_DocumentRendererAdapter;
    }
    if (adapterName === 'DiscussionPostsAdapter') {
      return window.CSH_DiscussionPostsAdapter;
    }
    return null;
  }

  /**
   * Confirm the adapter script for this iframe type is available.
   * @param {string} iframeType - The detected iframe type
   * @param {Function} onReady - Callback when adapter is available and listener is set up
   */
  function loadAdapter(iframeType, onReady) {
    const adapterName = getAdapterName(iframeType);
    if (!adapterName) {
      if (onReady) onReady(new Error('Unknown iframe type'));
      return;
    }

    const adapter = getAdapter(adapterName);
    if (!adapter) {
      if (onReady) onReady(new Error(`Adapter script not loaded: ${adapterName}`));
      return;
    }

    setupMessageListener(adapterName);
    if (onReady) onReady(null, adapterName);
  }

  /**
   * Set up message listener to route requests to adapter
   */
  function setupMessageListener(adapterName) {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('message', (event) => {
      try {
        // Only process messages from parent window
        if (event.source !== window.parent) {
          return;
        }

        const msg = event.data;
        if (!msg || !msg.type) {
          return;
        }

        if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_ACK) {
          stopReadyNotifications();
          return;
        }

        if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST) {
          notifyParentReady(adapterName);
          return;
        }

        if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST) {
          return;
        }

        // Get the adapter from global scope
        const adapter = getAdapter(adapterName);

        if (!adapter) {
          sendError(msg.requestId, `Adapter not found: ${adapterName}`);
          return;
        }

        // Handle the request
        handleRequest(adapter, msg);
      } catch (e) {
        // Ignore message processing errors
      }
    });
  }

  /**
   * Handle request from dispatcher
   */
  async function handleRequest(adapter, msg) {
    const { requestId, action, params } = msg;

    try {
      let result;

      if (action === 'getText') {
        result = adapter.getText();
      } else if (action === 'applyHighlights') {
        result = adapter.applyHighlights(params.ranges, params.cssHighlightName);
      } else if (action === 'scrollIntoView') {
        result = adapter.scrollIntoView(params.selector, params.options);
      } else {
        sendError(requestId, `Unknown action: ${action}`);
        return;
      }

      // Handle async results
      if (result instanceof Promise) {
        result = await result;
      }

      if (action === 'getText') {
        const preview = typeof result === 'string' ? result.slice(0, 200) : String(result);
        console.log('[CSH] getText result preview:', preview);
      }
      sendSuccess(requestId, result);
    } catch (e) {
      console.error('[CSH] Request failed:', action, '-', e.message);
      sendError(requestId, e.message || 'Unknown error');
    }
  }

  /**
   * Send success response to parent
   */
  function sendSuccess(requestId, result) {
    if (window.parent) {
      window.parent.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE,
        requestId,
        success: true,
        result,
      }, '*');
    }
  }

  /**
   * Send error response to parent
   */
  function sendError(requestId, error) {
    if (window.parent) {
      window.parent.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_RESPONSE,
        requestId,
        success: false,
        error,
      }, '*');
    }
  }

  /**
   * Notify parent window that the iframe content and adapter are ready
   */
  function notifyParentReady(adapterName) {
    if (window.parent) {
      window.parent.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY,
        adapterName,
      }, '*');
    }
  }

  function stopReadyNotifications() {
    if (readyNotificationIntervalId === null) {
      return;
    }

    clearInterval(readyNotificationIntervalId);
    readyNotificationIntervalId = null;
  }

  /**
   * Repeat the ready notification so the parent does not miss a one-time signal.
   */
  function startReadyNotifications(adapterName) {
    let attempts = 0;
    const maxAttempts = 20;

    stopReadyNotifications();
    notifyParentReady(adapterName);
    readyNotificationIntervalId = setInterval(() => {
      attempts += 1;
      notifyParentReady(adapterName);
      if (attempts >= maxAttempts) {
        stopReadyNotifications();
      }
    }, 500);
  }

  /**
   * Initialize: detect iframe type and load appropriate adapter
   */
  function initialize() {
    try {
      const iframeType = detectIframeType();
      if (!iframeType) {
        return;
      }

      const adapterName = getAdapterName(iframeType);
      if (!adapterName) {
        return;
      }

      // Confirm adapter script availability; on success, message listener is set up
      // Notify parent so it knows requests will be handled
      loadAdapter(iframeType, (err, loadedAdapterName) => {
        if (err) {
          return;
        }
        startReadyNotifications(loadedAdapterName);
      });
    } catch (e) {
      // Ignore initialization errors
    }
  }

  // Initialize when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
