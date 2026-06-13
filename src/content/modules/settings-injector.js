import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { SYNCED_SETTINGS, LOCAL_SETTINGS } from '@/shared/settings.js';
import { initializeLimits, touchMeta, pruneSavedPoints, normalizeMetaKeys, saveStudentNamesWithPrune } from '@/shared/storage-utils.js';

if (typeof initializeLimits === 'function') {
  initializeLimits().catch((e) => {});
}

function applySettingsToDOM(settings) {
  document.head.setAttribute('data-csh-settings', JSON.stringify(settings));
}

function getSync(cb) {
  if (chrome.storage.sync && chrome.storage.sync.get) {
    chrome.storage.sync.get(SYNCED_SETTINGS, cb);
  } else {
    cb(SYNCED_SETTINGS);
  }
}

function getLocal(cb) {
  if (chrome.storage.local && chrome.storage.local.get) {
    chrome.storage.local.get(LOCAL_SETTINGS, cb);
  } else {
    cb(LOCAL_SETTINGS);
  }
}

function mergeWithDefaults(defaults, data) {
  const merged = {};
  Object.keys(defaults).forEach((key) => {
    if (data && Object.prototype.hasOwnProperty.call(data, key)) {
      merged[key] = data[key];
    } else {
      merged[key] = defaults[key];
    }
  });
  return merged;
}

function getCurrentCanvasStudentFullName() {
  const selectedStudent = document.querySelector(
    'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
  );
  let fullName = selectedStudent?.textContent?.trim() || '';

  if (!fullName) {
    return '';
  }

  if (fullName.endsWith('\u2026')) {
    try {
      const truncatedName = fullName.slice(0, -1).trim();
      if (truncatedName) {
        const fullNameElement = document.querySelector(
          `button[data-testid="student-select-trigger"] [name^="${truncatedName}"]`
        );
        const attrName = fullNameElement?.getAttribute('name');
        if (attrName && attrName.trim()) {
          fullName = attrName.trim();
        }
      }
    } catch (e) {}
  }

  return fullName;
}

function getAllSettings(cb) {
  getSync((syncData) => {
    getLocal((localData) => {
      const syncedSettings = mergeWithDefaults(SYNCED_SETTINGS, syncData);
      const localSettings = mergeWithDefaults(LOCAL_SETTINGS, localData);
      const settings = {
        ...syncedSettings,
        ...localSettings,
      };
      cb(settings);
    });
  });
}

function handleSameGroupGradingStatus(queuedName, isGraded) {
  if (!chrome.runtime || !chrome.runtime.sendMessage) return;

  if (isGraded) {
    chrome.storage.sync.get(['autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded'], (data) => {
      if (data.autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded) {
        chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
          void chrome.runtime?.lastError;
        });
      }
    });
  }

  chrome.runtime.sendMessage({
    type: CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS,
    queuedName: queuedName || '',
    sameGroup: true,
    isGraded: !!isGraded,
  }, () => {
    void chrome.runtime?.lastError;
  });
}

applySettingsToDOM({
  ...SYNCED_SETTINGS,
  ...LOCAL_SETTINGS,
});

if (typeof chrome !== 'undefined' && chrome.storage) {
  getAllSettings((settings) => {
    applySettingsToDOM(settings);
    try {
      window.postMessage({ type: CSH_MESSAGE_TYPES.UPDATE_SETTINGS, settings, studentNameChanges: null }, '*');
    } catch (e) {}
  });
}

export { getCurrentCanvasStudentFullName, getAllSettings, handleSameGroupGradingStatus };
