/**
 * Submission Dispatcher
 * 
 * Central coordinator for submission operations. Detects submission type and routes
 * requests to appropriate adapter (iframe-based, direct DOM, etc.).
 * 
 * Public API:
 * - SubmissionCoordinator.getText() → Promise<string>
 * - SubmissionCoordinator.applyHighlights(ranges, name) → Promise<void>
 * - SubmissionCoordinator.scrollIntoView(selector, options) → Promise<void>
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
    _initPromise: null,

    /**
     * Initialize dispatcher by finding submission element and selecting adapter
     */
    async init() {
      if (this._isInitialized) {
        return;
      }

      if (this._initPromise) {
        return this._initPromise;
      }

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
        } catch (e) {
          console.error('[CSH] SubmissionDispatcher initialization failed:', e.message);
          throw e;
        }
      })();

      return this._initPromise;
    },

    /**
     * Get text from submission
     */
    async getText() {
      await this.init();
      if (!this._activeAdapter) {
        throw new Error('SubmissionDispatcher: No active adapter');
      }
      return this._activeAdapter.getText();
    },

    /**
     * Apply highlights to submission
     */
    async applyHighlights(ranges, cssHighlightName) {
      await this.init();
      if (!this._activeAdapter) {
        throw new Error('SubmissionDispatcher: No active adapter');
      }
      return this._activeAdapter.applyHighlights(ranges, cssHighlightName);
    },

    /**
     * Scroll element into view
     */
    async scrollIntoView(selector, options = {}) {
      await this.init();
      if (!this._activeAdapter) {
        throw new Error('SubmissionDispatcher: No active adapter');
      }
      return this._activeAdapter.scrollIntoView(selector, options);
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
      this._initPromise = null;
    },
  };

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.SubmissionCoordinator = SubmissionDispatcher;
  }
})();
