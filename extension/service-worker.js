/* global CSH_MESSAGE_TYPES */

try {
  importScripts('shared/message-types.js');
} catch (e) {
  // Keep running with fallback message constants.
}

const MESSAGE_TYPES = (typeof CSH_MESSAGE_TYPES !== 'undefined')
  ? CSH_MESSAGE_TYPES
  : {
      START_GROUPS_CHECK: 'CSH_START_GROUPS_CHECK',
      GROUPS_GET_PENDING_CONTEXT: 'CSH_GROUPS_GET_PENDING_CONTEXT',
      GROUPS_CHECK_COMPLETE: 'CSH_GROUPS_CHECK_COMPLETE',
      GROUPS_CHECK_RESULT: 'CSH_GROUPS_CHECK_RESULT',
    };

const PENDING_CHECK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const pendingGroupsChecks = new Map();

function cleanupStaleChecks() {
  const now = Date.now();
  for (const [groupsTabId, entry] of pendingGroupsChecks.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > PENDING_CHECK_TTL_MS) {
      pendingGroupsChecks.delete(groupsTabId);
    }
  }
}

function normalizeCourseGroupsUrl(tabUrl) {
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

function safeSendToTab(tabId, payload) {
  if (!tabId || !payload) return;

  try {
    chrome.tabs.sendMessage(tabId, payload, () => {
      void chrome.runtime?.lastError;
    });
  } catch (e) {
    // Ignore send failures (tab may be gone).
  }
}

function closeTabIfPresent(tabId) {
  if (!tabId) return;

  try {
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime?.lastError;
    });
  } catch (e) {
    // Ignore close failures.
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  cleanupStaleChecks();

  if (!message || !message.type) {
    return;
  }

  if (message.type === MESSAGE_TYPES.START_GROUPS_CHECK) {
    const originTabId = sender?.tab?.id;
    const originTabUrl = sender?.tab?.url;
    const queuedName = typeof message.queuedName === 'string' ? message.queuedName.trim() : '';
    const speedgraderName = typeof message.speedgraderName === 'string' ? message.speedgraderName.trim() : '';

    if (!originTabId || !originTabUrl || !queuedName || !speedgraderName) {
      sendResponse({ ok: false, error: 'Invalid groups-check request.' });
      return;
    }

    const groupsUrl = normalizeCourseGroupsUrl(originTabUrl);
    if (!groupsUrl) {
      sendResponse({ ok: false, error: 'Could not determine Canvas course groups URL.' });
      return;
    }

    chrome.tabs.create({ url: groupsUrl, active: true }, (tab) => {
      if (chrome.runtime.lastError || !tab || !tab.id) {
        sendResponse({
          ok: false,
          error: chrome.runtime.lastError?.message || 'Failed to open groups page.'
        });
        return;
      }

      pendingGroupsChecks.set(tab.id, {
        originTabId,
        originTabUrl,
        queuedName,
        speedgraderName,
        createdAt: Date.now(),
      });

      sendResponse({ ok: true, groupsTabId: tab.id });
    });

    return true;
  }

  if (message.type === MESSAGE_TYPES.GROUPS_GET_PENDING_CONTEXT) {
    const groupsTabId = sender?.tab?.id;
    if (!groupsTabId || !pendingGroupsChecks.has(groupsTabId)) {
      sendResponse({ ok: false, error: 'No pending groups check for this tab.' });
      return;
    }

    const pending = pendingGroupsChecks.get(groupsTabId);
    sendResponse({
      ok: true,
      context: {
        queuedName: pending.queuedName,
        speedgraderName: pending.speedgraderName,
      }
    });
    return;
  }

  if (message.type === MESSAGE_TYPES.GROUPS_CHECK_COMPLETE) {
    const groupsTabId = sender?.tab?.id;
    if (!groupsTabId) {
      sendResponse({ ok: false, error: 'Missing groups tab id.' });
      return;
    }

    const pending = pendingGroupsChecks.get(groupsTabId);
    if (!pending) {
      closeTabIfPresent(groupsTabId);
      sendResponse({ ok: false, error: 'No pending groups check state found.' });
      return;
    }

    const resultPayload = {
      type: MESSAGE_TYPES.GROUPS_CHECK_RESULT,
      queuedName: pending.queuedName,
      speedgraderName: pending.speedgraderName,
      sameGroup: !!message.sameGroup,
      matchedGroupHeader: message.matchedGroupHeader || '',
      groupsCount: Number.isFinite(message.groupsCount) ? message.groupsCount : 0,
      error: message.error || null,
      checkedAt: Date.now(),
    };

    // Send result to the speedgrader tab
    safeSendToTab(pending.originTabId, resultPayload);

    // Also broadcast to all other tabs (grading queue and others can listen and ignore if not relevant)
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== pending.originTabId) {
          safeSendToTab(tab.id, resultPayload);
        }
      });
    });

    pendingGroupsChecks.delete(groupsTabId);
    closeTabIfPresent(groupsTabId);
    sendResponse({ ok: true });
    return;
  }
});
