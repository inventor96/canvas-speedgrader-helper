import { IframeSubmissionAdapter } from './submission-adapters/iframe-submission-adapter.js';

const SUBMISSION_CONTAINER_SELECTOR = 'article.speedgrader-preview-frame';
const SUBMISSION_WAIT_TIMEOUT_MS = 15000;

const _adapters = [];
let _activeAdapter = null;
let _submissionElement = null;
let _isInitialized = false;
let _initStarted = false;
let _initPromise = null;
let _builtinAdaptersRegistered = false;
let _ready = false;
const _readyCallbacks = [];

export function whenReady(callback) {
  if (_ready) {
    callback(createApi());
    return;
  }
  _readyCallbacks.push(callback);
  startInit();
}

function createApi() {
  const adapter = _activeAdapter;
  return {
    getText: () => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.getText().then((result) => {
        return result;
      }).catch((err) => {
        console.error('[CSH] SubmissionDispatcher API: getText rejected:', err.message);
        throw err;
      });
    },
    applyHighlights: (ranges, cssHighlightName) => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.applyHighlights(ranges, cssHighlightName).then((result) => {
        return result;
      }).catch((err) => {
        console.error('[CSH] SubmissionDispatcher API: applyHighlights rejected:', err.message);
        throw err;
      });
    },
    scrollIntoView: (selector, options = {}) => {
      if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
      return adapter.scrollIntoView(selector, options).then((result) => {
        return result;
      }).catch((err) => {
        console.error('[CSH] SubmissionDispatcher API: scrollIntoView rejected:', err.message);
        throw err;
      });
    },
  };
}

function markReady() {
  if (_ready) return;
  _ready = true;
  const cbs = _readyCallbacks;
  _readyCallbacks.length = 0;
  const api = createApi();
  cbs.forEach((cb) => cb(api));
}

function startInit() {
  if (_initStarted) return;
  _initStarted = true;

  _initPromise = (async () => {
    try {
      _submissionElement = await waitForSubmissionElement(SUBMISSION_CONTAINER_SELECTOR);
      if (!_submissionElement) {
        throw new Error('SubmissionDispatcher: Submission element not found');
      }

      registerBuiltinAdapters();

      const adapter = selectAdapter();
      if (!adapter) {
        throw new Error('SubmissionDispatcher: No adapter found for current submission type');
      }

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
      console.error('[CSH] SubmissionDispatcher initialization failed:', e.message);
      _initStarted = false;
    }
  })();

  return _initPromise;
}

function waitForSubmissionElement(selector) {
  const findElement = () => document.querySelector(selector);
  const existing = findElement();
  if (existing) {
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    let finished = false;
    let observer = null;
    let intervalId = null;

    const finish = (element, error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
      if (observer) observer.disconnect();
      if (error) {
        reject(error);
      } else {
        resolve(element);
      }
    };

    const check = () => {
      const element = findElement();
      if (element) {
        finish(element, null);
      }
    };

    const timeoutId = setTimeout(() => {
      finish(null, new Error('SubmissionDispatcher: Submission element not found'));
    }, SUBMISSION_WAIT_TIMEOUT_MS);

    if (document.body || document.documentElement) {
      observer = new MutationObserver(check);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    intervalId = setInterval(check, 250);
    check();
  });
}

function registerAdapter(adapter) {
  if (!adapter || typeof adapter.canHandle !== 'function') {
    throw new Error('SubmissionDispatcher: Invalid adapter - must implement canHandle()');
  }
  _adapters.push(adapter);
}

function registerBuiltinAdapters() {
  if (_builtinAdaptersRegistered) {
    return;
  }

  if (typeof IframeSubmissionAdapter !== 'undefined') {
    registerAdapter(IframeSubmissionAdapter);
  }
  _builtinAdaptersRegistered = true;
}

function selectAdapter() {
  if (!_submissionElement) {
    return null;
  }

  for (let i = 0; i < _adapters.length; i++) {
    try {
      if (_adapters[i].canHandle(_submissionElement)) {
        return _adapters[i];
      }
    } catch (e) {}
  }

  return null;
}

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
