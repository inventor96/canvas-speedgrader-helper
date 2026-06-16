import levenshtein from 'js-levenshtein-esm';

function tier1Exact(text, excerpt) {
  const idx = text.indexOf(excerpt);
  if (idx === -1) return null;
  return { start: idx, end: idx + excerpt.length };
}

function tier2FuzzyRegex(text, excerpt) {
  const escaped = excerpt
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special regex characters
    .replace(/\s+/g, '\\s+') // Allow flexible whitespace
    .replace(/['']/g, "[''']") // Handle apostrophes by allowing for common OCR errors (e.g., ' vs ’)
    .replace(/[""]/g, '[""]'); // Handle quotation marks similarly
  const regex = new RegExp(escaped, 'i');
  const match = regex.exec(text);
  if (!match) return null;
  return { start: match.index, end: match.index + match[0].length };
}

function buildWordOffsets(text) {
  const words = text.split(/\s+/);
  const offsets = [];
  let offset = 0;
  for (const word of words) {
    offsets.push(offset);
    offset += word.length + 1;
  }
  return { words, offsets };
}

function tier3Levenshtein(text, excerpt) {
  const excerptWords = excerpt.split(/\s+/);
  if (excerptWords.length === 0) return null;

  const { words: textWords, offsets } = buildWordOffsets(text);
  if (textWords.length < excerptWords.length) return null;

  const threshold = Math.ceil(excerpt.length * 0.15);
  let bestDist = Infinity;
  let bestStartIdx = -1;

  for (let i = 0; i <= textWords.length - excerptWords.length; i++) {
    const window = textWords.slice(i, i + excerptWords.length);
    const windowStr = window.join(' ');
    const dist = levenshtein(windowStr, excerpt);
    if (dist < bestDist) {
      bestDist = dist;
      bestStartIdx = i;
    }
  }

  if (bestStartIdx === -1 || bestDist > threshold) return null;

  const start = offsets[bestStartIdx];
  const endIdx = bestStartIdx + excerptWords.length - 1;
  const end = offsets[endIdx] + textWords[endIdx].length;

  return { start, end };
}

export function findExcerpt(submissionText, excerpt) {
  if (!submissionText || !excerpt) return null;

  const exact = tier1Exact(submissionText, excerpt);
  if (exact) return exact;

  const fuzzy = tier2FuzzyRegex(submissionText, excerpt);
  if (fuzzy) return fuzzy;

  return tier3Levenshtein(submissionText, excerpt);
}
