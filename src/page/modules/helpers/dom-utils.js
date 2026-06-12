export function attachEventListenerIdempotent(element, eventType, handler, flagProperty) {
  if (!element) return false;
  if (element[flagProperty]) return false;
  element[flagProperty] = true;
  element.addEventListener(eventType, handler);
  return true;
}

export function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text || '').replace(/[&<>"']/g, (m) => map[m]);
}

export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}
