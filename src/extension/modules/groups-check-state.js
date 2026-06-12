export const PENDING_CHECK_TTL_MS = 5 * 60 * 1000;
export const pendingGroupsChecks = new Map();

export function normalizeCourseGroupsUrl(tabUrl) {
  if (!tabUrl) return null;

  try {
    const parsed = new URL(tabUrl);
    const match = parsed.pathname.match(/\/courses\/(\d+)/i);
    if (!match || !match[1]) return null;
    return `${parsed.origin}/courses/${match[1]}/groups`;
  } catch (e) {
    return null;
  }
}

export function safeSendToTab(tabId, payload) {
  if (!tabId || !payload) return;

  try {
    chrome.tabs.sendMessage(tabId, payload, () => {
      void chrome.runtime?.lastError;
    });
  } catch (e) {
    // Ignore send failures (tab may be gone).
  }
}

export function closeTabIfPresent(tabId) {
  if (!tabId) return;

  try {
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime?.lastError;
    });
  } catch (e) {
    // Ignore close failures.
  }
}
