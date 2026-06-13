/** TTL for pending groups checks (5 minutes). */
export const PENDING_CHECK_TTL_MS = 5 * 60 * 1000;
/** Map of groups tab IDs to pending check context (origin tab, names, timestamps). */
export const pendingGroupsChecks = new Map();

/** Derives the Canvas Groups page URL from a SpeedGrader course URL. */
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

/** Sends a message to a tab, swallowing runtime errors (tab may be closed). */
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

/** Closes a tab if the tab ID is valid, swallowing errors. */
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
