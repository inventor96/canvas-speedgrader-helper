// Shared DOM helpers: safe listeners, escaping, name normalization, element wait
import { observeUntil } from '@/shared/observe-until.js';

/**
 * Attach an event listener only once per element, keyed by a boolean flag property.
 * Returns true if attached, false if element is missing or already has the listener.
 */
export function attachEventListenerIdempotent(element, eventType, handler, flagProperty) {
  if (!element) return false;
  if (element[flagProperty]) return false;
  element[flagProperty] = true;
  element.addEventListener(eventType, handler);
  return true;
}

/** Escape HTML special characters for safe insertion into text content */
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

/** Normalize a name: lowercase, trimmed, collapsed whitespace */
export function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Wait for a DOM element matching selector to appear, with configurable timeout */
export function waitForElement(selector, timeoutMs = 15000, container = document.body) {
  return observeUntil(() => document.querySelector(selector), {
    timeout: timeoutMs,
    container,
  });
}
