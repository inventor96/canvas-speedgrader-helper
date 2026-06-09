/**
 * Submission Dispatcher
 * 
 * Central coordinator for submission operations. Detects submission type and routes
 * requests to appropriate adapter (iframe-based, direct DOM, etc.).
 * 
 * Public API (accessible via whenReady callback):
 * - api.getText() → Promise<string>
 * - api.applyHighlights(ranges, name) → Promise<void>
 * - api.scrollIntoView(selector, options) → Promise<void>
 */
(() => {
  'use strict';

  const SUBMISSION_CONTAINER_SELECTOR = 'article.speedgrader-preview-frame';
  const SUBMISSION_WAIT_TIMEOUT_MS = 15000;

  /**
   * SubmissionDispatcher - Routes submission operations to adapters
   */
  const SubmissionDispatcher = {
    // Configuration
    _adapters: [],
    _activeAdapter: null,
    _submissionElement: null,
    _isInitialized: false,
    _initStarted: false,
    _initPromise: null,
    _builtinAdaptersRegistered: false,

    // Readiness state
    _ready: false,
    _readyCallbacks: [],

    /**
     * Register a callback to be called when the dispatcher is fully ready.
     * If already ready, the callback is invoked immediately with the API.
     * Triggers initialization if not yet started.
     * @param {Function} callback - Receives { getText, applyHighlights, scrollIntoView }
     */
    whenReady(callback) {
      if (this._ready) {
        console.log('[CSH] SubmissionDispatcher.whenReady: already ready, calling immediately');
        callback(this._createApi());
        return;
      }
      console.log('[CSH] SubmissionDispatcher.whenReady: not ready, queuing callback (initStarted:', this._initStarted, ')');
      this._readyCallbacks.push(callback);
      this._startInit();
    },

    /**
     * Create the API surface exposed to consumers
     * @private
     */
    _createApi() {
      const adapter = this._activeAdapter;
      console.log('[CSH] SubmissionDispatcher._createApi with adapter:', !!adapter);
      return {
        getText: () => {
          console.log('[CSH] SubmissionDispatcher API: getText called');
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.getText().then((result) => {
            console.log('[CSH] SubmissionDispatcher API: getText resolved successfully');
            return result;
          }).catch((err) => {
            console.error('[CSH] SubmissionDispatcher API: getText rejected:', err.message);
            throw err;
          });
        },
        applyHighlights: (ranges, cssHighlightName) => {
          console.log('[CSH] SubmissionDispatcher API: applyHighlights called');
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.applyHighlights(ranges, cssHighlightName).then((result) => {
            console.log('[CSH] SubmissionDispatcher API: applyHighlights resolved successfully');
            return result;
          }).catch((err) => {
            console.error('[CSH] SubmissionDispatcher API: applyHighlights rejected:', err.message);
            throw err;
          });
        },
        scrollIntoView: (selector, options = {}) => {
          console.log('[CSH] SubmissionDispatcher API: scrollIntoView called');
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.scrollIntoView(selector, options).then((result) => {
            console.log('[CSH] SubmissionDispatcher API: scrollIntoView resolved successfully');
            return result;
          }).catch((err) => {
            console.error('[CSH] SubmissionDispatcher API: scrollIntoView rejected:', err.message);
            throw err;
          });
        },
      };
    },

    /**
     * Mark the dispatcher as ready and drain pending callbacks
     * @private
     */
    _markReady() {
      if (this._ready) return;
      this._ready = true;
      console.log('[CSH] SubmissionDispatcher ready - draining', this._readyCallbacks.length, 'pending callbacks');
      const cbs = this._readyCallbacks;
      this._readyCallbacks = [];
      const api = this._createApi();
      cbs.forEach((cb) => cb(api));
    },

    /**
     * Start initialization if not yet started
     * @private
     */
    _startInit() {
      if (this._initStarted) return;
      this._initStarted = true;
      console.log('[CSH] SubmissionDispatcher: starting initialization');

      this._initPromise = (async () => {
        try {
          console.log('[CSH] SubmissionDispatcher: querying for submission element:', SUBMISSION_CONTAINER_SELECTOR);
          this._submissionElement = await this._waitForSubmissionElement(SUBMISSION_CONTAINER_SELECTOR);
          if (!this._submissionElement) {
            throw new Error('SubmissionDispatcher: Submission element not found');
          }
          console.log('[CSH] SubmissionDispatcher: found submission element');

          // Register built-in adapters
          this._registerBuiltinAdapters();
          console.log('[CSH] SubmissionDispatcher: registered', this._adapters.length, 'adapters');

          // Find matching adapter
          const adapter = this._selectAdapter();
          if (!adapter) {
            throw new Error('SubmissionDispatcher: No adapter found for current submission type');
          }
          console.log('[CSH] SubmissionDispatcher: selected adapter');

          // Initialize adapter
          console.log('[CSH] SubmissionDispatcher: initializing adapter');
          adapter.init(this._submissionElement);
          this._activeAdapter = adapter;
          this._isInitialized = true;

          console.log('[CSH] SubmissionDispatcher initialized with adapter:', adapter.constructor.name || 'unknown');

          // Wait for the adapter's own readiness (iframe content loaded, child adapter ready)
          if (typeof adapter.whenReady === 'function') {
            console.log('[CSH] SubmissionDispatcher: waiting for adapter readiness...');
            adapter.whenReady(() => {
              console.log('[CSH] SubmissionDispatcher: adapter reports ready');
              this._markReady();
            });
          } else {
            console.log('[CSH] SubmissionDispatcher: adapter has no whenReady, marking ready immediately');
            this._markReady();
          }
        } catch (e) {
          console.error('[CSH] SubmissionDispatcher initialization failed:', e.message);
          this._initStarted = false;
        }
      })();

      return this._initPromise;
    },

    /**
     * Wait for Canvas to render the submission container.
     * @private
     */
    _waitForSubmissionElement(selector) {
      const findElement = () => document.querySelector(selector);
      const existing = findElement();
      if (existing) {
        return Promise.resolve(existing);
      }

      console.log('[CSH] SubmissionDispatcher: submission element not present yet; waiting', {
        readyState: document.readyState,
        hasBody: !!document.body,
        previewFrameCount: document.querySelectorAll('.speedgrader-preview-frame').length,
        iframeCount: document.querySelectorAll('iframe').length,
      });

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
            console.log('[CSH] SubmissionDispatcher: submission element appeared while waiting');
            finish(element, null);
          }
        };

        const timeoutId = setTimeout(() => {
          const articles = Array.from(document.querySelectorAll('article')).map((article) => ({
            className: article.className || '',
            id: article.id || '',
          })).slice(0, 10);
          const iframes = Array.from(document.querySelectorAll('iframe')).map((iframe) => ({
            className: iframe.className || '',
            id: iframe.id || '',
            src: iframe.src || '',
          })).slice(0, 10);

          console.error('[CSH] SubmissionDispatcher: timed out waiting for submission element', {
            selector,
            readyState: document.readyState,
            articles,
            iframes,
          });
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

    /**
     * Register a submission adapter
     */
    registerAdapter(adapter) {
      if (!adapter || typeof adapter.canHandle !== 'function') {
        throw new Error('SubmissionDispatcher: Invalid adapter - must implement canHandle()');
      }
      this._adapters.push(adapter);
    },

    /**
     * Register built-in adapters
     * @private
     */
    _registerBuiltinAdapters() {
      if (this._builtinAdaptersRegistered) {
        return;
      }

      // Register iframe adapter first (most common case)
      if (typeof CSH_IframeSubmissionAdapter !== 'undefined') {
        this.registerAdapter({
          canHandle: (el) => CSH_IframeSubmissionAdapter.canHandle(el),
          whenReady: (cb) => CSH_IframeSubmissionAdapter.whenReady(cb),
          init: (el) => CSH_IframeSubmissionAdapter.init(el),
          getText: () => CSH_IframeSubmissionAdapter.getText(),
          applyHighlights: (ranges, name) => CSH_IframeSubmissionAdapter.applyHighlights(ranges, name),
          scrollIntoView: (selector, options) => CSH_IframeSubmissionAdapter.scrollIntoView(selector, options),
          destroy: () => CSH_IframeSubmissionAdapter.destroy(),
        });
      }
      this._builtinAdaptersRegistered = true;
    },

    /**
     * Select adapter for current submission
     * @private
     */
    _selectAdapter() {
      if (!this._submissionElement) {
        return null;
      }

      for (let i = 0; i < this._adapters.length; i++) {
        try {
          if (this._adapters[i].canHandle(this._submissionElement)) {
            return this._adapters[i];
          }
        } catch (e) {
          console.error('[CSH] Error checking adapter:', e.message);
        }
      }

      return null;
    },

    /**
     * Clean up resources
     */
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

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.SubmissionCoordinator = SubmissionDispatcher;
  }
})();
