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
        callback(this._createApi());
        return;
      }
      this._readyCallbacks.push(callback);
      this._startInit();
    },

    /**
     * Create the API surface exposed to consumers
     * @private
     */
    _createApi() {
      const adapter = this._activeAdapter;
      return {
        getText: () => {
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.getText();
        },
        applyHighlights: (ranges, cssHighlightName) => {
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.applyHighlights(ranges, cssHighlightName);
        },
        scrollIntoView: (selector, options = {}) => {
          if (!adapter) return Promise.reject(new Error('SubmissionDispatcher: No active adapter'));
          return adapter.scrollIntoView(selector, options);
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
      console.log('[CSH] SubmissionDispatcher ready');
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

      this._initPromise = (async () => {
        try {
          this._submissionElement = document.querySelector(SUBMISSION_CONTAINER_SELECTOR);
          if (!this._submissionElement) {
            throw new Error('SubmissionDispatcher: Submission element not found');
          }

          // Register built-in adapters
          this._registerBuiltinAdapters();

          // Find matching adapter
          const adapter = this._selectAdapter();
          if (!adapter) {
            throw new Error('SubmissionDispatcher: No adapter found for current submission type');
          }

          // Initialize adapter
          adapter.init(this._submissionElement);
          this._activeAdapter = adapter;
          this._isInitialized = true;

          console.log('[CSH] SubmissionDispatcher initialized with adapter:', adapter.constructor.name || 'unknown');

          // Wait for the adapter's own readiness (iframe content loaded, child adapter ready)
          if (typeof adapter.whenReady === 'function') {
            adapter.whenReady(() => {
              this._markReady();
            });
          } else {
            // For adapters that don't implement whenReady (e.g., future direct-DOM adapters)
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
      this._ready = false;
      this._readyCallbacks = [];
    },
  };

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.SubmissionCoordinator = SubmissionDispatcher;
  }
})();
