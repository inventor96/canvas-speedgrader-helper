import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { getGroupTripletCacheKey, pruneGroupTripletCache, withGroupTripletCache, groupTripletCache, persistGroupTripletCache } from './group-triplet-cache.js';
import { PENDING_CHECK_TTL_MS, pendingGroupsChecks, normalizeCourseGroupsUrl, safeSendToTab, closeTabIfPresent } from './groups-check-state.js';
import { sendChatRequest } from './llm-service.js';

/** Removes expired pending checks and prunes stale triplet cache entries. */
function cleanupStaleChecks() {
  const now = Date.now();
  for (const [groupsTabId, entry] of pendingGroupsChecks.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > PENDING_CHECK_TTL_MS) {
      pendingGroupsChecks.delete(groupsTabId);
    }
  }

  pruneGroupTripletCache(now);
}

/** Routes runtime messages between content scripts, popup, and the groups page. */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  cleanupStaleChecks();

  if (!message || !message.type) {
    sendResponse({ ok: false, error: 'Missing message type.' });
    return;
  }

  // === Groups Check: open a groups page tab for cross-referencing names ===
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

  // === Group Triplet Cache: upsert an entry ===
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

  // === Group Triplet Cache: lookup an entry ===
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

  // === Groups Check: return pending context to the groups page ===
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

  // === Groups Check: relay result back to origin tab (and all other tabs) ===
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
      noAutoClose: pending.noAutoClose,
    };

    // Send to origin tab
    safeSendToTab(pending.originTabId, resultPayload);

    // Broadcast to all tabs
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

  // === Groups Check: relay grading status to all tabs ===
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

  // === SpeedGrader tab: close by tab ID ===
  if (message.type === CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB) {
    closeTabIfPresent(sender?.tab?.id);
    sendResponse({ ok: true });
    return;
  }

  // === Queue: click "Complete" after comment submitted ===
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

  // === LLM Chat Request: forward to the configured endpoint ===
  if (message.type === CSH_MESSAGE_TYPES.LLM_CHAT_REQUEST) {
    const messages = Array.isArray(message.messages) ? message.messages : [];
    if (messages.length === 0) {
      sendResponse({ ok: false, error: 'No messages provided.' });
      return;
    }

    sendChatRequest(messages, message.options || {})
      .then((response) => {
        if (response === null) {
          sendResponse({ ok: true, disabled: true, response: null });
        } else {
          sendResponse({ ok: true, disabled: false, response });
        }
      })
      .catch((err) => {
        sendResponse({ ok: false, error: err.message });
      });

    return true;
  }

  sendResponse({ ok: false, error: `Unhandled message type: ${message.type}` });
  return;
});
