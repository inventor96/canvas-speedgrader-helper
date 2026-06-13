import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { getGroupTripletCacheKey, pruneGroupTripletCache, withGroupTripletCache, groupTripletCache, persistGroupTripletCache } from './group-triplet-cache.js';
import { PENDING_CHECK_TTL_MS, pendingGroupsChecks, normalizeCourseGroupsUrl, safeSendToTab, closeTabIfPresent } from './groups-check-state.js';

function cleanupStaleChecks() {
  const now = Date.now();
  for (const [groupsTabId, entry] of pendingGroupsChecks.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > PENDING_CHECK_TTL_MS) {
      pendingGroupsChecks.delete(groupsTabId);
    }
  }

  pruneGroupTripletCache(now);
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

    const noAutoClose = !!message.noAutoClose;

    chrome.tabs.create({ url: groupsUrl, active: noAutoClose }, (tab) => {
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
        noAutoClose,
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

    safeSendToTab(pending.originTabId, resultPayload);

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

  if (message.type === CSH_MESSAGE_TYPES.CLICK_QUEUE_COMPLETE_AFTER_COMMENT) {
    const senderTabId = sender?.tab?.id;
    const payload = {
      type: CSH_MESSAGE_TYPES.CLICK_QUEUE_COMPLETE_AFTER_COMMENT,
      queuedName: message.queuedName || '',
      autoOpenNextQueueItemAfterComplete: message.autoOpenNextQueueItemAfterComplete,
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

  sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` });
  return;
});
