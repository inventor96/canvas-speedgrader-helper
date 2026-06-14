// Dispatches submission rendering to the correct adapter (iframe, document, discussion)
import { logger } from '@/shared/logger.js';
import { observeUntil } from '@/shared/observe-until.js';
import { IframeSubmissionAdapter } from './submission-adapters/iframe-submission-adapter.js';

// DOM selector and timeout for the submission preview container
const SUBMISSION_CONTAINER_SELECTOR = 'article.speedgrader-preview-frame';
const SUBMISSION_WAIT_TIMEOUT_MS = 15000;

// Internal state — registered adapters, active instance, init flags
const _adapters = [];
let _activeAdapter = null;
let _submissionElement = null;
let _isInitialized = false;
let _initStarted = false;
let _initPromise = null;
let _builtinAdaptersRegistered = false;
let _ready = false;
const _readyCallbacks = [];

/** Register a callback to run once the dispatcher is ready with an active adapter */
export function whenReady(callback) {
  if (_ready) {
    callback(createApi());
    return;
  }
  _readyCallbacks.push(callback);
  startInit();
}

/** Build the public API object wrapping the currently active adapter */
function createApi() {
  const adapter = _activeAdapter;
  return {
    /** Get full text content from the current submission */
    getText: () => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.getText().then((result) => {
        return result;
      }).catch((err) => {
        logger.error('SubmissionDispatcher API: getText rejected:', err.message);
        throw err;
      });
    },
    /** Apply highlight ranges to the submission using the given CSS class */
    applyHighlights: (ranges, cssHighlightName) => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.applyHighlights(ranges, cssHighlightName).then((result) => {
        return result;
      }).catch((err) => {
        logger.error('SubmissionDispatcher API: applyHighlights rejected:', err.message);
        throw err;
      });
    },
    /** Scroll the text at the given character offset to 25% from viewport top */
    scrollIntoViewByOffset: (charOffset, options = {}) => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.scrollIntoViewByOffset(charOffset, options).then((result) => {
        return result;
      }).catch((err) => {
        logger.error('SubmissionDispatcher API: scrollIntoViewByOffset rejected:', err.message);
        throw err;
      });
    },
  };
}

/** Mark dispatcher as ready and trigger all pending callbacks */
function markReady() {
  if (_ready) return;
  _ready = true;
  const cbs = _readyCallbacks.slice();
  _readyCallbacks.length = 0;
  const api = createApi();
  cbs.forEach((cb) => cb(api));
}

/** Kick off the one-time initialization sequence */
function startInit() {
  if (_initStarted) return;
  _initStarted = true;

  _initPromise = (async () => {
    try {
      // Wait for the submission preview container to appear in the DOM
      _submissionElement = await waitForSubmissionElement(SUBMISSION_CONTAINER_SELECTOR);
      if (!_submissionElement) {
        throw new Error('SubmissionDispatcher: Submission element not found');
      }

      // Register built-in adapters (iframe, document, discussion)
      registerBuiltinAdapters();

      // Pick the first adapter that can handle this submission type
      const adapter = selectAdapter();
      if (!adapter) {
        throw new Error('SubmissionDispatcher: No adapter found for current submission type');
      }

      // Initialize the chosen adapter and mark ready when its sub-initialization completes
      adapter.init(_submissionElement);
      _activeAdapter = adapter;
      _isInitialized = true;

      if (typeof adapter.whenReady === 'function') {
        adapter.whenReady(() => {
          markReady();
        });
      } else {
        markReady();
      }
    } catch (e) {
      logger.error('SubmissionDispatcher initialization failed:', e.message);
      // Allow retry on next whenReady call
      _initStarted = false;
    }
  })();

  return _initPromise;
}

/** Wait for the submission container element to appear in the DOM */
function waitForSubmissionElement(selector) {
  return observeUntil(() => document.querySelector(selector), {
    timeout: SUBMISSION_WAIT_TIMEOUT_MS,
    rejectOnTimeout: true,
    timeoutError: 'SubmissionDispatcher: Submission element not found',
  });
}

/** Register a new adapter (must implement canHandle()) */
function registerAdapter(adapter) {
  if (!adapter || typeof adapter.canHandle !== 'function') {
    throw new Error('SubmissionDispatcher: Invalid adapter - must implement canHandle()');
  }
  _adapters.push(adapter);
}

/** Register built-in adapters (currently only IframeSubmissionAdapter) */
function registerBuiltinAdapters() {
  if (_builtinAdaptersRegistered) {
    return;
  }

  if (typeof IframeSubmissionAdapter !== 'undefined') {
    registerAdapter(IframeSubmissionAdapter);
  }
  _builtinAdaptersRegistered = true;
}

/** Select the first registered adapter that can handle the current submission element */
function selectAdapter() {
  if (!_submissionElement) {
    return null;
  }

  for (let i = 0; i < _adapters.length; i++) {
    try {
      if (_adapters[i].canHandle(_submissionElement)) {
        return _adapters[i];
      }
    } catch (e) {
      // Adapter threw during canHandle — skip it
    }
  }

  return null;
}

/** Destroy the active adapter and reset all state */
export function destroy() {
  if (_activeAdapter && typeof _activeAdapter.destroy === 'function') {
    _activeAdapter.destroy();
  }
  _activeAdapter = null;
  _submissionElement = null;
  _isInitialized = false;
  _initStarted = false;
  _initPromise = null;
  _builtinAdaptersRegistered = false;
  _ready = false;
  _readyCallbacks.length = 0;
}
