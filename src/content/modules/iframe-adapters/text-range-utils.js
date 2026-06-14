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
  let startIdx = -1;
  let endNode = null;
  let endNodeOffset = 0;
  let endIdx = -1;

  // Find the text node containing the start offset.
  // If startOffset falls in a separator gap (no text node covers it),
  // fall forward to the next text node (start of the respective post).
  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i];
    if (startOffset >= tn.startOffset && startOffset < tn.endOffset) {
      startNode = tn.node;
      startNodeOffset = startOffset - tn.startOffset;
      startIdx = i;
      break;
    }
    if (startOffset < tn.startOffset) {
      // separator gap before this node — start at the beginning of this post
      startNode = tn.node;
      startNodeOffset = 0;
      startIdx = i;
      break;
    }
  }

  if (!startNode) {
    return null;
  }

  // Find the text node containing the end offset
  for (let i = 0; i < textNodes.length; i++) {
    const tn = textNodes[i];
    if (endOffset > tn.startOffset && endOffset <= tn.endOffset) {
      endNode = tn.node;
      endNodeOffset = endOffset - tn.startOffset;
      endIdx = i;
      break;
    }
  }

  // If endOffset falls in a separator gap, fall backward to the previous
  // text node (end of the respective post).
  if (!endNode) {
    for (let i = textNodes.length - 1; i >= 0; i--) {
      if (endOffset > textNodes[i].endOffset) {
        endNode = textNodes[i].node;
        endNodeOffset = textNodes[i].endOffset - textNodes[i].startOffset;
        endIdx = i;
        break;
      }
    }
  }

  if (!endNode) {
    return null;
  }

  // After gap adjustments, verify that start still precedes end
  if (startIdx > endIdx || (startIdx === endIdx && startNodeOffset >= endNodeOffset)) {
    return null;
  }

  const range = new Range();
  range.setStart(startNode, startNodeOffset);
  range.setEnd(endNode, endNodeOffset);
  return range;
}

/**
 * Walks up from an element to find the nearest scrollable ancestor.
 */
function findScrollContainer(el) {
  let current = el.parentElement;
  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.overflowY === 'auto' || style.overflowY === 'scroll' ||
      style.overflow === 'auto' || style.overflow === 'scroll'
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

/**
 * Scrolls so that the text at `charOffset` appears 25% from the top of
 * the visible scroll area. Elements/separator/buildOptions mirror the
 * parameters passed to `buildTextNodes` for consistent indexing.
 *
 * `scrollOptions` may include `behavior` (passed to `scrollBy`) and
 * `container` (an explicit scroll container override; when absent the
 * utility walks up from the target element via `findScrollContainer`).
 */
export function scrollIntoViewByOffset(elements, charOffset, separator, buildOptions = {}, scrollOptions = {}) {
  const { textNodes } = buildTextNodes(elements, separator, buildOptions);

  if (textNodes.length === 0) {
    throw new Error('scrollIntoViewByOffset: no text nodes found');
  }

  let targetNode = null;

  // Try exact match first
  for (const tn of textNodes) {
    if (charOffset >= tn.startOffset && charOffset < tn.endOffset) {
      targetNode = tn.node;
      break;
    }
  }

  if (!targetNode) {
    // Clamp or fall forward
    if (charOffset < textNodes[0].startOffset) {
      targetNode = textNodes[0].node;
    } else if (charOffset >= textNodes[textNodes.length - 1].endOffset) {
      targetNode = textNodes[textNodes.length - 1].node;
    } else {
      // In a separator gap — fall forward to the next text node
      for (const tn of textNodes) {
        if (charOffset < tn.startOffset) {
          targetNode = tn.node;
          break;
        }
      }
      if (!targetNode) {
        targetNode = textNodes[textNodes.length - 1].node;
      }
    }
  }

  const targetElement = targetNode.parentElement;
  const container = scrollOptions.container || findScrollContainer(targetElement);
  const tRect = targetElement.getBoundingClientRect();
  const cRect = container.getBoundingClientRect();

  const relativeTop = tRect.top - cRect.top;
  const viewportHeight = (container === document.documentElement || container === document.body)
    ? window.innerHeight
    : container.clientHeight;
  const delta = relativeTop - viewportHeight * 0.25; // 25% down from the top

  container.scrollBy({
    top: delta,
    behavior: scrollOptions.behavior || 'smooth',
  });
}
