import { ensureHighlightStyles } from './highlight-utils.js';
import { buildTextNodes, getRangeBetweenOffsets, scrollIntoView } from './text-range-utils.js';

const ELEMENT_SELECTOR = '.textLayer';
const SEPARATOR = '\n\n';

function waitForTextLayers(timeoutMs = 15000, settleMs = 800) {
  const hasTextSpans = (textLayers) =>
    textLayers.length > 0 &&
    Array.from(textLayers).some((layer) =>
      layer.querySelector('span[role="presentation"]')
    );

  const existing = document.querySelectorAll(ELEMENT_SELECTOR);
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
      const textLayers = document.querySelectorAll(ELEMENT_SELECTOR);
      finish(textLayers, null);
    };

    const kickSettleTimer = () => {
      if (finished || settled) return;
      if (settleTimerId !== null) clearTimeout(settleTimerId);
      settleTimerId = setTimeout(markSettled, settleMs);
    };

    const onMutation = () => {
      const textLayers = document.querySelectorAll(ELEMENT_SELECTOR);

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
      const textLayers = document.querySelectorAll(ELEMENT_SELECTOR);
      if (hasTextSpans(textLayers)) {
        spansSeen = true;
        kickSettleTimer();
      }
    }, 250);

    onMutation();
  });
}

export async function getText() {
  try {
    const textLayers = await waitForTextLayers();
    const { text } = buildTextNodes(textLayers, SEPARATOR);

    console.log('[CSH] DocumentRendererAdapter: extracted text summary', {
      textLayerCount: textLayers.length,
      textLength: text.length,
    });

    return text;
  } catch (e) {
    throw new Error(`DocumentRendererAdapter getText failed: ${e.message}`);
  }
}

export function applyHighlights(ranges, cssHighlightName) {
  try {
    if (!ranges || ranges.length === 0) {
      return;
    }

    if (!CSS || !CSS.highlights) {
      throw new Error('CSS.Highlight API not supported in this browser');
    }

    ensureHighlightStyles();

    const textLayers = document.querySelectorAll(ELEMENT_SELECTOR);
    if (textLayers.length === 0) {
      throw new Error('No text layers found for highlighting');
    }

    const { textNodes } = buildTextNodes(textLayers, SEPARATOR);

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
    throw new Error(`DocumentRendererAdapter applyHighlights failed: ${e.message}`);
  }
}

export { scrollIntoView };

export const DocumentRendererAdapter = { getText, applyHighlights, scrollIntoView };
