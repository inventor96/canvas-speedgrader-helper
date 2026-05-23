/**
 * Iframe Content Loader
 * 
 * Content script that runs inside iframe contexts (canvasdocs.instructure.com, etc.)
 * Detects iframe type based on current URL and injects appropriate submission adapter.
 * Sets up postMessage communication channel for dispatcher requests.
 */
(() => {
  'use strict';

  /**
   * Detect iframe type based on current URL
   */
  function detectIframeType() {
    const url = window.location.href || '';
    
    // Document renderer (canvasdocs)
    if (url.includes('canvasdocs.instructure.com')) {
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
   * Load adapter script based on iframe type
   */
  function loadAdapter(iframeType) {
    const adapterName = getAdapterName(iframeType);
    if (!adapterName) {
      console.warn('[CSH] Unknown iframe type:', iframeType);
      return false;
    }

    // Build the script path based on adapter type
    let scriptPath;
    if (iframeType === 'document-renderer') {
      scriptPath = 'page/submission-adapters/iframe-content/document-renderer-adapter.js';
    } else if (iframeType === 'discussion-posts') {
      scriptPath = 'page/submission-adapters/iframe-content/discussion-posts-adapter.js';
    }

    if (!scriptPath) {
      console.warn('[CSH] No script path for adapter:', adapterName);
      return false;
    }

    // Inject script into iframe (this script is running inside the iframe already)
    // We need to use chrome.runtime.getURL to get the extension URL
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      const scriptEl = document.createElement('script');
      scriptEl.src = chrome.runtime.getURL(scriptPath);
      scriptEl.type = 'text/javascript';
      (document.head || document.documentElement).appendChild(scriptEl);
      return true;
    } else {
      console.warn('[CSH] chrome.runtime not available in iframe');
      return false;
    }
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
        if (!msg || msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST) {
          return;
        }

        // Get the adapter from global scope
        let adapter;
        if (adapterName === 'DocumentRendererAdapter') {
          adapter = window.CSH_DocumentRendererAdapter;
        } else if (adapterName === 'DiscussionPostsAdapter') {
          adapter = window.CSH_DiscussionPostsAdapter;
        }

        if (!adapter) {
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

      sendSuccess(requestId, result);
    } catch (e) {
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
   * Initialize: detect iframe type and load appropriate adapter
   */
  function initialize() {
    try {
      const iframeType = detectIframeType();
      if (!iframeType) {
        // Not a recognized submission iframe type, exit silently
        return;
      }

      console.log('[CSH] Detected iframe type:', iframeType);

      const adapterName = getAdapterName(iframeType);
      if (!adapterName) {
        console.warn('[CSH] No adapter for iframe type:', iframeType);
        return;
      }

      // Load adapter script
      if (!loadAdapter(iframeType)) {
        console.error('[CSH] Failed to load adapter:', adapterName);
        return;
      }

      // Wait for adapter to be loaded, then set up message listener
      // Give the injected script time to execute
      setTimeout(() => {
        setupMessageListener(adapterName);
        console.log('[CSH] Iframe submission adapter ready:', adapterName);
      }, 100);
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
