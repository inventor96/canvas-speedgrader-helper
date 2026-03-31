/* global CSH_MESSAGE_TYPES */

try {
  importScripts('../shared/message-types.js');
} catch (e) {
  // Keep running with fallback message constants.
}

const PENDING_CHECK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const GROUP_TRIPLET_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const GROUP_TRIPLET_CACHE_STORAGE_KEY = 'groupTripletCache';
const pendingGroupsChecks = new Map();
const groupTripletCache = new Map();
let hasLoadedGroupTripletCache = false;
let isLoadingGroupTripletCache = false;
const groupTripletCacheLoadQueue = [];

function cleanupStaleChecks() {
  const now = Date.now();
  for (const [groupsTabId, entry] of pendingGroupsChecks.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > PENDING_CHECK_TTL_MS) {
      pendingGroupsChecks.delete(groupsTabId);
    }
  }

  pruneGroupTripletCache(now);
}

function getGroupTripletCacheKey(courseId, assignmentId, studentId) {
  const normalizedCourseId = String(courseId || '').trim();
  const normalizedAssignmentId = String(assignmentId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();

  if (!normalizedCourseId || !normalizedAssignmentId || !normalizedStudentId) {
    return null;
  }

  return `${normalizedCourseId}|${normalizedAssignmentId}|${normalizedStudentId}`;
}

function pruneGroupTripletCache(now = Date.now()) {
  let removedAny = false;

  for (const [key, entry] of groupTripletCache.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > GROUP_TRIPLET_CACHE_TTL_MS) {
      groupTripletCache.delete(key);
      removedAny = true;
    }
  }

  return removedAny;
}

function loadGroupTripletCache(callback) {
  if (hasLoadedGroupTripletCache) {
    callback();
    return;
  }

  groupTripletCacheLoadQueue.push(callback);
  if (isLoadingGroupTripletCache) {
    return;
  }

  isLoadingGroupTripletCache = true;

  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) {
    hasLoadedGroupTripletCache = true;
    isLoadingGroupTripletCache = false;
    while (groupTripletCacheLoadQueue.length) {
      const queuedCallback = groupTripletCacheLoadQueue.shift();
      try {
        queuedCallback();
      } catch (e) {
        // Ignore callback failures.
      }
    }
    return;
  }

  chrome.storage.local.get({ [GROUP_TRIPLET_CACHE_STORAGE_KEY]: {} }, (data) => {
    const storedEntries = data && data[GROUP_TRIPLET_CACHE_STORAGE_KEY];

    if (storedEntries && typeof storedEntries === 'object') {
      Object.entries(storedEntries).forEach(([key, value]) => {
        const createdAt = value && Number.isFinite(value.createdAt) ? value.createdAt : 0;
        if (key && createdAt > 0) {
          groupTripletCache.set(key, { createdAt });
        }
      });
    }

    hasLoadedGroupTripletCache = true;
    isLoadingGroupTripletCache = false;

    while (groupTripletCacheLoadQueue.length) {
      const queuedCallback = groupTripletCacheLoadQueue.shift();
      try {
        queuedCallback();
      } catch (e) {
        // Ignore callback failures.
      }
    }
  });
}

function persistGroupTripletCache(callback) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) {
    if (typeof callback === 'function') callback();
    return;
  }

  const serialized = {};
  groupTripletCache.forEach((entry, key) => {
    serialized[key] = { createdAt: entry.createdAt };
  });

  chrome.storage.local.set({ [GROUP_TRIPLET_CACHE_STORAGE_KEY]: serialized }, () => {
    if (typeof callback === 'function') callback();
  });
}

function withGroupTripletCache(callback) {
  loadGroupTripletCache(() => {
    const removedAny = pruneGroupTripletCache();
    if (removedAny) {
      persistGroupTripletCache(() => callback());
      return;
    }

    callback();
  });
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
    sendResponse({ ok: false, error: 'Missing message type.' });
    return;
  }

  if (message.type === CSH_MESSAGE_TYPES.START_GROUPS_CHECK) {
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

    chrome.tabs.create({ url: groupsUrl, active: false }, (tab) => {
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
        noAutoClose: !!message.noAutoClose,
        createdAt: Date.now(),
      });

      sendResponse({ ok: true, groupsTabId: tab.id });
    });

    return true;
  }

  if (message.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT) {
    const key = getGroupTripletCacheKey(message.courseId, message.assignmentId, message.studentId);
    if (!key) {
      sendResponse({ ok: false, error: 'Invalid triplet cache upsert request.' });
      return;
    }

    withGroupTripletCache(() => {
      groupTripletCache.set(key, { createdAt: Date.now() });
      persistGroupTripletCache(() => {
        sendResponse({ ok: true, key });
      });
    });

    return true;
  }

  if (message.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP) {
    const key = getGroupTripletCacheKey(message.courseId, message.assignmentId, message.studentId);
    if (!key) {
      sendResponse({ ok: false, error: 'Invalid triplet cache lookup request.' });
      return;
    }

    withGroupTripletCache(() => {
      const entry = groupTripletCache.get(key) || null;
      sendResponse({
        ok: true,
        hit: !!entry,
        key,
        createdAt: entry ? entry.createdAt : null,
      });
    });

    return true;
  }

  if (message.type === CSH_MESSAGE_TYPES.GROUPS_GET_PENDING_CONTEXT) {
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

  if (message.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_COMPLETE) {
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
      type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
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
    if (!pending.noAutoClose) {
      closeTabIfPresent(groupsTabId);
    }
    sendResponse({ ok: true });
    return;
  }

  if (message.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS) {
    const senderTabId = sender?.tab?.id;
    const payload = {
      type: CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS,
      queuedName: message.queuedName || '',
      sameGroup: !!message.sameGroup,
      isGraded: !!message.isGraded,
    };
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        if (tab.id !== senderTabId) {
          safeSendToTab(tab.id, payload);
        }
      });
    });
    sendResponse({ ok: true });
    return;
  }

  if (message.type === CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB) {
    closeTabIfPresent(sender?.tab?.id);
    sendResponse({ ok: true });
    return;
  }

  // Always respond to avoid "message port closed" for unknown/unhandled message types.
  sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` });
  return;
});
