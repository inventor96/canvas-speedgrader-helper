import { CSH_MESSAGE_TYPES } from '../../shared/message-types.js';
import { get, auxState, BLANK_DROPDOWN_VALUES } from './settings-store.js';
import { attachEventListenerIdempotent } from './helpers/dom-utils.js';

export function attachAutoFillListeners() {
  if (!get('autoFillFullPoints')) return;

  const scoreInputs = document.querySelectorAll('input[data-testid^="criterion-score-"]');

  scoreInputs.forEach((input) => {
    attachEventListenerIdempotent(input, 'focus', () => {
      try {
        if (!input.value || input.value.trim() === '') {
          const parentSpan1 = input.parentElement;
          if (!parentSpan1 || parentSpan1.tagName !== 'SPAN') return;

          const parentSpan2 = parentSpan1.parentElement;
          if (!parentSpan2 || parentSpan2.tagName !== 'SPAN') return;

          const parentLabel = parentSpan2.parentElement;
          if (!parentLabel || parentLabel.tagName !== 'LABEL' || parentLabel.getAttribute('data-cid') !== 'TextInput') return;

          const parentSpan3 = parentLabel.parentElement;
          if (!parentSpan3 || parentSpan3.tagName !== 'SPAN') return;

          const nextSiblingSpan = parentSpan3.nextElementSibling;
          if (!nextSiblingSpan || nextSiblingSpan.tagName !== 'SPAN') return;

          const childSpan = nextSiblingSpan.querySelector('span');
          if (!childSpan) return;

          const text = childSpan.textContent.trim();
          const match = text.match(/\/(\d+(?:\.\d+)?)\s*pts?/);
          if (!match) return;

          const maxPoints = match[1];

          input.value = maxPoints;

          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        input.select();
      } catch (e) {
        console.error('Error auto-filling points for criterion:', e);
      }
    }, '__autoFillFullPointsListenerAttached');
  });
}

export function attachCommentLibraryChangeListeners() {
  if (!get('rememberPointsForComments')) return;
  const savedPoints = get('savedPoints');
  if (!savedPoints || typeof savedPoints !== 'object') return;

  let assignmentId;
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    assignmentId = params.get('assignment_id');
    if (!assignmentId) return;
  } catch (e) {
    console.error('Error parsing URL for assignment_id:', e);
    return;
  }

  const dropdowns = document.querySelectorAll('input[data-testid^="comment-library-"]');

  dropdowns.forEach((dropdown) => {
    const testId = dropdown.getAttribute('data-testid');
    const criterionId = testId ? testId.split('-').pop() : null;
    if (criterionId && !BLANK_DROPDOWN_VALUES[criterionId]) {
      BLANK_DROPDOWN_VALUES[criterionId] = dropdown.value;
    }
  });

  dropdowns.forEach((dropdown) => {
    const testId = dropdown.getAttribute('data-testid');
    const criterionId = testId ? testId.split('-').pop() : null;

    if (!criterionId) return;

    const pointsInput = document.querySelector(`input[data-testid^="rubric-criterion-"][data-testid$="${criterionId}"], input[data-testid^="criterion-score-"][data-testid$="${criterionId}"]`);
    if (!pointsInput) return;

    let previousDropdownValue = dropdown.value;
    let pollingInterval = null;

    const checkAndPrepopulatePoints = () => {
      try {
        const currentDropdownValue = dropdown.value;

        if (currentDropdownValue === previousDropdownValue) return;

        previousDropdownValue = currentDropdownValue;

        const blankValue = BLANK_DROPDOWN_VALUES[criterionId] || null;

        if (!currentDropdownValue || currentDropdownValue === blankValue) return;

        const key = `${assignmentId}::${criterionId}::${currentDropdownValue}`;

        if (savedPoints[key]) {
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(pointsInput, savedPoints[key]);
          setTimeout(() => {
            pointsInput.focus();
            setTimeout(() => {
              dropdown.focus();
            }, 50);
          }, 50);

          pointsInput.dispatchEvent(new Event('input', { bubbles: true }));
          pointsInput.dispatchEvent(new Event('change', { bubbles: true }));

          if (!auxState.touchedPoints.has(key)) {
            auxState.touchedPoints.add(key);
            try {
              window.postMessage({ type: CSH_MESSAGE_TYPES.TOUCH_POINTS, keys: [key] }, '*');
            } catch (e) {}
          }
        }
      } catch (e) {
        console.error('Error prepopulating points from comment library:', e);
      }
    };

    attachEventListenerIdempotent(dropdown, 'focus', () => {
      previousDropdownValue = dropdown.value;

      if (!pollingInterval) {
        pollingInterval = setInterval(checkAndPrepopulatePoints, 500);
      }
    }, '__pointsPrePopulateFocusListenerAttached');

    attachEventListenerIdempotent(dropdown, 'blur', () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
      }
    }, '__pointsPrePopulateBlurListenerAttached');
  });
}
