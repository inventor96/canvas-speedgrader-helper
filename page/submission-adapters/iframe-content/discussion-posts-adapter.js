/**
 * Discussion Posts Submission Adapter (iframe content)
 * 
 * Runs inside iframe from byupw.instructure.com (or similar Canvas instances)
 * Handles text extraction, highlight application, and scrolling for discussion-based submissions.
 * 
 * Posts are contained within .discussion_entry > .content > .message.user_content elements.
 * Each post contains standard wysiwyg output (p, ul, ol, img, etc.).
 */
(() => {
  'use strict';

  /**
   * DiscussionPostsAdapter - Handles canvas discussion post rendering
   */
  const DiscussionPostsAdapter = {
    /**
     * Build a shared text-node map and canonical text from discussion posts.
     * Both getText() and applyHighlights() call this so their
     * character-offset spaces are guaranteed identical.
     * @private
     */
    _buildTextNodes(messageElements) {
      const textNodes = [];
      const postTexts = [];
      let charOffset = 0;

      messageElements.forEach((message, index) => {
        const walker = document.createTreeWalker(
          message,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        let postText = '';
        while ((node = walker.nextNode())) {
          const content = node.textContent;
          if (content.length > 0) {
            textNodes.push({
              node,
              startOffset: charOffset,
              endOffset: charOffset + content.length,
            });
            charOffset += content.length;
            postText += content;
          }
        }
        postTexts.push(postText);

        if (index < messageElements.length - 1) {
          charOffset += 6; // '\n\n---\n\n'
        }
      });

      const text = postTexts.join('\n\n---\n\n');
      return { textNodes, text };
    },

    /**
     * Extract text from all discussion posts
     */
    getText() {
      try {
        const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
        if (messageElements.length === 0) {
          throw new Error('No discussion posts found');
        }

        const { text } = this._buildTextNodes(messageElements);
        return text;
      } catch (e) {
        throw new Error(`DiscussionPostsAdapter getText failed: ${e.message}`);
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

        // Get all message elements
        const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
        if (messageElements.length === 0) {
          throw new Error('No discussion posts found for highlighting');
        }

        // Build text-node map via shared builder
        const { textNodes } = this._buildTextNodes(messageElements);

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
        throw new Error(`DiscussionPostsAdapter applyHighlights failed: ${e.message}`);
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
        throw new Error(`DiscussionPostsAdapter scrollIntoView failed: ${e.message}`);
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
    window.CSH_DiscussionPostsAdapter = DiscussionPostsAdapter;
  }
})();
