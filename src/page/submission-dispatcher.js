import { CSH_MESSAGE_TYPES } from '../shared/message-types.js';
import { IframeSubmissionAdapter } from './submission-adapters/iframe-submission-adapter.js';

const SUBMISSION_CONTAINER_SELECTOR = 'article.speedgrader-preview-frame';
const SUBMISSION_WAIT_TIMEOUT_MS = 15000;

const SubmissionDispatcher = {
  _adapters: [],
  _activeAdapter: null,
  _submissionElement: null,
  _isInitialized: false,
  _initStarted: false,
  _initPromise: null,
  _builtinAdaptersRegistered: false,

  _ready: false,
  _readyCallbacks: [],

  whenReady(callback) {
    if (this._ready) {
      callback(this._createApi());
      return;
    }
    this._readyCallbacks.push(callback);
    this._startInit();
  },

  _createApi() {
    const adapter = this._activeAdapter;
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
  },

  _markReady() {
    if (this._ready) return;
    this._ready = true;
    const cbs = this._readyCallbacks;
    this._readyCallbacks = [];
    const api = this._createApi();
    cbs.forEach((cb) => cb(api));
  },

  _startInit() {
    if (this._initStarted) return;
    this._initStarted = true;

    this._initPromise = (async () => {
      try {
        this._submissionElement = await this._waitForSubmissionElement(SUBMISSION_CONTAINER_SELECTOR);
        if (!this._submissionElement) {
          throw new Error('SubmissionDispatcher: Submission element not found');
        }

        this._registerBuiltinAdapters();

        const adapter = this._selectAdapter();
        if (!adapter) {
          throw new Error('SubmissionDispatcher: No adapter found for current submission type');
        }

        adapter.init(this._submissionElement);
        this._activeAdapter = adapter;
        this._isInitialized = true;

        if (typeof adapter.whenReady === 'function') {
          adapter.whenReady(() => {
            this._markReady();
          });
        } else {
          this._markReady();
        }
      } catch (e) {
        console.error('[CSH] SubmissionDispatcher initialization failed:', e.message);
        this._initStarted = false;
      }
    })();

    return this._initPromise;
  },

  _waitForSubmissionElement(selector) {
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
  },

  registerAdapter(adapter) {
    if (!adapter || typeof adapter.canHandle !== 'function') {
      throw new Error('SubmissionDispatcher: Invalid adapter - must implement canHandle()');
    }
    this._adapters.push(adapter);
  },

  _registerBuiltinAdapters() {
    if (this._builtinAdaptersRegistered) {
      return;
    }

    if (typeof IframeSubmissionAdapter !== 'undefined') {
      this.registerAdapter(IframeSubmissionAdapter);
    }
    this._builtinAdaptersRegistered = true;
  },

  _selectAdapter() {
    if (!this._submissionElement) {
      return null;
    }

    for (let i = 0; i < this._adapters.length; i++) {
      try {
        if (this._adapters[i].canHandle(this._submissionElement)) {
          return this._adapters[i];
        }
      } catch (e) {}
    }

    return null;
  },

  destroy() {
    if (this._activeAdapter && typeof this._activeAdapter.destroy === 'function') {
      this._activeAdapter.destroy();
    }
    this._activeAdapter = null;
    this._submissionElement = null;
    this._isInitialized = false;
    this._initStarted = false;
    this._initPromise = null;
    this._builtinAdaptersRegistered = false;
    this._ready = false;
    this._readyCallbacks = [];
  },
};

export { SubmissionDispatcher };
