import { observeUntil } from '../../../shared/observe-until.js';

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

export function waitForElement(selector, timeoutMs = 15000, container = document.body) {
  return observeUntil(() => document.querySelector(selector), {
    timeout: timeoutMs,
    container,
  });
}
