import { logger } from '@/shared/logger.js';
import { observeUntil } from '@/shared/observe-until.js';
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

/** Applies all rubric-related feature handlers. */
function attachAllRubricHandlers() {
  attachCommentLibraryHandler();
  attachAutoFillListeners();
  attachCommentLibraryChangeListeners();
  attachCommentLibraryTextareaListeners();
  attachStructuredRubricListeners();
  attachClearCommentOnMaxPointsListeners();
  applySettingsToTextareas();
}

/** Re-applies all handlers after the submission history dropdown changes. */
function reapplyAfterSubmissionHistoryChange() {
  _rubricAutoOpenAttempted = false;

  // Retry at increasing delays to catch re-rendered DOM
  [200, 700, 1400].forEach((delay) => {
    setTimeout(() => {
      attachAllRubricHandlers();
      handleRubricFunctionality();
    }, delay);
  });
}

/** Delegates click on "View Rubric" button: attaches handlers and scrolls to first criterion. */
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

/** Scrolls to the first rubric criterion row if the setting is enabled. */
async function scrollToFirstCriterionIfEnabled() {
  if (!get('rubricAutoScrollToFirstCriterionAfterOpening')) return;

  const rubricTableDisplayed = await waitForRubricTableDisplayed();
  if (!rubricTableDisplayed) return;

  scrollToFirstCriterionRow();
}

/** Waits for the rubric assessment table to appear in the DOM. */
function waitForRubricTableDisplayed(timeoutMs = 6000) {
  const rubricSelector = 'div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]';
  return observeUntil(() => document.querySelector(rubricSelector), {
    timeout: timeoutMs,
    container: document.querySelector('#assessment') || document.body,
  });
}

/** Detects submission history changes via focus/blur on the history select input. */
function setupSubmissionHistoryChangeDelegation() {
  if (_submissionHistoryDelegationSetUp) return;
  _submissionHistoryDelegationSetUp = true;

  document.addEventListener('focus', (event) => {
    const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
    if (!submissionHistoryInput) return;

    // Snapshot the current input state
    _submissionHistoryFocusedInput = submissionHistoryInput;
    _submissionHistoryFocusedValue = submissionHistoryInput.value;
  }, true);

  document.addEventListener('blur', (event) => {
    const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
    if (!submissionHistoryInput) return;

    if (_submissionHistoryBlurTimer) {
      clearTimeout(_submissionHistoryBlurTimer);
    }

    // Check after a short delay if the input or its value changed
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

/** Main rubric functionality entry point: sets up delegation and auto-opens the rubric. */
export function handleRubricFunctionality() {
  setupViewRubricDelegation();
  setupSubmissionHistoryChangeDelegation();

  if (_rubricAutoOpenAttempted) return;

  // Check if rubric table is already visible
  const rubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
  if (rubricTable) {
    logger.log('Rubric table already present');
    setTimeout(async () => {
      attachAllRubricHandlers();
      await scrollToFirstCriterionIfEnabled();
      _rubricAutoOpenAttempted = true;
    }, 1000);
    return;
  }

  const rubricButton = document.querySelector('button[data-testid="view-rubric-button"]');

  if (!rubricButton) {
    // Maybe the save button exists, meaning rubric is already open
    const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
    if (saveButton) {
      logger.log('Rubric button not found, but rubric is already open');
      attachAllRubricHandlers();
      scrollToFirstCriterionIfEnabled();
      _rubricAutoOpenAttempted = true;
      return;
    }

    logger.log('Rubric button not found yet. Retrying after 2 seconds...');
    setTimeout(() => handleRubricFunctionality(), 2000);
    return;
  }

  _rubricAutoOpenAttempted = true;

  if (!get('openRubricForUngraded')) return;
  // Click the view rubric button to auto-open it for ungraded submissions
  setTimeout(async () => {
    const currentRubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
    if (!currentRubricTable) {
      logger.log('No rubric table found, clicking view-rubric-button to open it');
      rubricButton.click();
    } else {
      logger.log('Rubric table already present, not opening rubric');
      await scrollToFirstCriterionIfEnabled();
    }
  }, 2000);
}
