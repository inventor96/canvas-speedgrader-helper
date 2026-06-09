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
      console.warn('[CSH] Unknown iframe type:', iframeType);
      if (onReady) onReady(new Error('Unknown iframe type'));
      return;
    }

    const adapter = getAdapter(adapterName);
    if (!adapter) {
      console.error('[CSH] Adapter script is not loaded in iframe content context:', adapterName);
      if (onReady) onReady(new Error(`Adapter script not loaded: ${adapterName}`));
      return;
    }

    console.log('[CSH] Iframe adapter available in content context:', adapterName);
    setupMessageListener(adapterName);
    console.log('[CSH] Iframe submission adapter ready:', adapterName);
    if (onReady) onReady(null, adapterName);
  }

  /**
   * Set up message listener to route requests to adapter
   */
  function setupMessageListener(adapterName) {
    if (typeof window === 'undefined') {
      return;
    }

    console.log('[CSH] Attaching message listener for adapter:', adapterName);
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
          stopReadyNotifications('acknowledged by parent');
          return;
        }

        if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST) {
          console.log('[CSH] Received ready request from parent; re-sending ready signal for:', adapterName);
          notifyParentReady(adapterName, 'requested');
          return;
        }

        if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST) {
          return;
        }

        console.log('[CSH] Received request from parent:', msg.action, '(requestId:', msg.requestId, ')');

        // Get the adapter from global scope
        const adapter = getAdapter(adapterName);

        if (!adapter) {
          console.error('[CSH] Adapter not found on window:', adapterName);
          sendError(msg.requestId, `Adapter not found: ${adapterName}`);
          return;
        }

        // Handle the request
        handleRequest(adapter, msg);
      } catch (e) {
        console.error('[CSH] Error in iframe message listener:', e);
      }
    });
  }

  /**
   * Handle request from dispatcher
   */
  async function handleRequest(adapter, msg) {
    const { requestId, action, params } = msg;

    console.log('[CSH] Processing request:', action, '- delegating to adapter');
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
        console.log('[CSH] Awaiting async result for:', action);
        result = await result;
      }

      console.log('[CSH] Request completed:', action, '(requestId:', requestId, ')');
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
      console.log('[CSH] Sending success response to parent (requestId:', requestId, ')');
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
      console.log('[CSH] Sending error response to parent (requestId:', requestId, '):', error);
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
  function notifyParentReady(adapterName, reason) {
    if (window.parent) {
      console.log('[CSH] Notifying parent that adapter is ready:', adapterName, reason ? `(${reason})` : '');
      window.parent.postMessage({
        type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY,
        adapterName,
      }, '*');
    }
  }

  function stopReadyNotifications(reason) {
    if (readyNotificationIntervalId === null) {
      return;
    }

    clearInterval(readyNotificationIntervalId);
    readyNotificationIntervalId = null;
    console.log('[CSH] Stopped ready notifications:', reason);
  }

  /**
   * Repeat the ready notification so the parent does not miss a one-time signal.
   */
  function startReadyNotifications(adapterName) {
    let attempts = 0;
    const maxAttempts = 20;

    stopReadyNotifications('restarting');
    notifyParentReady(adapterName, 'initial');
    readyNotificationIntervalId = setInterval(() => {
      attempts += 1;
      notifyParentReady(adapterName, `retry ${attempts}`);
      if (attempts >= maxAttempts) {
        stopReadyNotifications('max retries reached');
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
        console.log('[CSH] Iframe content loader: URL is not a recognized submission iframe type:', window.location.href);
        return;
      }

      console.log('[CSH] Detected iframe type:', iframeType);

      const adapterName = getAdapterName(iframeType);
      if (!adapterName) {
        console.warn('[CSH] No adapter for iframe type:', iframeType);
        return;
      }

      // Confirm adapter script availability; on success, message listener is set up
      // Notify parent so it knows requests will be handled
      loadAdapter(iframeType, (err, loadedAdapterName) => {
        if (err) {
          console.error('[CSH] Failed to load adapter:', err.message);
          return;
        }
        startReadyNotifications(loadedAdapterName);
      });
    } catch (e) {
      console.error('[CSH] Iframe content loader initialization failed:', e);
    }
  }

  // Initialize when document is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
