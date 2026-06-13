/** In-memory reactive settings store. */
const _values = {};
const _listeners = new Set();

/** Returns a setting value by key. */
export function get(key) {
  return _values[key];
}

/** Sets a single setting and notifies listeners. */
export function set(key, value) {
  _values[key] = value;
  _notify(key, value);
}

/** Applies a batch of settings from an object and notifies listeners. */
export function applyAll(obj) {
  if (!obj) return;
  Object.assign(_values, obj);
  _notify('*', _values);
}

/** Registers a change listener; returns an unsubscribe function. */
export function onChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify(key, value) {
  _listeners.forEach(fn => {
    try { fn(key, value); } catch {}
  });
}

/** Non-persistent auxiliary state used across modules. */
export const auxState = {
  lastTouchedStudentId: null,
  touchedPoints: new Set(),
};

/** Cached blank/dropdown placeholder values keyed by criterion ID. */
export const BLANK_DROPDOWN_VALUES = {};
