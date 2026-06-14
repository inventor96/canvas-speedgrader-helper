import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { HIGHLIGHT_CONFIG } from '@/shared/highlight-config.js';
import { DocumentRendererAdapter } from '@/content/modules/iframe-adapters/document-renderer-adapter.js';
import { DiscussionPostsAdapter } from '@/content/modules/iframe-adapters/discussion-posts-adapter.js';
import { logger } from '@/shared/logger.js';

/** Maps adapter name strings to adapter objects for dynamic lookup. */
const ADAPTER_MAP = {
  'DocumentRendererAdapter': DocumentRendererAdapter,
  'DiscussionPostsAdapter': DiscussionPostsAdapter,
};

let _readyNotificationIntervalId = null;

/** Inspects the iframe URL to determine which adapter to load. */
function detectIframeType() {
  const url = window.location.href || '';

  if (url.includes('canvasdocs.instructure.com') || url.includes('canvadocs.instructure.com')) {
    return 'document-renderer';
  }

  if (url.includes('instructure.com') && url.includes('/api/v1/canvadoc_session')) {
    return 'document-renderer';
  }

  if (url.includes('instructure.com') && (url.includes('/courses/') || url.includes('/assignments/'))) {
    if (url.includes('submission') && (url.includes('preview=1') || url.includes('version=0'))) {
      return 'discussion-posts';
    }
  }

  return null;
}

/** Maps an iframe type string to its adapter class name. */
function getAdapterName(iframeType) {
  const mapping = {
    'document-renderer': 'DocumentRendererAdapter',
    'discussion-posts': 'DiscussionPostsAdapter',
  };
  return mapping[iframeType] || null;
}

/** Looks up an adapter by name from ADAPTER_MAP. */
function getAdapter(adapterName) {
  return ADAPTER_MAP[adapterName] || null;
}

/** Loads the correct adapter for the given iframe type and sets up messaging. */
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

/** Listens for postMessage requests from the parent frame and routes them to the adapter. */
function setupMessageListener(adapterName) {
  if (typeof window === 'undefined') {
    return;
  }

  window.addEventListener('message', (event) => {
    try {
      if (event.source !== window.parent) {
        return;
      }

      const msg = event.data;
      if (!msg || !msg.type) {
        return;
      }

      // Parent is polling for readiness; respond immediately
      if (msg.type === CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_READY_REQUEST) {
        notifyParentReady(adapterName);
        return;
      }

      if (msg.type !== CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_REQUEST) {
        return;
      }

      const adapter = getAdapter(adapterName);

      if (!adapter) {
        sendError(msg.requestId, `Adapter not found: ${adapterName}`);
        return;
      }

      handleRequest(adapter, msg);
    } catch (e) {}
  });
}

/** Dispatches a submission request (getText, applyHighlights, scrollIntoViewByOffset) to the adapter. */
async function handleRequest(adapter, msg) {
  const { requestId, action, params } = msg;

  try {
    let result;

    if (action === 'getText') {
      result = adapter.getText();
    } else if (action === 'applyHighlights') {
      result = adapter.applyHighlights(params.ranges, params.cssHighlightName);
    } else if (action === 'scrollIntoViewByOffset') {
      result = adapter.scrollIntoViewByOffset(params.charOffset, params.options);
    } else {
      sendError(requestId, `Unknown action: ${action}`);
      return;
    }

    if (result instanceof Promise) {
      result = await result;
    }

    if (action === 'getText') {
      const preview = typeof result === 'string' ? result.slice(0, 200) : String(result);
      logger.log('getText result preview:', preview);
    }
    sendSuccess(requestId, result);
  } catch (e) {
    logger.error('Request failed:', action, '-', e.message);
    sendError(requestId, e.message || 'Unknown error');
  }
}

/** Posts a success response back to the parent frame. */
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

/** Posts an error response back to the parent frame. */
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

/** Notifies the parent frame that the adapter is ready to handle requests. */
function notifyParentReady(adapterName) {
  if (window.parent) {
    window.parent.postMessage({
      type: CSH_MESSAGE_TYPES.IFRAME_SUBMISSION_ADAPTER_READY,
      adapterName,
    }, '*');
  }
}

/**
 * Retries ready notifications periodically so the parent does not miss the
 * signal if its listener is attached after the first notification fires.
 */
function startReadyNotifications(adapterName) {
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  stopReadyNotifications();
  notifyParentReady(adapterName);
  _readyNotificationIntervalId = setInterval(() => {
    attempts += 1;
    if (attempts >= MAX_ATTEMPTS) {
      stopReadyNotifications();
      return;
    }
    notifyParentReady(adapterName);
  }, 500);
}

/** Stops the periodic ready notification interval. */
function stopReadyNotifications() {
  if (_readyNotificationIntervalId !== null) {
    clearInterval(_readyNotificationIntervalId);
    _readyNotificationIntervalId = null;
  }
}

/** Detects the iframe type, loads the matching adapter, and starts notifications. */
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

    loadAdapter(iframeType, (err, loadedAdapterName) => {
      if (err) {
        return;
      }
      startReadyNotifications(loadedAdapterName);
    });
  } catch (e) {}
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}
