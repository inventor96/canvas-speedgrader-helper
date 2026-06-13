import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { SYNCED_SETTINGS, LOCAL_SETTINGS } from '@/shared/settings.js';
import { initializeLimits, touchMeta, pruneSavedPoints, normalizeMetaKeys, saveStudentNamesWithPrune } from '@/shared/storage-utils.js';

if (typeof initializeLimits === 'function') {
  initializeLimits().catch((e) => {});
}

/** Writes settings to a data attribute on <head> for the MAIN-world script to read. */
function applySettingsToDOM(settings) {
  document.head.setAttribute('data-csh-settings', JSON.stringify(settings));
}

/** Reads synced settings, falling back to defaults. */
function getSync(cb) {
  if (chrome.storage.sync && chrome.storage.sync.get) {
    chrome.storage.sync.get(SYNCED_SETTINGS, cb);
  } else {
    cb(SYNCED_SETTINGS);
  }
}

/** Reads local settings, falling back to defaults. */
function getLocal(cb) {
  if (chrome.storage.local && chrome.storage.local.get) {
    chrome.storage.local.get(LOCAL_SETTINGS, cb);
  } else {
    cb(LOCAL_SETTINGS);
  }
}

/** Merges a partial data object over the full defaults, preserving missing keys. */
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

/** Reads the current Canvas student full name from the SpeedGrader student selector. */
function getCurrentCanvasStudentFullName() {
  const selectedStudent = document.querySelector(
    'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
  );
  let fullName = selectedStudent?.textContent?.trim() || '';

  if (!fullName) {
    return '';
  }

  // Handle truncated names with ellipsis by falling back to the name attribute
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

/** Reads all settings (synced + local) and returns them merged. */
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

/** Handles grading status logic when a groups check confirms same-group. */
function handleSameGroupGradingStatus(queuedName, isGraded) {
  if (!chrome.runtime || !chrome.runtime.sendMessage) return;

  // Auto-close SpeedGrader tab if the assignment is graded and the setting is enabled
  if (isGraded) {
    chrome.storage.sync.get(['autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded'], (data) => {
      if (data.autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded) {
        chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
          void chrome.runtime?.lastError;
        });
      }
    });
  }

  // Broadcast grading status to all tabs
  chrome.runtime.sendMessage({
    type: CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS,
    queuedName: queuedName || '',
    sameGroup: true,
    isGraded: !!isGraded,
  }, () => {
    void chrome.runtime?.lastError;
  });
}

// Apply defaults immediately; update with stored values once loaded
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
