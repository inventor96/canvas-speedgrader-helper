import { CSH_MESSAGE_TYPES } from '../shared/message-types.js';
import { HIGHLIGHT_CONFIG } from '../page/submission-adapters/highlight-config.js';
import { DocumentRendererAdapter } from '../page/submission-adapters/iframe-content/document-renderer-adapter.js';
import { DiscussionPostsAdapter } from '../page/submission-adapters/iframe-content/discussion-posts-adapter.js';

let readyNotificationIntervalId = null;

const ADAPTER_MAP = {
  'document-renderer': DocumentRendererAdapter,
  'discussion-posts': DiscussionPostsAdapter,
};

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

function getAdapterName(iframeType) {
  const mapping = {
    'document-renderer': 'DocumentRendererAdapter',
    'discussion-posts': 'DiscussionPostsAdapter',
  };
  return mapping[iframeType] || null;
}

function getAdapter(adapterName) {
  return ADAPTER_MAP[adapterName] || null;
}

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

      const adapter = getAdapter(adapterName);

      if (!adapter) {
        sendError(msg.requestId, `Adapter not found: ${adapterName}`);
        return;
      }

      handleRequest(adapter, msg);
    } catch (e) {}
  });
}

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
