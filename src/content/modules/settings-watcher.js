import { CSH_MESSAGE_TYPES } from '../../shared/message-types.js';
import { getAllSettings } from './settings-injector.js';

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    const changeKeys = Object.keys(changes || {});
    const nonMetaKeys = changeKeys.filter((key) => key !== 'savedPointsMeta' && key !== 'studentNamesMeta');
    if (nonMetaKeys.length === 0) return;

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

    getAllSettings((settings) => {
      try {
        window.postMessage({ type: CSH_MESSAGE_TYPES.UPDATE_SETTINGS, settings, studentNameChanges }, '*');
      } catch (e) {}
    });
  });
}
