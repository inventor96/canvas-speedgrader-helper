import { get } from './settings-store.js';
import { attachCommentLibraryHandler } from './comment-library-controller.js';
import { attachAutoFillListeners, attachCommentLibraryChangeListeners } from './points-memory.js';
import { attachCommentLibraryTextareaListeners, applySettingsToTextareas } from './placeholder-engine.js';
import { attachStructuredRubricListeners, attachClearCommentOnMaxPointsListeners, scrollToFirstCriterionRow } from './structured-rubric-ux.js';

let _delegationSetUp = false;
let _submissionHistoryDelegationSetUp = false;
let _submissionHistoryFocusedInput = null;
let _submissionHistoryFocusedValue = null;
let _submissionHistoryBlurTimer = null;
let _rubricAutoOpenAttempted = false;

function attachAllRubricHandlers() {
  attachCommentLibraryHandler();
  attachAutoFillListeners();
  attachCommentLibraryChangeListeners();
  attachCommentLibraryTextareaListeners();
  attachStructuredRubricListeners();
  attachClearCommentOnMaxPointsListeners();
  applySettingsToTextareas();
}

function reapplyAfterSubmissionHistoryChange() {
  _rubricAutoOpenAttempted = false;

  [200, 700, 1400].forEach((delay) => {
    setTimeout(() => {
      attachAllRubricHandlers();
      handleRubricFunctionality();
    }, delay);
  });
}

function setupViewRubricDelegation() {
  if (_delegationSetUp) return;
  _delegationSetUp = true;

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-testid="view-rubric-button"]');
    if (!button) return;

    setTimeout(async () => {
      attachAllRubricHandlers();
      await scrollToFirstCriterionIfEnabled();
    }, 1000);
  });
}

async function scrollToFirstCriterionIfEnabled() {
  if (!get('rubricAutoScrollToFirstCriterionAfterOpening')) return;

  const rubricTableDisplayed = await waitForRubricTableDisplayed();
  if (!rubricTableDisplayed) return;

  scrollToFirstCriterionRow();
}

function waitForRubricTableDisplayed(timeoutMs = 6000, pollMs = 150) {
  return new Promise((resolve) => {
    const rubricSelector = 'div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]';
    const endTime = Date.now() + timeoutMs;

    const check = () => {
      const rubricTable = document.querySelector(rubricSelector);
      if (rubricTable) {
        resolve(true);
        return;
      }

      if (Date.now() >= endTime) {
        resolve(false);
        return;
      }

      setTimeout(check, pollMs);
    };

    check();
  });
}

function setupSubmissionHistoryChangeDelegation() {
  if (_submissionHistoryDelegationSetUp) return;
  _submissionHistoryDelegationSetUp = true;

  document.addEventListener('focus', (event) => {
    const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
    if (!submissionHistoryInput) return;

    _submissionHistoryFocusedInput = submissionHistoryInput;
    _submissionHistoryFocusedValue = submissionHistoryInput.value;
  }, true);

  document.addEventListener('blur', (event) => {
    const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
    if (!submissionHistoryInput) return;

    if (_submissionHistoryBlurTimer) {
      clearTimeout(_submissionHistoryBlurTimer);
    }

    _submissionHistoryBlurTimer = setTimeout(() => {
      _submissionHistoryBlurTimer = null;

      const previouslyFocusedInput = _submissionHistoryFocusedInput;
      const previouslyFocusedValue = _submissionHistoryFocusedValue;
      const currentInput = document.querySelector('input[data-testid="submission-history-select"]');

      _submissionHistoryFocusedInput = null;
      _submissionHistoryFocusedValue = null;

      if (!previouslyFocusedInput || !currentInput) return;

      const inputInstanceChanged = currentInput !== previouslyFocusedInput;
      const inputValueChanged = currentInput.value !== previouslyFocusedValue;

      if (inputInstanceChanged || inputValueChanged) {
        reapplyAfterSubmissionHistoryChange();
      }
    }, 200);
  }, true);
}

export function handleRubricFunctionality() {
  setupViewRubricDelegation();
  setupSubmissionHistoryChangeDelegation();

  if (_rubricAutoOpenAttempted) return;

  const rubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
  if (rubricTable) {
    console.log('Rubric table already present');
    setTimeout(async () => {
      attachAllRubricHandlers();
      await scrollToFirstCriterionIfEnabled();
      _rubricAutoOpenAttempted = true;
    }, 1000);
    return;
  }

  const rubricButton = document.querySelector('button[data-testid="view-rubric-button"]');

  if (!rubricButton) {
    const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
    if (saveButton) {
      console.log('Rubric button not found, but rubric is already open');
      attachAllRubricHandlers();
      scrollToFirstCriterionIfEnabled();
      _rubricAutoOpenAttempted = true;
      return;
    }

    console.log('Rubric button not found yet. Retrying after 2 seconds...');
    setTimeout(() => handleRubricFunctionality(), 2000);
    return;
  }

  _rubricAutoOpenAttempted = true;

  if (!get('openRubricForUngraded')) return;
  setTimeout(async () => {
    const currentRubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
    if (!currentRubricTable) {
      console.log('No rubric table found, clicking view-rubric-button to open it');
      rubricButton.click();
    } else {
      console.log('Rubric table already present, not opening rubric');
      await scrollToFirstCriterionIfEnabled();
    }
  }, 2000);
}
