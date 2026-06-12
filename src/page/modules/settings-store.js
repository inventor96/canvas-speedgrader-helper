const _values = {};
const _listeners = new Set();

export function get(key) {
  return _values[key];
}

export function set(key, value) {
  _values[key] = value;
  _notify(key, value);
}

export function applyAll(obj) {
  if (!obj) return;
  Object.assign(_values, obj);
  _notify('*', _values);
}

export function onChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function _notify(key, value) {
  _listeners.forEach(fn => {
    try { fn(key, value); } catch {}
  });
}

export const auxState = {
  lastTouchedStudentId: null,
  touchedPoints: new Set(),
};

export const BLANK_DROPDOWN_VALUES = {};
