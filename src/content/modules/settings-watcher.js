import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { getAllSettings } from './settings-injector.js';

/** Listens for chrome.storage changes and forwards updated settings to the MAIN world. */
if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // Ignore changes to meta-only keys (lastUsed timestamps)
    const changeKeys = Object.keys(changes || {});
    const nonMetaKeys = changeKeys.filter((key) => key !== 'savedPointsMeta' && key !== 'studentNamesMeta');
    if (nonMetaKeys.length === 0) return;

    // Build a diff of student name changes
    let studentNameChanges = null;
    if (changes.studentNames) {
      const oldMap = changes.studentNames.oldValue || {};
      const newMap = changes.studentNames.newValue || {};
      const keys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
      studentNameChanges = {};
      keys.forEach((k) => {
        const oldV = oldMap[k];
        const newV = newMap[k];
        if (oldV !== newV) {
          studentNameChanges[k] = { old: oldV, new: newV };
        }
      });
    }

    // Reload all settings and forward to MAIN world
    getAllSettings((settings) => {
      try {
        window.postMessage({ type: CSH_MESSAGE_TYPES.UPDATE_SETTINGS, settings, studentNameChanges }, '*');
      } catch (e) {}
    });
  });
}
