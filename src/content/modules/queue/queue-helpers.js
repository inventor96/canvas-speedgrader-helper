import { observeUntil } from '@/shared/observe-until.js';
import { logger } from '@/shared/logger.js';

/** Finds the queue row DOM element for a given student name. */
export function getQueueRowByStudentName(studentName) {
  if (!studentName) {
    logger.warn('No student name provided');
    return null;
  }

  const studentNameElements = document.querySelectorAll('[data-control-name="txtStudentName"]');

  const matchingElement = Array.from(studentNameElements).find(el =>
    el.textContent.trim() === studentName.trim()
  );

  if (!matchingElement) {
    logger.warn('Could not find student name element for:', studentName);
    return null;
  }

  const row = matchingElement.closest('[data-control-name="ColumnLabels"]')?.parentElement;
  if (!row) {
    logger.warn('Could not find row for student name element');
    return null;
  }

  return row;
}

/** Extracts the student name text from a queue row. */
export function getStudentNameFromRow(row) {
  if (!row) return '';
  const studentNameElement = row.querySelector('[data-control-name="txtStudentName"]');
  return studentNameElement?.textContent?.trim() || '';
}

/** Gets the queue row from a Grade action button. */
export function getQueueRowFromActionButton(button) {
  if (!button || typeof button.closest !== 'function') return null;
  return button.closest('[data-control-name="ActionButtons"]')?.parentElement || null;
}

/** Gets the queue row from a Complete button with fallback selectors. */
export function getQueueRowFromCompleteButton(completeButton) {
  if (!completeButton || typeof completeButton.closest !== 'function') return null;

  const actionButtonsParent = completeButton.closest('[data-control-name="ActionButtons"]')?.parentElement;
  if (actionButtonsParent) return actionButtonsParent;

  const columnLabelsParent = completeButton.closest('[data-control-name="ColumnLabels"]')?.parentElement;
  if (columnLabelsParent) return columnLabelsParent;

  const completeControl = completeButton.closest('[data-control-name="CompleteButton"]');
  if (!completeControl) return null;

  return completeControl.closest('[data-control-name="ColumnLabels"]')?.parentElement || completeControl.parentElement || null;
}

/** Normalises a student name to a lookup key (trimmed string). */
export function getStudentKey(studentName) {
  return String(studentName || '').trim();
}

/** Returns the first enabled grade button in the queue, or null. */
export function getFirstAvailableGradeButton() {
  const gradeButtons = Array.from(document.querySelectorAll('[data-control-name="GraderButton"] button'));
  return gradeButtons.find((button) => !button.disabled && button.isConnected) || null;
}

/** Gets the grading status <select> element from a queue row. */
export function getGradingStatusSelect(row) {
  if (!row) return null;
  const select = row.querySelector('[data-control-name="GradingStatusCmbx"] select');
  if (!select) {
    logger.warn('Could not find grading status select in row');
    return null;
  }
  return select;
}

/** Returns the value of the "Already Graded" option from a grading status select. */
export function getAlreadyGradedOptionValue(gradingStatusSelect) {
  if (!gradingStatusSelect) return null;

  const options = Array.from(gradingStatusSelect.options);
  const alreadyGradedOption = options.find(option =>
    option.textContent.trim() === 'Already Graded'
  );

  if (!alreadyGradedOption) {
    logger.warn('Could not find "Already Graded" option in grading status select');
    return null;
  }

  return alreadyGradedOption.value;
}

/** Counts how many items are currently in the queue by student name elements. */
export function getCurrentQueueItemCount() {
  const studentNameElements = Array.from(document.querySelectorAll('[data-control-name="txtStudentName"]'));
  return studentNameElements.filter((element) => {
    if (!element || !element.isConnected) return false;
    return !!(element.textContent || '').trim();
  }).length;
}

/** Waits until a DOM element is removed from the document. */
export function waitForElementRemoval(element, timeoutMs = 15000) {
  return observeUntil(() => !element || !element.isConnected, {
    timeout: timeoutMs,
    container: document.documentElement,
  });
}

/** Attempts to click the first available grade button. Returns true on success. */
export function tryClickFirstGradeButton() {
  const firstAvailable = getFirstAvailableGradeButton();
  if (!firstAvailable) {
    return false;
  }

  firstAvailable.click();
  return true;
}
