import { logger } from '@/shared/logger.js';
import { get } from './settings-store.js';
import { attachEventListenerIdempotent } from './helpers/dom-utils.js';

export function getTraditionalRubricRoot() {
  return document.querySelector('[data-testid="rubric-assessment-traditional-view"] tbody')
    || document.querySelector('[data-testid="rubric-assessment-traditional-view"]');
}

export function getCriterionRowFromButton(button, rubricRoot) {
  if (!button || !rubricRoot) return null;

  let current = button;
  while (current && current.parentElement) {
    if (current.parentElement === rubricRoot) return current;
    current = current.parentElement;
  }

  return null;
}

export function scrollRowIntoGradingPanelCenter(targetRow) {
  if (!targetRow) return;

  const gradingPanel = document.querySelector('[data-testid="speedgrader-grading-panel"]');
  if (!gradingPanel) {
    targetRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const panelRect = gradingPanel.getBoundingClientRect();
  const rowRect = targetRow.getBoundingClientRect();
  const offsetWithinPanel = rowRect.top - panelRect.top;
  const centerOffset = (gradingPanel.clientHeight / 2) - (rowRect.height / 2);
  const nextTop = gradingPanel.scrollTop + offsetWithinPanel - centerOffset;
  const maxTop = Math.max(0, gradingPanel.scrollHeight - gradingPanel.clientHeight);
  const clampedTop = Math.min(Math.max(0, nextTop), maxTop);

  gradingPanel.scrollTo({ top: clampedTop, behavior: 'smooth' });
}

export function scrollSubmitAssessmentButtonIntoView() {
  const submitButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
  if (!submitButton) return;

  scrollRowIntoGradingPanelCenter(submitButton);
}

export function scrollToNextCriterionRow(button) {
  const rubricRoot = getTraditionalRubricRoot();
  if (!rubricRoot) return;

  const currentRow = getCriterionRowFromButton(button, rubricRoot);
  if (!currentRow) return;

  const rubricRows = Array.from(rubricRoot.children);
  const currentIndex = rubricRows.indexOf(currentRow);
  if (currentIndex < 0) return;

  const nextRow = rubricRows[currentIndex + 1];
  if (!nextRow) {
    scrollSubmitAssessmentButtonIntoView();
    return;
  }

  scrollRowIntoGradingPanelCenter(nextRow);
}

export function scrollToFirstCriterionRow() {
  const rubricRoot = getTraditionalRubricRoot();
  if (!rubricRoot) return;

  const firstRow = rubricRoot.firstElementChild;
  if (!firstRow) return;

  scrollRowIntoGradingPanelCenter(firstRow);
}

export function attachClearCommentOnMaxPointsListeners() {
  const maxPointsButtons = document.querySelectorAll('button[data-testid^="traditional-criterion-"][data-testid$="-ratings-0"]');

  maxPointsButtons.forEach((button) => {
    attachEventListenerIdempotent(button, 'click', () => {
      try {
        if (!get('clearCommentBoxOnMaxPoints')) return;

        const testId = button.getAttribute('data-testid');
        if (!testId || !testId.startsWith('traditional-criterion-')) return;

        const parts = testId.split('-');
        if (parts.length < 3) return;

        const criterionId = parts[2];

        const clearCommentButton = document.querySelector(`button[data-testid="clear-comment-button-${criterionId}"]`);
        if (clearCommentButton) {
          clearCommentButton.click();
        }
      } catch (e) {
        logger.error('Error handling clear comment on max points click:', e);
      }
    }, '__clearCommentOnMaxPointsListenerAttached');
  });
}

export function attachStructuredRubricListeners() {
  const ratingButtons = document.querySelectorAll('button[data-testid^="traditional-criterion-"]');

  ratingButtons.forEach((button) => {
    attachEventListenerIdempotent(button, 'click', () => {
      try {
        const testId = button.getAttribute('data-testid');
        if (!testId || !testId.startsWith('traditional-criterion-')) return;

        const parts = testId.split('-');
        if (parts.length < 5) return;

        const criterionId = parts[2];
        const rubricPointId = parseInt(parts[4], 10);

        const shouldOpenCommentBox = rubricPointId === 0
          ? !!get('openCommentBoxAfterMaxPoints')
          : !!get('openCommentBoxAfterLessThanMaxPoints');

        if (get('rubricAutoScrollToNextCriterion') && (!shouldOpenCommentBox || rubricPointId !== 0)) {
          scrollToNextCriterionRow(button);
        }

        if (!shouldOpenCommentBox) return;

        const toggleCommentButton = document.querySelector(`button[data-testid="toggle-comment-${criterionId}"]`);

        const focusCommentTextArea = () => {
          const commentTextArea = document.querySelector(`textarea[data-testid="comment-text-area-${criterionId}"]`);
          if (commentTextArea) {
            commentTextArea.focus();
          }
        };

        if (!toggleCommentButton) {
          focusCommentTextArea();
          return;
        }

        toggleCommentButton.click();

        setTimeout(focusCommentTextArea, 500);
      } catch (e) {
        logger.error('Error handling structured rubric rating button click:', e);
      }
    }, '__structuredRubricListenerAttached');
  });
}
