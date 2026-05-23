/**
 * Document Renderer Submission Adapter (iframe content)
 * 
 * Runs inside iframe from canvasdocs.instructure.com
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
    /**
     * Extract text from all .textLayer elements
     */
    getText() {
      try {
        const textLayers = document.querySelectorAll('.textLayer');
        if (textLayers.length === 0) {
          throw new Error('No text layers found in document');
        }

        const allText = [];
        textLayers.forEach((layer) => {
          const spans = layer.querySelectorAll('span[role="presentation"]');
          spans.forEach((span) => {
            if (span.textContent) {
              allText.push(span.textContent);
            }
          });
          // Add page separator
          allText.push('\n\n');
        });

        return allText.join('').trim();
      } catch (e) {
        throw new Error(`DocumentRendererAdapter getText failed: ${e.message}`);
      }
    },

    /**
     * Apply CSS highlights to text ranges
     */
    applyHighlights(ranges, cssHighlightName) {
      try {
        if (!ranges || ranges.length === 0) {
          return; // No ranges to highlight
        }

        // Check if CSS.Highlight API is supported
        if (!CSS || !CSS.highlights) {
          throw new Error('CSS.Highlight API not supported in this browser');
        }

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
