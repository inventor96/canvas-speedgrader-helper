import { HIGHLIGHT_CONFIG } from '../../../shared/highlight-config.js';

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function ensureHighlightStyles() {
  if (document.querySelector('style[data-csh-highlight-styles]')) {
    return;
  }

  const rules = HIGHLIGHT_CONFIG.map((h) =>
    `::highlight(${h.className}) { background-color: ${hexToRgba(h.color, 0.4)}; cursor: pointer; }`
  ).join('\n');

  if (!rules) {
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-csh-highlight-styles', '');
  style.textContent = rules;
  document.head?.appendChild(style);
}
