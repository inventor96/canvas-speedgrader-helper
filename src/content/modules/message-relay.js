import { CSH_MESSAGE_TYPES } from '../../shared/message-types.js';
import { touchMeta, pruneSavedPoints, normalizeMetaKeys } from '../../shared/storage-utils.js';
import { getCurrentCanvasStudentFullName, handleSameGroupGradingStatus } from './settings-injector.js';

function logStorageWarning(message, detail) {
  try {
    if (detail) {
      console.warn(message, detail);
    } else {
      console.warn(message);
    }
  } catch (e) {}
}

window.addEventListener('message', (event) => {
  try {
    if (!event || event.source !== window) return;

    const msg = event.data;
    if (!msg || !msg.type) return;

    if (msg.type === CSH_MESSAGE_TYPES.SAVE_POINTS) {
      const pointsToSave = msg.pointsToSave || {};
      if (Object.keys(pointsToSave).length === 0) return;

      if (chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get({ savedPoints: {}, savedPointsMeta: { lastUsed: {} } }, (data) => {
          const currentPoints = data.savedPoints || {};
          const currentMeta = data.savedPointsMeta || { lastUsed: {} };

          const mergedPoints = { ...currentPoints, ...pointsToSave };

          const touchedMeta = touchMeta(currentMeta, Object.keys(pointsToSave));
          const pruned = pruneSavedPoints(mergedPoints, touchedMeta);

          chrome.storage.sync.set({
            savedPoints: pruned.map,
            savedPointsMeta: pruned.meta
          }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              logStorageWarning('CSH storage warning: failed saving savedPoints.', chrome.runtime.lastError.message);
            }
            if (pruned.prunedKeys && pruned.prunedKeys.length) {
              logStorageWarning('CSH storage warning: pruned savedPoints entries.', pruned.prunedKeys.length);
            }
          });
        });
      }
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.TOUCH_POINTS) {
      if (!chrome.storage || !chrome.storage.sync) return;
      const keys = Array.isArray(msg.keys) ? msg.keys : [];
      if (keys.length === 0) return;

      chrome.storage.sync.get({ savedPoints: {}, savedPointsMeta: { lastUsed: {} } }, (data) => {
        const currentPoints = data.savedPoints || {};
        const currentMeta = data.savedPointsMeta || { lastUsed: {} };
        const touched = touchMeta(currentMeta, keys);
        const normalized = normalizeMetaKeys(currentPoints, touched);
        chrome.storage.sync.set({ savedPointsMeta: normalized }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logStorageWarning('CSH storage warning: failed touching savedPoints.', chrome.runtime.lastError.message);
          }
        });
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.TOUCH_STUDENT_NAME) {
      if (!chrome.storage || !chrome.storage.local) return;
      const key = msg.key;
      if (!key) return;

      chrome.storage.local.get({ studentNames: {}, studentNamesMeta: { lastUsed: {} } }, (data) => {
        const currentNames = data.studentNames || {};
        const currentMeta = data.studentNamesMeta || { lastUsed: {} };
        const touched = touchMeta(currentMeta, [key]);
        const normalized = normalizeMetaKeys(currentNames, touched);
        chrome.storage.local.set({ studentNamesMeta: normalized }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logStorageWarning('CSH storage warning: failed touching studentNames.', chrome.runtime.lastError.message);
          }
        });
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.CLEAR_QUEUED_STUDENT) {
      if (!chrome.storage || !chrome.storage.local) return;
      chrome.storage.local.remove('queuedStudentName', () => {
        if (chrome.runtime && chrome.runtime.lastError) {
          logStorageWarning('CSH storage warning: failed clearing queuedStudentName.', chrome.runtime.lastError.message);
        }
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.SAVE_STUDENT_NAME) {
      const studentId = typeof msg.studentId === 'string' ? msg.studentId : '';
      const preferredName = typeof msg.preferredName === 'string' ? msg.preferredName : '';
      if (!studentId || !preferredName) return;
      if (!chrome.storage || !chrome.storage.local) return;

      chrome.storage.local.get({ studentNames: {}, studentNamesMeta: { lastUsed: {} } }, (data) => {
        const studentNames = data.studentNames || {};
        const currentMeta = data.studentNamesMeta || { lastUsed: {} };
        studentNames[studentId] = preferredName;
        const touched = touchMeta(currentMeta, [studentId]);

        chrome.storage.local.set({ studentNames, studentNamesMeta: touched }, () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logStorageWarning('CSH storage warning: failed saving student name.', chrome.runtime.lastError.message);
          }
        });
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.START_GROUPS_CHECK) {
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;
      const queuedName = typeof msg.queuedName === 'string' ? msg.queuedName : '';
      const speedgraderName = typeof msg.speedgraderName === 'string' ? msg.speedgraderName : '';
      const noAutoClose = !!msg.noAutoClose;
      chrome.runtime.sendMessage({
        type: CSH_MESSAGE_TYPES.START_GROUPS_CHECK,
        queuedName,
        speedgraderName,
        noAutoClose,
      }, (response) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          logStorageWarning('CSH groups check warning: failed starting groups check.', chrome.runtime.lastError.message);
          try {
            window.postMessage({
              type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
              queuedName,
              speedgraderName,
              sameGroup: false,
              groupsCount: 0,
              error: chrome.runtime.lastError.message,
            }, '*');
          } catch (e) {}
          return;
        }

        if (response && response.ok) return;

        try {
          window.postMessage({
            type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
            queuedName,
            speedgraderName,
            sameGroup: false,
            groupsCount: 0,
            error: (response && response.error) ? response.error : 'Failed to open groups page.',
          }, '*');
        } catch (e) {}
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT) {
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;

      chrome.runtime.sendMessage({
        type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT,
        courseId: msg.courseId,
        assignmentId: msg.assignmentId,
        studentId: msg.studentId,
      }, () => {
        void chrome.runtime?.lastError;
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP) {
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;

      chrome.runtime.sendMessage({
        type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP,
        requestId: msg.requestId,
        courseId: msg.courseId,
        assignmentId: msg.assignmentId,
        studentId: msg.studentId,
      }, (response) => {
        const error = chrome.runtime?.lastError?.message || (response && response.error) || null;

        try {
          window.postMessage({
            type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP_RESULT,
            requestId: msg.requestId,
            courseId: msg.courseId || '',
            assignmentId: msg.assignmentId || '',
            studentId: msg.studentId || '',
            hit: !!response?.hit,
            createdAt: response?.createdAt || null,
            error,
          }, '*');
        } catch (e) {}
      });
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.TRIGGER_GROUP_MATCH_GRADING_STATUS) {
      handleSameGroupGradingStatus(msg.queuedName || '', !!msg.isGraded);
      return;
    }

    if (msg.type === CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB) {
      if (!chrome.runtime || !chrome.runtime.sendMessage) return;

      chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
        void chrome.runtime?.lastError;
      });
    }
  } catch (e) {}
});

