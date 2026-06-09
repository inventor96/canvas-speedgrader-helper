/**
 * Highlight Configuration
 *
 * Single source of truth for highlight class names and colors used by the
 * submission highlighting pipeline. Both page-context scripts (speedgrader.js)
 * and iframe-content adapters (document-renderer, discussion-posts) reference
 * the same list to ensure consistency.
 *
 * Each entry defines:
 *   - className: used as the CSS custom highlight name (::highlight()) and as
 *                the identifier passed through the pipeline
 *   - color:     the background-color applied to the highlight
 */
(() => {
  'use strict';

  const HIGHLIGHT_CONFIG = Object.freeze([
    { className: 'csh-highlight-yellow',   color: '#fef08a' },
    { className: 'csh-highlight-green',    color: '#bbf7d0' },
    { className: 'csh-highlight-blue',     color: '#bfdbfe' },
    { className: 'csh-highlight-red',      color: '#fecaca' },
    { className: 'csh-highlight-purple',   color: '#e9d5ff' },
    { className: 'csh-highlight-orange',   color: '#fed7aa' },
    { className: 'csh-highlight-amber',    color: '#fde68a' },
    { className: 'csh-highlight-emerald',  color: '#a7f3d0' },
    { className: 'csh-highlight-indigo',   color: '#c7d2fe' },
    { className: 'csh-highlight-pink',     color: '#fbcfe8' },
  ]);

  if (typeof window !== 'undefined') {
    window.CSH_HighlightConfig = HIGHLIGHT_CONFIG;
  }
})();
