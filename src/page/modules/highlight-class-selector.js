// Cycles through CSS highlight class names from config, avoiding recent repeats
import { HIGHLIGHT_CONFIG } from '@/shared/highlight-config.js';

// Config reference and rolling list of recently-used class names
const _config = HIGHLIGHT_CONFIG;
let _used = [];

/** Return the next highlight class name, avoiding repeats where possible */
export function getNext() {
  const all = _config;
  // Bail if no highlight classes configured
  if (all.length === 0) return null;

  // First pass: pick any unused class at random
  if (_used.length < all.length) {
    const usedSet = new Set(_used);
    const available = all.filter((item) => !usedSet.has(item.className));
    const chosen = available[Math.floor(Math.random() * available.length)];
    _used.push(chosen.className);
    return chosen.className;
  }

  // All classes have been used at least once — just avoid the last 2
  const keepLast2 = _used.slice(-2);
  _used = keepLast2.slice();

  const excludedSet = new Set(keepLast2);
  const available = all.filter((item) => !excludedSet.has(item.className));
  const chosen = available[Math.floor(Math.random() * available.length)];
  _used.push(chosen.className);
  return chosen.className;
}

/** Reset the repeat-avoidance history */
export function reset() {
  _used = [];
}
