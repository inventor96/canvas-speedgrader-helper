export function getQueueRowByStudentName(studentName) {
  if (!studentName) {
    console.warn('CSH: No student name provided');
    return null;
  }

  const studentNameElements = document.querySelectorAll('[data-control-name="txtStudentName"]');

  const matchingElement = Array.from(studentNameElements).find(el =>
    el.textContent.trim() === studentName.trim()
  );

  if (!matchingElement) {
    console.warn('CSH: Could not find student name element for:', studentName);
    return null;
  }

  const row = matchingElement.closest('[data-control-name="ColumnLabels"]')?.parentElement;
  if (!row) {
    console.warn('CSH: Could not find row for student name element');
    return null;
  }

  return row;
}

export function getStudentNameFromRow(row) {
  if (!row) return '';
  const studentNameElement = row.querySelector('[data-control-name="txtStudentName"]');
  return studentNameElement?.textContent?.trim() || '';
}

export function getQueueRowFromActionButton(button) {
  if (!button || typeof button.closest !== 'function') return null;
  return button.closest('[data-control-name="ActionButtons"]')?.parentElement || null;
}

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

export function getStudentKey(studentName) {
  return String(studentName || '').trim();
}

export function getFirstAvailableGradeButton() {
  const gradeButtons = Array.from(document.querySelectorAll('[data-control-name="GraderButton"] button'));
  return gradeButtons.find((button) => !button.disabled && button.isConnected) || null;
}

export function getGradingStatusSelect(row) {
  if (!row) return null;
  const select = row.querySelector('[data-control-name="GradingStatusCmbx"] select');
  if (!select) {
    console.warn('CSH: Could not find grading status select in row');
    return null;
  }
  return select;
}

export function getAlreadyGradedOptionValue(gradingStatusSelect) {
  if (!gradingStatusSelect) return null;

  const options = Array.from(gradingStatusSelect.options);
  const alreadyGradedOption = options.find(option =>
    option.textContent.trim() === 'Already Graded'
  );

  if (!alreadyGradedOption) {
    console.warn('CSH: Could not find "Already Graded" option in grading status select');
    return null;
  }

  return alreadyGradedOption.value;
}

export function getCurrentQueueItemCount() {
  const studentNameElements = Array.from(document.querySelectorAll('[data-control-name="txtStudentName"]'));
  return studentNameElements.filter((element) => {
    if (!element || !element.isConnected) return false;
    return !!(element.textContent || '').trim();
  }).length;
}

export function waitForElementRemoval(element, timeoutMs = 15000) {
  return new Promise((resolve) => {
    if (!element || !element.isConnected) {
      resolve(true);
      return;
    }

    const timeoutId = setTimeout(() => {
      observer.disconnect();
      resolve(false);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      if (!element.isConnected) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

export function tryClickFirstGradeButton() {
  const firstAvailable = getFirstAvailableGradeButton();
  if (!firstAvailable) {
    return false;
  }

  firstAvailable.click();
  return true;
}
