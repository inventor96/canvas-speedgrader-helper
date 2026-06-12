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

function _buildTextNodes(textLayers) {
  const textNodes = [];
  const layerTexts = [];
  let charOffset = 0;

  textLayers.forEach((layer, index) => {
    const walker = document.createTreeWalker(
      layer,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    let layerText = '';
    while ((node = walker.nextNode())) {
      const content = node.textContent;
      if (content.length > 0) {
        textNodes.push({
          node,
          startOffset: charOffset,
          endOffset: charOffset + content.length,
        });
        charOffset += content.length;
        layerText += content;
      }
    }
    layerTexts.push(layerText);

    if (index < textLayers.length - 1) {
      charOffset += 2;
    }
  });

  const text = layerTexts.join('\n\n');
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

function waitForTextLayers(timeoutMs = 15000, settleMs = 800) {
  const hasTextSpans = (textLayers) =>
    textLayers.length > 0 &&
    Array.from(textLayers).some((layer) =>
      layer.querySelector('span[role="presentation"]')
    );

  const existing = document.querySelectorAll('.textLayer');
  if (hasTextSpans(existing)) {
    return Promise.resolve(existing);
  }

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
      }

      if (settled) return;

      if (settleTimerId !== null) {
        clearTimeout(settleTimerId);
      }
      settleTimerId = setTimeout(markSettled, settleMs);
    };

    const timeoutId = setTimeout(() => {
      finish(null, new Error('Text spans not found in document layers'));
    }, timeoutMs);

    if (document.body || document.documentElement) {
      observer = new MutationObserver(onMutation);
      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    intervalId = setInterval(() => {
      if (spansSeen) return;
      const textLayers = document.querySelectorAll('.textLayer');
      if (hasTextSpans(textLayers)) {
        spansSeen = true;
        kickSettleTimer();
      }
    }, 250);

    onMutation();
  });
}

export const DocumentRendererAdapter = {
  async getText() {
    try {
      const textLayers = await waitForTextLayers();
      const { text } = _buildTextNodes(textLayers);

      console.log('[CSH] DocumentRendererAdapter: extracted text summary', {
        textLayerCount: textLayers.length,
        textLength: text.length,
      });

      return text;
    } catch (e) {
      throw new Error(`DocumentRendererAdapter getText failed: ${e.message}`);
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

      const textLayers = document.querySelectorAll('.textLayer');
      if (textLayers.length === 0) {
        throw new Error('No text layers found for highlighting');
      }

      const { textNodes } = _buildTextNodes(textLayers);

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
      throw new Error(`DocumentRendererAdapter applyHighlights failed: ${e.message}`);
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
      throw new Error(`DocumentRendererAdapter scrollIntoView failed: ${e.message}`);
    }
  },
};
