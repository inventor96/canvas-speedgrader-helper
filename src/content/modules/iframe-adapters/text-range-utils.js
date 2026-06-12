export function buildTextNodes(elements, separator) {
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
    while ((node = walker.nextNode())) {
      const content = node.textContent;
      if (content.length > 0) {
        textNodes.push({
          node,
          startOffset: charOffset,
          endOffset: charOffset + content.length,
        });
        charOffset += content.length;
        partText += content;
      }
    }
    partTexts.push(partText);

    if (index < elements.length - 1) {
      charOffset += separator.length;
    }
  });

  const text = partTexts.join(separator);
  return { textNodes, text };
}

export function getRangeBetweenOffsets(textNodes, startOffset, endOffset) {
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
