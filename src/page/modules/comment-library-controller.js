import { logger } from '@/shared/logger.js';
import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { get, BLANK_DROPDOWN_VALUES } from './settings-store.js';
import { attachEventListenerIdempotent } from './helpers/dom-utils.js';
import { applySettingsToTextareas } from './placeholder-engine.js';

export function attachCommentLibraryHandler() {
  const submitButtons = document.querySelectorAll(
    'button[data-testid="save-rubric-assessment-button"], button[data-testid^="submit-same-score-"]'
  );
  if (!submitButtons || submitButtons.length === 0) return;

  submitButtons.forEach((submitButton) => {
    attachEventListenerIdempotent(submitButton, 'click', () => {
      applySettingsToTextareas();

      if (get('rememberPointsForComments')) {
        handlePointsSaving();
      }

      setTimeout(() => {
        if (!get('openCommentLibraryAfterSubmit')) return;

        const commentLibButton = document.querySelector('button[data-testid="comment-library-button"]');
        if (commentLibButton) {
          commentLibButton.click();
        }
      }, 1000);
    }, '__commentLibrarySubmitListenerAttached');
  });
}

function handlePointsSaving() {
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    const assignmentId = params.get('assignment_id');

    if (!assignmentId) return;

    const pointsToSave = {};

    const criterionInputs = document.querySelectorAll('input[data-testid^="rubric-criterion-"], input[data-testid^="criterion-score-"]');

    criterionInputs.forEach((input) => {
      try {
        const testId = input.getAttribute('data-testid');
        const criterionId = testId ? testId.split('-').pop() : null;

        if (!criterionId) return;

        const saveCheckbox = document.querySelector(`input[data-testid^="save-comment-checkbox-"][data-testid$="${criterionId}"]`);
        const isSaveChecked = saveCheckbox && saveCheckbox.checked;

        const dropdown = document.querySelector(`input[data-testid^="comment-library-"][data-testid$="${criterionId}"]`);
        const dropdownValue = dropdown ? dropdown.value : null;
        const blankValue = BLANK_DROPDOWN_VALUES[criterionId] || null;
        const hasDropdownValue = dropdownValue && dropdownValue !== blankValue;

        const textarea = document.querySelector(`textarea[data-testid^="free-form-comment-area-"][data-testid$="${criterionId}"]`);
        const textareaValue = textarea ? textarea.value : null;
        const hasTextareaContent = textareaValue && textareaValue.trim().length > 0;

        const pointsValue = input.value;
        let keyValue = null;

        if (isSaveChecked && pointsValue && textareaValue) {
          const truncatedValue = textareaValue.length > 100
            ? textareaValue.substring(0, 99) + '\u2026'
            : textareaValue;
          keyValue = truncatedValue;
        } else if (pointsValue && hasTextareaContent && hasDropdownValue) {
          keyValue = dropdownValue;
        }

        if (keyValue) {
          const key = `${assignmentId}::${criterionId}::${keyValue}`;
          pointsToSave[key] = pointsValue;
        }
      } catch (e) {
        logger.error('Error processing criterion for points saving:', e);
      }
    });

    if (Object.keys(pointsToSave).length > 0) {
      window.postMessage({
        type: CSH_MESSAGE_TYPES.SAVE_POINTS,
        pointsToSave
      }, '*');
    }
  } catch (e) {
    logger.error('Error saving points for comments:', e);
  }
}
