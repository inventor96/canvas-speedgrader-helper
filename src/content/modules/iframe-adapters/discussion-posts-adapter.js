import { ensureHighlightStyles } from './highlight-utils.js';
import { buildTextNodes, getRangeBetweenOffsets, scrollIntoViewByOffset as scrollIntoViewByOffsetUtil } from './text-range-utils.js';

/** Selector for discussion post message elements. */
const ELEMENT_SELECTOR = '.discussion_entry > .content > .message.user_content';
const SEPARATOR = '\n\n---\n\n';

/** Extracts all text from discussion posts, separated by a horizontal rule marker. */
export function getText() {
  try {
    const messageElements = document.querySelectorAll(ELEMENT_SELECTOR);
    if (messageElements.length === 0) {
      throw new Error('No discussion posts found');
    }

    const { text } = buildTextNodes(messageElements, SEPARATOR);
    return text;
  } catch (e) {
    throw new Error(`DiscussionPostsAdapter getText failed: ${e.message}`);
  }
}

/** Applies CSS custom highlights to matching character ranges in discussion posts. */
export function applyHighlights(ranges, cssHighlightName) {
  try {
    if (!ranges || ranges.length === 0) {
      return;
    }

    if (!CSS || !CSS.highlights) {
      throw new Error('CSS.Highlight API not supported in this browser');
    }

    ensureHighlightStyles();

    const messageElements = document.querySelectorAll(ELEMENT_SELECTOR);
    if (messageElements.length === 0) {
      throw new Error('No discussion posts found for highlighting');
    }

    // Build text node index and convert character offsets to DOM ranges
    const { textNodes } = buildTextNodes(messageElements, SEPARATOR);

    const domRanges = [];
    ranges.forEach((range) => {
      const domRange = getRangeBetweenOffsets(textNodes, range.start, range.end);
      if (domRange) {
        domRanges.push(domRange);
      }
    });

    if (domRanges.length === 0) {
      throw new Error('Could not convert character ranges to DOM ranges');
    }

    const highlight = new Highlight(...domRanges);
    CSS.highlights.set(cssHighlightName, highlight);
  } catch (e) {
    throw new Error(`DiscussionPostsAdapter applyHighlights failed: ${e.message}`);
  }
}

export function scrollIntoViewByOffset(charOffset, scrollOptions = {}) {
  try {
    const messageElements = document.querySelectorAll(ELEMENT_SELECTOR);
    if (messageElements.length === 0) {
      throw new Error('No discussion posts found');
    }
    scrollIntoViewByOffsetUtil(messageElements, charOffset, SEPARATOR, {}, {
      ...scrollOptions,
      container: scrollOptions.container || document.scrollingElement,
    });
  } catch (e) {
    throw new Error(`DiscussionPostsAdapter scrollIntoViewByOffset failed: ${e.message}`);
  }
}

export const DiscussionPostsAdapter = { getText, applyHighlights, scrollIntoViewByOffset };
