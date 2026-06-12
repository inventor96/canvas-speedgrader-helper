import { HIGHLIGHT_CONFIG } from '../../shared/highlight-config.js';

const _config = HIGHLIGHT_CONFIG;
let _used = [];

export function getNext() {
  const all = _config;
  if (all.length === 0) return null;

  if (_used.length < all.length) {
    const usedSet = new Set(_used);
    const available = all.filter((item) => !usedSet.has(item.className));
    const chosen = available[Math.floor(Math.random() * available.length)];
    _used.push(chosen.className);
    return chosen.className;
  }

  const keepLast2 = _used.slice(-2);
  _used = keepLast2.slice();

  const excludedSet = new Set(keepLast2);
  const available = all.filter((item) => !excludedSet.has(item.className));
  const chosen = available[Math.floor(Math.random() * available.length)];
  _used.push(chosen.className);
  return chosen.className;
}

export function reset() {
  _used = [];
}
