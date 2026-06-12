import { get } from './settings-store.js';
import { getStudentName } from './student-name-service.js';

let _observerAttached = false;
let _observerDebounceTimer = null;
const _processedSubmitButtons = new WeakSet();

export function activateRadioInput(radioInput) {
  if (!radioInput) return false;

  try {
    if (!radioInput.checked) {
      radioInput.focus();
      radioInput.click();
    }

    if (radioInput.checked) return true;

    const associatedLabel = (radioInput.id && document.querySelector(`label[for="${radioInput.id}"]`))
      || radioInput.closest('label');
    if (associatedLabel) {
      associatedLabel.click();
    }

    if (radioInput.checked) return true;

    const nativeCheckedSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')?.set;
    if (nativeCheckedSetter) {
      nativeCheckedSetter.call(radioInput, true);
    } else {
      radioInput.checked = true;
    }

    radioInput.dispatchEvent(new Event('input', { bubbles: true }));
    radioInput.dispatchEvent(new Event('change', { bubbles: true }));

    return !!radioInput.checked;
  } catch (e) {
    console.error('Error activating radio input:', e);
    return false;
  }
}

export function selectGroupCommentModeIfEnabled() {
  try {
    if (!get('autoSetCommentsToWholeGroupWhenAvailable')) return;

    const submitButtons = document.querySelectorAll('button[data-testid="submit-comment-button"]');
    if (!submitButtons || submitButtons.length === 0) return;

    submitButtons.forEach((submitButton) => {
      if (!submitButton || _processedSubmitButtons.has(submitButton)) return;

      const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
      if (!groupModeRadio) return;

      activateRadioInput(groupModeRadio);
      _processedSubmitButtons.add(submitButton);
    });
  } catch (e) {
    console.error('Error applying group comment mode:', e);
  }
}

function scheduleAutoSelect() {
  if (_observerDebounceTimer) {
    clearTimeout(_observerDebounceTimer);
  }

  _observerDebounceTimer = setTimeout(() => {
    _observerDebounceTimer = null;
    selectGroupCommentModeIfEnabled();
  }, 120);
}

export function attachCommentModeObserver() {
  if (_observerAttached || !document.body) return;
  _observerAttached = true;

  selectGroupCommentModeIfEnabled();

  const observer = new MutationObserver(() => {
    scheduleAutoSelect();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

export function getReplacementName() {
  if (get('useTeamNameForGroupPlaceholderReplacement')) {
    const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
    const allCommentsToWholeGroupNotice = Array.from(document.querySelectorAll('span')).some(
      (span) => span.textContent?.trim() === 'All comments are sent to the whole group'
    );

    if (groupModeRadio || allCommentsToWholeGroupNotice) {
      return 'Team';
    }
  }

  return getStudentName();
}
