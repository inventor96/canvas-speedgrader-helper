import { logger } from '@/shared/logger.js';
import { get } from './settings-store.js';
import { attachEventListenerIdempotent } from './helpers/dom-utils.js';
import { getReplacementName } from './comment-mode-controller.js';
import { scrollRowIntoGradingPanelCenter } from './structured-rubric-ux.js';

/** Scrolls the Submit Comment button into the center of the grading panel. */
export function scrollToSubmitCommentButton() {
  const submitButton = document.querySelector(
    'button[data-testid="submit-comment-button"]'
  );
  if (!submitButton) return;

  try {
    scrollRowIntoGradingPanelCenter(submitButton);
    return;
  } catch (e) {}

  submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/** Replaces configured placeholders in a TinyMCE editor with the student/team name. */
export function replacePlaceholdersInEditor(editor) {
  try {
    const content = editor.getContent();
    if (!content) return;
    const placeholders = get('placeholders') || [];
    const hasPlaceholder = placeholders.some(ph => content.includes(ph));
    if (!hasPlaceholder) return;

    const name = getReplacementName();
    if (!name) return;

    let updated = content;
    placeholders.forEach(ph => {
      if (updated.includes(ph)) {
        updated = updated.replaceAll(ph, name);
      }
    });
    if (updated !== content) {
      editor.setContent(updated);
    }
  } catch (e) {
    logger.error('Error replacing placeholders in editor:', e);
  }
}

/** Applies placeholder replacement to all TinyMCE editors. */
export function applySettingsToEditors() {
  if (!window.tinymce) return;
  window.tinymce.editors.forEach(editor => replacePlaceholdersInEditor(editor));
}

/** Replaces configured placeholders in a textarea with the student/team name. */
export function replacePlaceholdersInTextarea(textarea) {
  try {
    const content = textarea.value;
    if (!content) return;
    const placeholders = get('placeholders') || [];
    const hasPlaceholder = placeholders.some(ph => content.includes(ph));
    if (!hasPlaceholder) return;

    const name = getReplacementName();
    if (!name) return;

    let updated = content;
    placeholders.forEach(ph => {
      if (updated.includes(ph)) {
        updated = updated.replaceAll(ph, name);
      }
    });
    if (updated !== content) {
      textarea.value = updated;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  } catch (e) {
    logger.error('Error replacing placeholders in textarea:', e);
  }
}

/** Applies placeholder replacement to all rubric comment textareas. */
export function applySettingsToTextareas() {
  const textareas = document.querySelectorAll('textarea[data-testid^="free-form-comment-area-"]');
  textareas.forEach(textarea => replacePlaceholdersInTextarea(textarea));
}

/** Attaches listeners on comment library inputs to replace placeholders in linked textareas. */
export function attachCommentLibraryTextareaListeners() {
  const commentLibraryInputs = document.querySelectorAll('input[data-testid^="comment-library-"]');

  commentLibraryInputs.forEach((libraryInput) => {
    const testId = libraryInput.getAttribute('data-testid');
    const criterionId = testId ? testId.split('-').pop() : null;

    if (!criterionId) return;

    const textarea = document.querySelector(`textarea[data-testid^="free-form-comment-area-"][data-testid$="${criterionId}"]`);
    if (!textarea) return;

    attachEventListenerIdempotent(libraryInput, 'input', () => {
      replacePlaceholdersInTextarea(textarea);
    }, '__textareaListenerAttached');
  });
}

/** Hooks a TinyMCE editor to replace placeholders on content set and optionally scroll. */
function attachEditorHook(editor) {
  if (!editor || editor.__studentNameHookAttached) return;
  editor.__studentNameHookAttached = true;

  editor.on('SetContent', () => {
    replacePlaceholdersInEditor(editor);

    if (get('scrollToSubmitCommentAfterCommentLibrarySelection')) {
      setTimeout(() => scrollToSubmitCommentButton(), 150);
    }
  });
}

/** Attaches hooks to all currently registered TinyMCE editors. */
function attachToExistingEditors() {
  if (!window.tinymce) return;
  window.tinymce.editors.forEach(editor => attachEditorHook(editor));
}

/** Waits for TinyMCE to be available, then sets up editor hooks for placeholder replacement. */
export function waitForTinyMCE() {
  if (window.tinymce) {
    attachToExistingEditors();

    // Hook newly added editors
    window.tinymce.on('AddEditor', (e) => {
      attachEditorHook(e.editor);
    });

    // Periodic re-scan as safety net for edge cases
    setInterval(() => attachToExistingEditors(), 5000);
    return;
  }

  setTimeout(() => waitForTinyMCE(), 250);
}
