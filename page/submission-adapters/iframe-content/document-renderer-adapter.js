/**
 * Document Renderer Submission Adapter (iframe content)
 * 
 * Runs inside iframe from canvadocs.instructure.com / canvasdocs.instructure.com
 * Handles text extraction, highlight application, and scrolling for PDF/DOCX renderings.
 * 
 * Text is contained within .textLayer elements (one per page).
 * Individual text segments are in spans with role="presentation".
 */
(() => {
  'use strict';

  /**
   * DocumentRendererAdapter - Handles canvas document rendering
   */
  const DocumentRendererAdapter = {
    _waitForTextLayers(timeoutMs = 15000, settleMs = 800) {
      const hasTextSpans = (textLayers) =>
        textLayers.length > 0 &&
        Array.from(textLayers).some((layer) =>
          layer.querySelector('span[role="presentation"]')
        );

      const existing = document.querySelectorAll('.textLayer');
      if (hasTextSpans(existing)) {
        return Promise.resolve(existing);
      }

      console.log('[CSH] DocumentRendererAdapter: waiting for text layers with spans', {
        readyState: document.readyState,
        textLayerCount: existing.length,
        iframeCount: document.querySelectorAll('iframe').length,
      });

      return new Promise((resolve, reject) => {
        let finished = false;
        let observer = null;
        let intervalId = null;
        let settleTimerId = null;
        let settled = false;
        let spansSeen = false;

        const cleanup = () => {
          clearTimeout(timeoutId);
          if (intervalId !== null) clearInterval(intervalId);
          if (observer) observer.disconnect();
          if (settleTimerId !== null) clearTimeout(settleTimerId);
        };

        const finish = (textLayers, error) => {
          if (finished) return;
          finished = true;
          cleanup();
          if (error) {
            reject(error);
          } else {
            resolve(textLayers);
          }
        };

        const markSettled = () => {
          if (finished || settled) return;
          settled = true;
          const textLayers = document.querySelectorAll('.textLayer');
          console.log('[CSH] DocumentRendererAdapter: text layers settled:', textLayers.length);
          finish(textLayers, null);
        };

        const kickSettleTimer = () => {
          if (finished || settled) return;
          if (settleTimerId !== null) clearTimeout(settleTimerId);
          settleTimerId = setTimeout(markSettled, settleMs);
        };

        const onMutation = () => {
          const textLayers = document.querySelectorAll('.textLayer');

          if (!hasTextSpans(textLayers)) {
            if (settleTimerId !== null) {
              clearTimeout(settleTimerId);
              settleTimerId = null;
            }
            settled = false;
            return;
          }

          if (!spansSeen) {
            spansSeen = true;
            console.log('[CSH] DocumentRendererAdapter: text spans appeared, waiting for settle');
          }

          if (settled) return;

          if (settleTimerId !== null) {
            clearTimeout(settleTimerId);
          }
          settleTimerId = setTimeout(markSettled, settleMs);
        };

        const timeoutId = setTimeout(() => {
          const textLayers = document.querySelectorAll('.textLayer');
          const spanInfo = Array.from(textLayers).map((layer) => ({
            spanCount: layer.querySelectorAll('span[role="presentation"]').length,
            totalSpans: layer.querySelectorAll('span').length,
            textLength: layer.textContent?.length || 0,
          }));
          const iframes = Array.from(document.querySelectorAll('iframe')).map((iframe) => ({
            className: iframe.className || '',
            id: iframe.id || '',
            src: iframe.src || '',
          })).slice(0, 10);
          console.error('[CSH] DocumentRendererAdapter: timed out waiting for text spans', {
            url: window.location.href,
            readyState: document.readyState,
            bodyClass: document.body?.className || '',
            textLayerCount: textLayers.length,
            spanInfo,
            iframeCount: document.querySelectorAll('iframe').length,
            iframes,
          });
          finish(null, new Error('Text spans not found in document layers'));
        }, timeoutMs);

        if (document.body || document.documentElement) {
          observer = new MutationObserver(onMutation);
          observer.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
          });
        }

        // Poll only until first spans are detected — after that, only
        // the MutationObserver drives settle-timer resets so the timer
        // isn't constantly restarted by polling.
        intervalId = setInterval(() => {
          if (spansSeen) return;
          const textLayers = document.querySelectorAll('.textLayer');
          if (hasTextSpans(textLayers)) {
            spansSeen = true;
            console.log('[CSH] DocumentRendererAdapter: text spans appeared (poll), waiting for settle');
            kickSettleTimer();
          }
        }, 250);

        onMutation();
      });
    },

    /**
     * Extract text from all .textLayer elements
     */
    async getText() {
      try {
        const textLayers = await this._waitForTextLayers();

        const allText = [];
        textLayers.forEach((layer) => {
          let spans = layer.querySelectorAll('span[role="presentation"]');
          if (spans.length === 0) {
            spans = layer.querySelectorAll('span');
          }

          const layerText = [];
          spans.forEach((span) => {
            if (span.textContent) {
              layerText.push(span.textContent);
            }
          });

          if (layerText.length === 0 && layer.textContent) {
            layerText.push(layer.textContent);
          }

          allText.push(layerText.join(''));
          // Add page separator
          allText.push('\n\n');
        });

        const text = allText.join('').trim();
        console.log('[CSH] DocumentRendererAdapter: extracted text summary', {
          textLayerCount: textLayers.length,
          roleSpanCount: Array.from(textLayers).reduce((count, layer) => count + layer.querySelectorAll('span[role="presentation"]').length, 0),
          spanCount: Array.from(textLayers).reduce((count, layer) => count + layer.querySelectorAll('span').length, 0),
          textLength: text.length,
        });

        return text;
      } catch (e) {
        throw new Error(`DocumentRendererAdapter getText failed: ${e.message}`);
      }
    },

    /**
     * Apply CSS highlights to text ranges
     */
    _hexToRgba(hex, alpha) {
      const h = hex.replace('#', '');
      const r = parseInt(h.substring(0, 2), 16);
      const g = parseInt(h.substring(2, 4), 16);
      const b = parseInt(h.substring(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    },

    _ensureHighlightStyles() {
      if (document.querySelector('style[data-csh-highlight-styles]')) {
        return;
      }

      const config = (typeof CSH_HighlightConfig !== 'undefined')
        ? CSH_HighlightConfig
        : [];

      const rules = config.map((h) =>
        `::highlight(${h.className}) { background-color: ${this._hexToRgba(h.color, 0.4)}; cursor: pointer; }`
      ).join('\n');

      if (!rules) {
        return;
      }

      const style = document.createElement('style');
      style.setAttribute('data-csh-highlight-styles', '');
      style.textContent = rules;
      document.head?.appendChild(style);
    },

    applyHighlights(ranges, cssHighlightName) {
      try {
        if (!ranges || ranges.length === 0) {
          return; // No ranges to highlight
        }

        // Check if CSS.Highlight API is supported
        if (!CSS || !CSS.highlights) {
          throw new Error('CSS.Highlight API not supported in this browser');
        }

        this._ensureHighlightStyles();

        // Get all text nodes in .textLayer
        const textLayers = document.querySelectorAll('.textLayer');
        if (textLayers.length === 0) {
          throw new Error('No text layers found for highlighting');
        }

        // Build list of all text nodes and their character offsets
        const textNodes = [];
        let charOffset = 0;

        textLayers.forEach((layer) => {
          const walker = document.createTreeWalker(
            layer,
            NodeFilter.SHOW_TEXT,
            null,
            false
          );

          let node;
          while ((node = walker.nextNode())) {
            const length = node.textContent.length;
            if (length > 0) {
              textNodes.push({
                node,
                startOffset: charOffset,
                endOffset: charOffset + length,
              });
              charOffset += length;
            }
          }

          // Account for page separators
          charOffset += 2; // '\n\n'
        });

        // Convert character ranges to DOM ranges
        const domRanges = [];
        ranges.forEach((range) => {
          const domRange = this._getRangeBetweenOffsets(textNodes, range.start, range.end);
          if (domRange) {
            domRanges.push(domRange);
          }
        });

        if (domRanges.length === 0) {
          throw new Error('Could not convert character ranges to DOM ranges');
        }

        // Create and apply highlight
        const highlight = new Highlight(...domRanges);
        CSS.highlights.set(cssHighlightName, highlight);
      } catch (e) {
        throw new Error(`DocumentRendererAdapter applyHighlights failed: ${e.message}`);
      }
    },

    /**
     * Scroll element into view
     */
    scrollIntoView(selector, options = {}) {
      try {
        const element = document.querySelector(selector);
        if (!element) {
          throw new Error(`Element not found with selector: ${selector}`);
        }

        element.scrollIntoView({
          behavior: options.behavior || 'smooth',
          block: options.block || 'start',
          inline: options.inline || 'nearest',
        });
      } catch (e) {
        throw new Error(`DocumentRendererAdapter scrollIntoView failed: ${e.message}`);
      }
    },

    /**
     * Convert character offsets to DOM range
     * @private
     */
    _getRangeBetweenOffsets(textNodes, startOffset, endOffset) {
      if (startOffset >= endOffset) {
        return null;
      }

      let startNode = null;
      let startNodeOffset = 0;
      let endNode = null;
      let endNodeOffset = 0;

      // Find start node and offset
      for (let i = 0; i < textNodes.length; i++) {
        const tn = textNodes[i];
        if (startOffset >= tn.startOffset && startOffset < tn.endOffset) {
          startNode = tn.node;
          startNodeOffset = startOffset - tn.startOffset;
          break;
        }
      }

      // Find end node and offset
      for (let i = 0; i < textNodes.length; i++) {
        const tn = textNodes[i];
        if (endOffset > tn.startOffset && endOffset <= tn.endOffset) {
          endNode = tn.node;
          endNodeOffset = endOffset - tn.startOffset;
          break;
        }
      }

      if (!startNode || !endNode) {
        return null;
      }

      const range = new Range();
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    },
  };

  // Export to global namespace
  if (typeof window !== 'undefined') {
    window.CSH_DocumentRendererAdapter = DocumentRendererAdapter;
  }
})();
