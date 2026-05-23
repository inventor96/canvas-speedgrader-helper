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
     * Extract text from all discussion posts
     */
    getText() {
      try {
        const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
        if (messageElements.length === 0) {
          throw new Error('No discussion posts found');
        }

        const allText = [];
        messageElements.forEach((message, index) => {
          // Extract text content from the message
          const text = this._extractTextFromElement(message);
          if (text) {
            allText.push(text);
          }
          // Add post separator (except after last post)
          if (index < messageElements.length - 1) {
            allText.push('\n\n---\n\n');
          }
        });

        return allText.join('').trim();
      } catch (e) {
        throw new Error(`DiscussionPostsAdapter getText failed: ${e.message}`);
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

        // Get all message elements
        const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
        if (messageElements.length === 0) {
          throw new Error('No discussion posts found for highlighting');
        }

        // Build list of all text nodes and their character offsets
        const textNodes = [];
        let charOffset = 0;

        messageElements.forEach((message, messageIndex) => {
          const walker = document.createTreeWalker(
            message,
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

          // Account for post separator (except after last post)
          if (messageIndex < messageElements.length - 1) {
            charOffset += 6; // '\n\n---\n\n'
          }
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
     * Extract text from element while preserving structure
     * @private
     */
    _extractTextFromElement(element) {
      try {
        const clone = element.cloneNode(true);
        
        // Remove script and style elements
        clone.querySelectorAll('script, style').forEach((el) => el.remove());

        // Get text content with some structure preservation
        let text = clone.textContent || '';
        
        // Clean up excessive whitespace while preserving intentional breaks
        text = text.replace(/\r\n/g, '\n'); // Normalize line endings
        text = text.replace(/\n\n+/g, '\n'); // Collapse multiple blank lines
        text = text.trim();

        return text;
      } catch (e) {
        console.error('Error extracting text from element:', e);
        return '';
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
