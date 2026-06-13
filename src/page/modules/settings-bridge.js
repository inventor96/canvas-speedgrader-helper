import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { applyAll, get } from './settings-store.js';
import { handleRubricFunctionality } from './rubric-controller.js';
import { applySettingsToEditors, applySettingsToTextareas, attachCommentLibraryTextareaListeners } from './placeholder-engine.js';
import { selectGroupCommentModeIfEnabled } from './comment-mode-controller.js';
import { getCurrentStudentNameFromPage, getStudentName } from './student-name-service.js';

let _featuresInitialized = false;

export function init() {
  try {
    const raw = document.head.getAttribute('data-csh-settings');
    if (!raw) {
      console.error('No settings found in data-csh-settings attribute. Exiting...');
      return false;
    }
    return applySettings(JSON.parse(raw));
  } catch (e) {
    console.error('Error initializing settings from data-csh-settings attribute:', e);
    return false;
  }
}

function applySettings(settingsData) {
  if (!settingsData) return false;
  applyAll(settingsData);
  return true;
}

export function attachSettingsUpdateListener() {
  window.addEventListener('message', (event) => {
    try {
      if (!event || event.source !== window) return;

      const msg = event.data;
      if (!msg || msg.type !== CSH_MESSAGE_TYPES.UPDATE_SETTINGS) return;

      const settingsData = msg.settings || {};
      const changes = msg.studentNameChanges || {};

      applySettings(settingsData);

      if (!_featuresInitialized) return;

      if (get('openRubricForUngraded')) {
        try {
          handleRubricFunctionality();
        } catch (e) {}
      }

      handleStudentNameChange(changes);

      applySettingsToEditors();
      applySettingsToTextareas();
      attachCommentLibraryTextareaListeners();
      selectGroupCommentModeIfEnabled();
    } catch (e) {
      console.error('Error handling CSH_UPDATE_SETTINGS message:', e);
    }
  });
}

function handleStudentNameChange(changes) {
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    const sid = params.get('student_id');

    if (!sid || !changes || !changes[sid] || changes[sid].old === changes[sid].new) {
      return;
    }

    const oldName = changes[sid].old || getCurrentStudentNameFromPage();
    const newName = changes[sid].new || getStudentName();
    if (!oldName || !newName) return;

    if (window.tinymce) {
      window.tinymce.editors.forEach((editor) => {
        try {
          const content = editor.getContent();
          if (!content || !content.includes(oldName)) return;
          const updated = content.replaceAll(oldName, newName);
          if (updated !== content) editor.setContent(updated);
        } catch (e) {
          console.error('Error updating editor content for student name change:', e);
        }
      });
    }
  } catch (e) {
    console.error('Error handling student name change:', e);
  }
}

export function waitForStoredSettings(callback) {
  let settled = false;

  const finish = () => {
    if (settled) return;
    settled = true;
    _featuresInitialized = true;
    callback();
  };

  const listener = (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.type !== CSH_MESSAGE_TYPES.UPDATE_SETTINGS) return;
    window.removeEventListener('message', listener);
    finish();
  };
  window.addEventListener('message', listener);

  setTimeout(finish, 2000);
}
