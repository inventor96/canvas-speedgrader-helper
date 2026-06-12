import { HIGHLIGHT_CONFIG } from '../highlight-config.js';

function _hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function _ensureHighlightStyles() {
  if (document.querySelector('style[data-csh-highlight-styles]')) {
    return;
  }

  const rules = HIGHLIGHT_CONFIG.map((h) =>
    `::highlight(${h.className}) { background-color: ${_hexToRgba(h.color, 0.4)}; cursor: pointer; }`
  ).join('\n');

  if (!rules) {
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-csh-highlight-styles', '');
  style.textContent = rules;
  document.head?.appendChild(style);
}

function _buildTextNodes(messageElements) {
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
      charOffset += 6;
    }
  });

  const text = postTexts.join('\n\n---\n\n');
  return { textNodes, text };
}

function _getRangeBetweenOffsets(textNodes, startOffset, endOffset) {
  if (startOffset >= endOffset) {
    return null;
  }

  let startNode = null;
  let startNodeOffset = 0;
  let endNode = null;
  let endNodeOffset = 0;

  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i];
    if (startOffset >= tn.startOffset && startOffset < tn.endOffset) {
      startNode = tn.node;
      startNodeOffset = startOffset - tn.startOffset;
      break;
    }
  }

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
}

export const DiscussionPostsAdapter = {
  getText() {
    try {
      const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
      if (messageElements.length === 0) {
        throw new Error('No discussion posts found');
      }

      const { text } = _buildTextNodes(messageElements);
      return text;
    } catch (e) {
      throw new Error(`DiscussionPostsAdapter getText failed: ${e.message}`);
    }
  },

  applyHighlights(ranges, cssHighlightName) {
    try {
      if (!ranges || ranges.length === 0) {
        return;
      }

      if (!CSS || !CSS.highlights) {
        throw new Error('CSS.Highlight API not supported in this browser');
      }

      _ensureHighlightStyles();

      const messageElements = document.querySelectorAll('.discussion_entry > .content > .message.user_content');
      if (messageElements.length === 0) {
        throw new Error('No discussion posts found for highlighting');
      }

      const { textNodes } = _buildTextNodes(messageElements);

      const domRanges = [];
      ranges.forEach((range) => {
        const domRange = _getRangeBetweenOffsets(textNodes, range.start, range.end);
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
  },

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
};
