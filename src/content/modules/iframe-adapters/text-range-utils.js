/**
 * Walks a set of DOM elements, flattens all text nodes into an indexed array,
 * and builds a contiguous text string separated by `separator`.
 *
 * When `options.insertSpaces` is true, a single space is inserted between
 * consecutive text nodes within the same element when neither side already
 * carries whitespace at the boundary. This is needed for e.g. PDF text layers
 * where each word lives in its own `<span>` without inter-span whitespace.
 */
export function buildTextNodes(elements, separator, options = {}) {
  const { insertSpaces = false } = options;
  const textNodes = [];
  const partTexts = [];
  let charOffset = 0;

  elements.forEach((element, index) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    let partText = '';
    let prevEndsWithSpace = false;

    while ((node = walker.nextNode())) {
      const content = node.textContent;
      if (content.length > 0) {
        const curStartsWithSpace = /^\s/.test(content);

        if (insertSpaces && partText.length > 0 && !prevEndsWithSpace && !curStartsWithSpace) {
          partText += ' ';
          charOffset += 1;
        }

        textNodes.push({
          node,
          startOffset: charOffset,
          endOffset: charOffset + content.length,
        });
        charOffset += content.length;
        partText += content;
        prevEndsWithSpace = /\s$/.test(content);
      }
    }
    partTexts.push(partText);

    // Account for the separator between elements
    if (index < elements.length - 1) {
      charOffset += separator.length;
    }
  });

  const text = partTexts.join(separator);
  return { textNodes, text };
}

/**
 * Converts a character-offset range (startOffset, endOffset) into a DOM Range
 * by looking up the corresponding text nodes in the pre-built index.
 */
export function getRangeBetweenOffsets(textNodes, startOffset, endOffset) {
  if (startOffset >= endOffset) {
    return null;
  }

  let startNode = null;
  let startNodeOffset = 0;
  let endNode = null;
  let endNodeOffset = 0;

  // Find the text node containing the start offset
  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i];
    if (startOffset >= tn.startOffset && startOffset < tn.endOffset) {
      startNode = tn.node;
      startNodeOffset = startOffset - tn.startOffset;
      break;
    }
  }

  // Find the text node containing the end offset
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

/** Scrolls the first element matching `selector` into view with optional behaviour. */
export function scrollIntoView(selector, options = {}) {
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
    throw new Error(`scrollIntoView failed: ${e.message}`);
  }
}