if (chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg && msg.type === CSH_MESSAGE_TYPES.POPUP_JUMP_TO_STUDENT_GROUPS) {
        const canvasFullName = getCurrentCanvasStudentFullName();
        if (!canvasFullName) {
          sendResponse({ ok: false, error: 'Could not determine the current Canvas student name.' });
          return;
        }

        if (!chrome.runtime || !chrome.runtime.sendMessage) {
          sendResponse({ ok: false, error: 'Runtime messaging is not available.' });
          return;
        }

        chrome.runtime.sendMessage({
          type: CSH_MESSAGE_TYPES.START_GROUPS_CHECK,
          queuedName: canvasFullName,
          speedgraderName: canvasFullName,
          noAutoClose: true,
        }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }

          if (!response || !response.ok) {
            sendResponse({
              ok: false,
              error: (response && response.error) ? response.error : 'Could not open groups page.',
            });
            return;
          }

          sendResponse({ ok: true, studentName: canvasFullName });
        });

        return true;
      }

      if (!msg || msg.type !== CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT) return;

      const sameGroup = !!msg.sameGroup;
      const isGraded = !!document.querySelector('[data-testid="graded-icon"]');

      if (sameGroup) {
        handleSameGroupGradingStatus(msg.queuedName || '', isGraded);
      }

      window.postMessage({
        type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
        queuedName: msg.queuedName || '',
        speedgraderName: msg.speedgraderName || '',
        sameGroup,
        isGraded,
        matchedGroupHeader: msg.matchedGroupHeader || '',
        groupsCount: Number.isFinite(msg.groupsCount) ? msg.groupsCount : 0,
        error: msg.error || null,
        checkedAt: msg.checkedAt || Date.now(),
      }, '*');
    } catch (e) {}
  });
}
