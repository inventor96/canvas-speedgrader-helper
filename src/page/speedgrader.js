import { CSH_MESSAGE_TYPES } from '../shared/message-types.js';
import { HIGHLIGHT_CONFIG } from './submission-adapters/highlight-config.js';
import { SubmissionDispatcher } from './submission-dispatcher.js';

let PLACEHOLDERS;
let OPEN_RUBRIC_FOR_UNGRADED;
let OPEN_COMMENT_LIBRARY_AFTER_SUBMIT;
let AUTO_SET_COMMENTS_TO_WHOLE_GROUP_WHEN_AVAILABLE;
let AUTO_FILL_FULL_POINTS;
let REMEMBER_POINTS_FOR_COMMENTS;
let OPEN_COMMENT_BOX_AFTER_MAX_POINTS;
let OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS;
let RUBRIC_AUTO_SCROLL_TO_NEXT_CRITERION;
let RUBRIC_AUTO_SCROLL_TO_FIRST_CRITERION_AFTER_OPENING;
let CLEAR_COMMENT_BOX_ON_MAX_POINTS;
let NOTIFY_ON_STUDENT_NAME_MISMATCH;
let AUTO_GROUP_CHECK_ON_NAME_MISMATCH;
let AUTO_SELECT_ALREADY_GRADED_WHEN_GROUP_MATCHED;
let SCROLL_TO_SUBMIT_COMMENT_AFTER_COMMENT_LIBRARY_SELECTION;
let USE_TEAM_NAME_FOR_GROUP_PLACEHOLDER_REPLACEMENT;
let ENABLE_NAME_SANITY_CHECK;
let SAVED_POINTS;
let STUDENT_NAME_FORMAT;
let STUDENT_NAMES;
let QUEUED_STUDENT_NAME;
let LAST_TOUCHED_STUDENT_ID = null;
const TOUCHED_POINTS = new Set();

const BLANK_DROPDOWN_VALUES = {};

function attachEventListenerIdempotent(element, eventType, handler, flagProperty) {
  if (!element) return false;
  if (element[flagProperty]) return false;
  element[flagProperty] = true;
  element.addEventListener(eventType, handler);
  return true;
}

const HighlightClassSelector = {
  _config: HIGHLIGHT_CONFIG,
  _used: [],

  getNext() {
    const all = this._config;
    if (all.length === 0) return null;

    const used = this._used;

    if (used.length < all.length) {
      const usedSet = new Set(used);
      const available = all.filter((item) => !usedSet.has(item.className));
      const chosen = available[Math.floor(Math.random() * available.length)];
      used.push(chosen.className);
      console.log('[CSH] HighlightClassSelector - choosing new class:', chosen.className, 'Used classes:', used);
      return chosen.className;
    }

    const keepLast2 = used.slice(-2);
    this._used = keepLast2.slice();

    const excludedSet = new Set(keepLast2);
    const available = all.filter((item) => !excludedSet.has(item.className));
    const chosen = available[Math.floor(Math.random() * available.length)];
    this._used.push(chosen.className);
    console.log('[CSH] HighlightClassSelector - choosing new class after cleanup:', chosen.className, 'Used classes:', this._used);
    return chosen.className;
  },

  reset() {
    this._used = [];
  },
};

const SettingsBridge = {
  _featuresInitialized: false,

  init() {
    try {
      const raw = document.head.getAttribute('data-csh-settings');
      if (!raw) {
        console.error('No settings found in data-csh-settings attribute. Exiting...');
        return false;
      }
      return this.applySettings(JSON.parse(raw));
    } catch (e) {
      console.error('Error initializing settings from data-csh-settings attribute:', e);
      return false;
    }
  },

  applySettings(settings) {
    if (!settings) return false;

    if (Array.isArray(settings.placeholders) && settings.placeholders.length) {
      PLACEHOLDERS = settings.placeholders;
    }
    if (typeof settings.openRubricForUngraded !== 'undefined') {
      OPEN_RUBRIC_FOR_UNGRADED = !!settings.openRubricForUngraded;
    }
    if (typeof settings.openCommentLibraryAfterSubmit !== 'undefined') {
      OPEN_COMMENT_LIBRARY_AFTER_SUBMIT = !!settings.openCommentLibraryAfterSubmit;
    }
    if (typeof settings.autoSetCommentsToWholeGroupWhenAvailable !== 'undefined') {
      AUTO_SET_COMMENTS_TO_WHOLE_GROUP_WHEN_AVAILABLE = !!settings.autoSetCommentsToWholeGroupWhenAvailable;
    }
    if (typeof settings.autoFillFullPoints !== 'undefined') {
      AUTO_FILL_FULL_POINTS = !!settings.autoFillFullPoints;
    }
    if (typeof settings.rememberPointsForComments !== 'undefined') {
      REMEMBER_POINTS_FOR_COMMENTS = !!settings.rememberPointsForComments;
    }
    if (typeof settings.openCommentBoxAfterMaxPoints !== 'undefined') {
      OPEN_COMMENT_BOX_AFTER_MAX_POINTS = !!settings.openCommentBoxAfterMaxPoints;
    }
    if (typeof settings.openCommentBoxAfterLessThanMaxPoints !== 'undefined') {
      OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS = !!settings.openCommentBoxAfterLessThanMaxPoints;
    }
    if (typeof settings.rubricAutoScrollToNextCriterion !== 'undefined') {
      RUBRIC_AUTO_SCROLL_TO_NEXT_CRITERION = !!settings.rubricAutoScrollToNextCriterion;
    }
    if (typeof settings.rubricAutoScrollToFirstCriterionAfterOpening !== 'undefined') {
      RUBRIC_AUTO_SCROLL_TO_FIRST_CRITERION_AFTER_OPENING = !!settings.rubricAutoScrollToFirstCriterionAfterOpening;
    }
    if (typeof settings.clearCommentBoxOnMaxPoints !== 'undefined') {
      CLEAR_COMMENT_BOX_ON_MAX_POINTS = !!settings.clearCommentBoxOnMaxPoints;
    }
    if (typeof settings.notifyOnStudentNameMismatch !== 'undefined') {
      NOTIFY_ON_STUDENT_NAME_MISMATCH = !!settings.notifyOnStudentNameMismatch;
    }
    if (typeof settings.autoGroupCheckOnNameMismatch !== 'undefined') {
      AUTO_GROUP_CHECK_ON_NAME_MISMATCH = !!settings.autoGroupCheckOnNameMismatch;
    }
    if (typeof settings.autoSelectAlreadyGradedWhenGroupMatched !== 'undefined') {
      AUTO_SELECT_ALREADY_GRADED_WHEN_GROUP_MATCHED = !!settings.autoSelectAlreadyGradedWhenGroupMatched;
    }
    if (typeof settings.scrollToSubmitCommentAfterCommentLibrarySelection !== 'undefined') {
      SCROLL_TO_SUBMIT_COMMENT_AFTER_COMMENT_LIBRARY_SELECTION = !!settings.scrollToSubmitCommentAfterCommentLibrarySelection;
    }
    if (typeof settings.useTeamNameForGroupPlaceholderReplacement !== 'undefined') {
      USE_TEAM_NAME_FOR_GROUP_PLACEHOLDER_REPLACEMENT = !!settings.useTeamNameForGroupPlaceholderReplacement;
    }
    if (typeof settings.enableNameSanityCheck !== 'undefined') {
      ENABLE_NAME_SANITY_CHECK = !!settings.enableNameSanityCheck;
    }
    if (settings.savedPoints && typeof settings.savedPoints === 'object') {
      SAVED_POINTS = settings.savedPoints;
    }
    if (settings.studentNameFormat && typeof settings.studentNameFormat === 'string') {
      STUDENT_NAME_FORMAT = settings.studentNameFormat;
    }

    if (settings.studentNames && typeof settings.studentNames === 'object') {
      STUDENT_NAMES = settings.studentNames;
    }
    if (settings.queuedStudentName) {
      QUEUED_STUDENT_NAME = settings.queuedStudentName;
    }

    return true;
  },

  attachSettingsUpdateListener() {
    window.addEventListener('message', (event) => {
      try {
        if (!event || event.source !== window) return;

        const msg = event.data;
        if (!msg || msg.type !== CSH_MESSAGE_TYPES.UPDATE_SETTINGS) return;

        const settings = msg.settings || {};
        const changes = msg.studentNameChanges || {};

        this.applySettings(settings);

        if (!this._featuresInitialized) return;

        if (OPEN_RUBRIC_FOR_UNGRADED) {
          try {
            RubricController.handleRubricFunctionality();
          } catch (e) {}
        }

        this.handleStudentNameChange(changes);

        PlaceholderEngine.applySettingsToEditors();
        PlaceholderEngine.applySettingsToTextareas();
        PlaceholderEngine.attachCommentLibraryTextareaListeners();
        CommentModeController.selectGroupCommentModeIfEnabled();
      } catch (e) {
        console.error('Error handling CSH_UPDATE_SETTINGS message:', e);
      }
    });
  },

  handleStudentNameChange(changes) {
    try {
      const params = new URLSearchParams(location.search || window.location.search);
      const sid = params.get('student_id');

      if (!sid || !changes || !changes[sid] || changes[sid].old === changes[sid].new) {
        return;
      }

      const oldName = changes[sid].old || StudentNameService.getCurrentStudentNameFromPage();
      const newName = changes[sid].new || StudentNameService.getStudentName();
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
  },

  waitForStoredSettings(callback) {
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      this._featuresInitialized = true;
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
};

const CommentModeController = {
  __observerAttached: false,
  __observerDebounceTimer: null,
  __processedSubmitButtons: new WeakSet(),

  activateRadioInput(radioInput) {
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
  },

  selectGroupCommentModeIfEnabled() {
    try {
      if (!AUTO_SET_COMMENTS_TO_WHOLE_GROUP_WHEN_AVAILABLE) return;

      const submitButtons = document.querySelectorAll('button[data-testid="submit-comment-button"]');
      if (!submitButtons || submitButtons.length === 0) return;

      submitButtons.forEach((submitButton) => {
        if (!submitButton || this.__processedSubmitButtons.has(submitButton)) return;

        const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
        if (!groupModeRadio) return;

        this.activateRadioInput(groupModeRadio);
        this.__processedSubmitButtons.add(submitButton);
      });
    } catch (e) {
      console.error('Error applying group comment mode:', e);
    }
  },

  scheduleAutoSelect() {
    if (this.__observerDebounceTimer) {
      clearTimeout(this.__observerDebounceTimer);
    }

    this.__observerDebounceTimer = setTimeout(() => {
      this.__observerDebounceTimer = null;
      this.selectGroupCommentModeIfEnabled();
    }, 120);
  },

  attachCommentModeObserver() {
    if (this.__observerAttached || !document.body) return;
    this.__observerAttached = true;

    this.selectGroupCommentModeIfEnabled();

    const observer = new MutationObserver(() => {
      this.scheduleAutoSelect();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  },

  getReplacementName() {
    if (USE_TEAM_NAME_FOR_GROUP_PLACEHOLDER_REPLACEMENT) {
      const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
      const allCommentsToWholeGroupNotice = Array.from(document.querySelectorAll('span')).some(
        (span) => span.textContent?.trim() === 'All comments are sent to the whole group'
      );

      if (groupModeRadio || allCommentsToWholeGroupNotice) {
        return 'Team';
      }
    }

    return StudentNameService.getStudentName();
  }
};

const StudentNameService = {
  getCurrentStudentNameFromPage(forceFullName = false) {
    const el = document.querySelector(
      'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
    );
    let fullName = el?.textContent?.trim() || null;

    if (fullName && fullName.endsWith('\u2026')) {
      try {
        const truncatedName = fullName.slice(0, -1).trim();
        const fullNameElement = document.querySelector(
          `button[data-testid="student-select-trigger"] [name^="${truncatedName}"]`
        );
        if (fullNameElement) {
          const nameAttr = fullNameElement.getAttribute('name');
          if (nameAttr) {
            fullName = nameAttr;
          }
        }
      } catch (e) {
        console.error('Error retrieving full student name from truncated version:', e);
      }
    }

    if (!fullName) return null;
    if (STUDENT_NAME_FORMAT === 'full-name' || forceFullName) {
      return fullName;
    }
    return fullName.split(/\s+/)[0];
  },

  getStudentName() {
    try {
      const params = new URLSearchParams(location.search || window.location.search);
      const sid = params.get('student_id');
      if (sid && STUDENT_NAMES && STUDENT_NAMES[sid]) {
        if (LAST_TOUCHED_STUDENT_ID !== sid) {
          LAST_TOUCHED_STUDENT_ID = sid;
          try {
            window.postMessage({ type: CSH_MESSAGE_TYPES.TOUCH_STUDENT_NAME, key: sid }, '*');
          } catch (e) {}
        }
        return STUDENT_NAMES[sid];
      }
    } catch (e) {
      console.error('Error parsing URL for student_id:', e);
    }

    return this.getCurrentStudentNameFromPage();
  }
};

const PlaceholderEngine = {
  scrollToSubmitCommentButton() {
    const submitButton = document.querySelector(
      'button[data-testid="submit-comment-button"]'
    );
    if (!submitButton) return;

    try {
      StructuredRubricUX.scrollRowIntoGradingPanelCenter(submitButton);
      return;
    } catch (e) {}

    submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  replacePlaceholdersInEditor(editor) {
    try {
      const content = editor.getContent();
      if (!content) return;
      const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
      if (!hasPlaceholder) return;

      const name = CommentModeController.getReplacementName();
      if (!name) return;

      let updated = content;
      PLACEHOLDERS.forEach(ph => {
        if (updated.includes(ph)) {
          updated = updated.replaceAll(ph, name);
        }
      });
      if (updated !== content) {
        editor.setContent(updated);
      }
    } catch (e) {
      console.error('Error replacing placeholders in editor:', e);
    }
  },

  applySettingsToEditors() {
    if (!window.tinymce) return;
    window.tinymce.editors.forEach(editor => this.replacePlaceholdersInEditor(editor));
  },

  replacePlaceholdersInTextarea(textarea) {
    try {
      const content = textarea.value;
      if (!content) return;
      const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
      if (!hasPlaceholder) return;

      const name = CommentModeController.getReplacementName();
      if (!name) return;

      let updated = content;
      PLACEHOLDERS.forEach(ph => {
        if (updated.includes(ph)) {
          updated = updated.replaceAll(ph, name);
        }
      });
      if (updated !== content) {
        textarea.value = updated;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (e) {
      console.error('Error replacing placeholders in textarea:', e);
    }
  },

  applySettingsToTextareas() {
    const textareas = document.querySelectorAll('textarea[data-testid^="free-form-comment-area-"]');
    textareas.forEach(textarea => this.replacePlaceholdersInTextarea(textarea));
  },

  attachCommentLibraryTextareaListeners() {
    const commentLibraryInputs = document.querySelectorAll('input[data-testid^="comment-library-"]');

    commentLibraryInputs.forEach((libraryInput) => {
      const testId = libraryInput.getAttribute('data-testid');
      const criterionId = testId ? testId.split('-').pop() : null;

      if (!criterionId) return;

      const textarea = document.querySelector(`textarea[data-testid^="free-form-comment-area-"][data-testid$="${criterionId}"]`);
      if (!textarea) return;

      attachEventListenerIdempotent(libraryInput, 'input', () => {
        this.replacePlaceholdersInTextarea(textarea);
      }, '__textareaListenerAttached');
    });
  },

  attachEditorHook(editor) {
    if (!editor || editor.__studentNameHookAttached) return;
    editor.__studentNameHookAttached = true;

    editor.on('SetContent', () => {
      this.replacePlaceholdersInEditor(editor);

      if (SCROLL_TO_SUBMIT_COMMENT_AFTER_COMMENT_LIBRARY_SELECTION) {
        setTimeout(() => this.scrollToSubmitCommentButton(), 150);
      }
    });
  },

  attachToExistingEditors() {
    if (!window.tinymce) return;
    window.tinymce.editors.forEach(editor => this.attachEditorHook(editor));
  },

  waitForTinyMCE() {
    if (window.tinymce) {
      this.attachToExistingEditors();

      window.tinymce.on('AddEditor', (e) => {
        this.attachEditorHook(e.editor);
      });

      setInterval(() => this.attachToExistingEditors(), 5000);
      return;
    }

    setTimeout(() => this.waitForTinyMCE(), 250);
  }
};

const RubricController = {
  __delegationSetUp: false,
  __submissionHistoryDelegationSetUp: false,
  __submissionHistoryFocusedInput: null,
  __submissionHistoryFocusedValue: null,
  __submissionHistoryBlurTimer: null,
  __rubricAutoOpenAttempted: false,

  attachAllRubricHandlers() {
    CommentLibraryController.attachCommentLibraryHandler();
    PointsMemory.attachAutoFillListeners();
    PointsMemory.attachCommentLibraryChangeListeners();
    PlaceholderEngine.attachCommentLibraryTextareaListeners();
    StructuredRubricUX.attachStructuredRubricListeners();
    StructuredRubricUX.attachClearCommentOnMaxPointsListeners();
    PlaceholderEngine.applySettingsToTextareas();
  },

  reapplyAfterSubmissionHistoryChange() {
    this.__rubricAutoOpenAttempted = false;

    [200, 700, 1400].forEach((delay) => {
      setTimeout(() => {
        this.attachAllRubricHandlers();
        this.handleRubricFunctionality();
      }, delay);
    });
  },

  setupViewRubricDelegation() {
    if (this.__delegationSetUp) return;
    this.__delegationSetUp = true;

    document.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-testid="view-rubric-button"]');
      if (!button) return;

      setTimeout(async () => {
        this.attachAllRubricHandlers();
        await this.scrollToFirstCriterionIfEnabled();
      }, 1000);
    });
  },

  async scrollToFirstCriterionIfEnabled() {
    if (!RUBRIC_AUTO_SCROLL_TO_FIRST_CRITERION_AFTER_OPENING) return;

    const rubricTableDisplayed = await this.waitForRubricTableDisplayed();
    if (!rubricTableDisplayed) return;

    StructuredRubricUX.scrollToFirstCriterionRow();
  },

  waitForRubricTableDisplayed(timeoutMs = 6000, pollMs = 150) {
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
  },

  setupSubmissionHistoryChangeDelegation() {
    if (this.__submissionHistoryDelegationSetUp) return;
    this.__submissionHistoryDelegationSetUp = true;

    document.addEventListener('focus', (event) => {
      const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
      if (!submissionHistoryInput) return;

      this.__submissionHistoryFocusedInput = submissionHistoryInput;
      this.__submissionHistoryFocusedValue = submissionHistoryInput.value;
    }, true);

    document.addEventListener('blur', (event) => {
      const submissionHistoryInput = event.target.closest('input[data-testid="submission-history-select"]');
      if (!submissionHistoryInput) return;

      if (this.__submissionHistoryBlurTimer) {
        clearTimeout(this.__submissionHistoryBlurTimer);
      }

      this.__submissionHistoryBlurTimer = setTimeout(() => {
        this.__submissionHistoryBlurTimer = null;

        const previouslyFocusedInput = this.__submissionHistoryFocusedInput;
        const previouslyFocusedValue = this.__submissionHistoryFocusedValue;
        const currentInput = document.querySelector('input[data-testid="submission-history-select"]');

        this.__submissionHistoryFocusedInput = null;
        this.__submissionHistoryFocusedValue = null;

        if (!previouslyFocusedInput || !currentInput) return;

        const inputInstanceChanged = currentInput !== previouslyFocusedInput;
        const inputValueChanged = currentInput.value !== previouslyFocusedValue;

        if (inputInstanceChanged || inputValueChanged) {
          this.reapplyAfterSubmissionHistoryChange();
        }
      }, 200);
    }, true);
  },

  handleRubricFunctionality() {
    this.setupViewRubricDelegation();
    this.setupSubmissionHistoryChangeDelegation();

    if (this.__rubricAutoOpenAttempted) return;

    const rubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
    if (rubricTable) {
      console.log('Rubric table already present');
      setTimeout(async () => {
        this.attachAllRubricHandlers();
        await this.scrollToFirstCriterionIfEnabled();
        this.__rubricAutoOpenAttempted = true;
      }, 1000);
      return;
    }

    const rubricButton = document.querySelector('button[data-testid="view-rubric-button"]');

    if (!rubricButton) {
      const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
      if (saveButton) {
        console.log('Rubric button not found, but rubric is already open');
        this.attachAllRubricHandlers();
        this.scrollToFirstCriterionIfEnabled();
        this.__rubricAutoOpenAttempted = true;
        return;
      }

      console.log('Rubric button not found yet. Retrying after 2 seconds...');
      setTimeout(() => this.handleRubricFunctionality(), 2000);
      return;
    }

    this.__rubricAutoOpenAttempted = true;

    if (!OPEN_RUBRIC_FOR_UNGRADED) return;
    setTimeout(async () => {
      const currentRubricTable = document.querySelector('div.rubric_summary,[data-testid="rubric-assessment-traditional-view"]');
      if (!currentRubricTable) {
        console.log('No rubric table found, clicking view-rubric-button to open it');
        rubricButton.click();
      } else {
        console.log('Rubric table already present, not opening rubric');
        await this.scrollToFirstCriterionIfEnabled();
      }
    }, 2000);
  }
};

const CommentLibraryController = {
  attachCommentLibraryHandler() {
    const submitButtons = document.querySelectorAll(
      'button[data-testid="save-rubric-assessment-button"], button[data-testid^="submit-same-score-"]'
    );
    if (!submitButtons || submitButtons.length === 0) return;

    submitButtons.forEach((submitButton) => {
      attachEventListenerIdempotent(submitButton, 'click', () => {
        PlaceholderEngine.applySettingsToTextareas();

        if (REMEMBER_POINTS_FOR_COMMENTS) {
          this.handlePointsSaving();
        }

        setTimeout(() => {
          if (!OPEN_COMMENT_LIBRARY_AFTER_SUBMIT) return;

          const commentLibButton = document.querySelector('button[data-testid="comment-library-button"]');
          if (commentLibButton) {
            commentLibButton.click();
          }
        }, 1000);
      }, '__commentLibrarySubmitListenerAttached');
    });
  },

  handlePointsSaving() {
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
          console.error('Error processing criterion for points saving:', e);
        }
      });

      if (Object.keys(pointsToSave).length > 0) {
        window.postMessage({
          type: CSH_MESSAGE_TYPES.SAVE_POINTS,
          pointsToSave
        }, '*');
      }
    } catch (e) {
      console.error('Error saving points for comments:', e);
    }
  }
};

const PointsMemory = {
  attachAutoFillListeners() {
    if (!AUTO_FILL_FULL_POINTS) return;

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
  },

  attachCommentLibraryChangeListeners() {
    if (!REMEMBER_POINTS_FOR_COMMENTS) return;
    if (!SAVED_POINTS || typeof SAVED_POINTS !== 'object') return;

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

          if (SAVED_POINTS[key]) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(pointsInput, SAVED_POINTS[key]);
            setTimeout(() => {
              pointsInput.focus();
              setTimeout(() => {
                dropdown.focus();
              }, 50);
            }, 50);

            pointsInput.dispatchEvent(new Event('input', { bubbles: true }));
            pointsInput.dispatchEvent(new Event('change', { bubbles: true }));

            if (!TOUCHED_POINTS.has(key)) {
              TOUCHED_POINTS.add(key);
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
};

const StructuredRubricUX = {
  getTraditionalRubricRoot() {
    return document.querySelector('[data-testid="rubric-assessment-traditional-view"] tbody')
      || document.querySelector('[data-testid="rubric-assessment-traditional-view"]');
  },

  getCriterionRowFromButton(button, rubricRoot) {
    if (!button || !rubricRoot) return null;

    let current = button;
    while (current && current.parentElement) {
      if (current.parentElement === rubricRoot) return current;
      current = current.parentElement;
    }

    return null;
  },

  scrollRowIntoGradingPanelCenter(targetRow) {
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
  },

  scrollSubmitAssessmentButtonIntoView() {
    const submitButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
    if (!submitButton) return;

    this.scrollRowIntoGradingPanelCenter(submitButton);
  },

  scrollToNextCriterionRow(button) {
    const rubricRoot = this.getTraditionalRubricRoot();
    if (!rubricRoot) return;

    const currentRow = this.getCriterionRowFromButton(button, rubricRoot);
    if (!currentRow) return;

    const rubricRows = Array.from(rubricRoot.children);
    const currentIndex = rubricRows.indexOf(currentRow);
    if (currentIndex < 0) return;

    const nextRow = rubricRows[currentIndex + 1];
    if (!nextRow) {
      this.scrollSubmitAssessmentButtonIntoView();
      return;
    }

    this.scrollRowIntoGradingPanelCenter(nextRow);
  },

  scrollToFirstCriterionRow() {
    const rubricRoot = this.getTraditionalRubricRoot();
    if (!rubricRoot) return;

    const firstRow = rubricRoot.firstElementChild;
    if (!firstRow) return;

    this.scrollRowIntoGradingPanelCenter(firstRow);
  },

  attachClearCommentOnMaxPointsListeners() {
    const maxPointsButtons = document.querySelectorAll('button[data-testid^="traditional-criterion-"][data-testid$="-ratings-0"]');

    maxPointsButtons.forEach((button) => {
      attachEventListenerIdempotent(button, 'click', () => {
        try {
          if (!CLEAR_COMMENT_BOX_ON_MAX_POINTS) return;

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
          console.error('Error handling clear comment on max points click:', e);
        }
      }, '__clearCommentOnMaxPointsListenerAttached');
    });
  },

  attachStructuredRubricListeners() {
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
            ? !!OPEN_COMMENT_BOX_AFTER_MAX_POINTS
            : !!OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS;

          if (RUBRIC_AUTO_SCROLL_TO_NEXT_CRITERION && (!shouldOpenCommentBox || rubricPointId !== 0)) {
            this.scrollToNextCriterionRow(button);
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
          console.error('Error handling structured rubric rating button click:', e);
        }
      }, '__structuredRubricListenerAttached');
    });
  }
};

const NotificationUI = {
  __groupsResultListenerAttached: false,
  __pendingTripletLookup: null,
  GROUP_INDICATOR_WAIT_MS: 3500,
  GROUP_INDICATOR_POLL_MS: 200,

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, (m) => map[m]);
  },

  normalizeName(name) {
    return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
  },

  getCurrentTripletContext() {
    try {
      const parsedUrl = new URL(window.location.href);
      const courseMatch = parsedUrl.pathname.match(/\/courses\/(\d+)/i);
      const courseId = courseMatch && courseMatch[1] ? courseMatch[1] : '';
      const assignmentId = parsedUrl.searchParams.get('assignment_id') || '';
      const studentId = parsedUrl.searchParams.get('student_id') || '';

      if (!courseId || !assignmentId || !studentId) {
        return null;
      }

      return { courseId, assignmentId, studentId };
    } catch (e) {
      return null;
    }
  },

  getTripletContextKey(context) {
    if (!context || !context.courseId || !context.assignmentId || !context.studentId) {
      return '';
    }

    return `${context.courseId}|${context.assignmentId}|${context.studentId}`;
  },

  isCurrentSubmissionAlreadyGraded() {
    return !!document.querySelector('[data-testid="graded-icon"]');
  },

  upsertCurrentTripletCache() {
    const context = this.getCurrentTripletContext();
    if (!context) return;

    try {
      window.postMessage({
        type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT,
        courseId: context.courseId,
        assignmentId: context.assignmentId,
        studentId: context.studentId,
      }, '*');
    } catch (e) {
      console.warn('CSH: Failed to upsert group triplet cache entry.', e);
    }
  },

  async checkMatchedStudentNameForCachedGroupContext(queuedName) {
    const startingContext = this.getCurrentTripletContext();
    if (!startingContext) return;

    const startingContextKey = this.getTripletContextKey(startingContext);
    const showGroupsLink = await this.waitForGroupIndicators();
    if (!showGroupsLink) return;

    const currentContext = this.getCurrentTripletContext();
    if (!currentContext || this.getTripletContextKey(currentContext) !== startingContextKey) {
      return;
    }

    const requestId = `csh-triplet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.__pendingTripletLookup = {
      requestId,
      queuedName,
      contextKey: startingContextKey,
    };

    try {
      window.postMessage({
        type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP,
        requestId,
        courseId: currentContext.courseId,
        assignmentId: currentContext.assignmentId,
        studentId: currentContext.studentId,
      }, '*');
    } catch (e) {
      this.__pendingTripletLookup = null;
      console.warn('CSH: Failed to request group triplet cache lookup.', e);
    }
  },

  isGroupAssignmentDetected() {
    const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
    const wholeGroupNotice = Array.from(document.querySelectorAll('span')).some(
      (span) => span.textContent?.trim() === 'All comments are sent to the whole group'
    );

    return !!groupModeRadio || wholeGroupNotice;
  },

  waitForGroupIndicators(timeoutMs = this.GROUP_INDICATOR_WAIT_MS, pollMs = this.GROUP_INDICATOR_POLL_MS) {
    return new Promise((resolve) => {
      const endTime = Date.now() + timeoutMs;

      const check = () => {
        if (this.isGroupAssignmentDetected()) {
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
  },

  getOrCreateWarningContainer() {
    let warningDiv = document.getElementById('csh-student-mismatch-warning');
    if (warningDiv) return warningDiv;

    warningDiv = document.createElement('div');
    warningDiv.id = 'csh-student-mismatch-warning';
    warningDiv.setAttribute('role', 'alert');
    warningDiv.setAttribute('aria-live', 'assertive');
    warningDiv.style.cssText = `
      position: fixed;
      top: 65px;
      right: 20px;
      border-radius: 4px;
      padding: 15px 20px;
      max-width: 420px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
    `;

    document.body.appendChild(warningDiv);
    return warningDiv;
  },

  applyWarningStyle(warningDiv) {
    warningDiv.style.backgroundColor = '#fff3cd';
    warningDiv.style.border = '2px solid #ff9800';
    warningDiv.style.color = '#333';
  },

  applyInfoStyle(warningDiv) {
    warningDiv.style.backgroundColor = '#e8f4ff';
    warningDiv.style.border = '2px solid #2f7ed8';
    warningDiv.style.color = '#123b66';
  },

  renderBanner({ queuedName, speedgraderName, sameGroup, matchedGroupHeader, statusText, showGroupsLink }) {
    const warningDiv = this.getOrCreateWarningContainer();
    warningDiv.dataset.queuedName = queuedName;
    warningDiv.dataset.speedgraderName = speedgraderName;
    warningDiv.dataset.checkInProgress = statusText === 'Checking course groups...' ? 'true' : 'false';

    if (sameGroup) {
      this.applyInfoStyle(warningDiv);
    } else {
      this.applyWarningStyle(warningDiv);
    }

    warningDiv.innerHTML = '';

    const heading = document.createElement('h3');
    heading.style.cssText = 'margin: 0px 24px 8px 0px; font-size: 16px; font-weight: 600;';
    heading.style.color = sameGroup ? '#1f5fae' : '#ff6f00';
    heading.textContent = sameGroup
      ? '\u2139\ufe0f Name Mismatch Resolved: Same Group'
      : '\u26a0\ufe0f Student Name Mismatch';

    const messageDiv = document.createElement('p');
    messageDiv.style.cssText = `margin: 0 0 ${showGroupsLink || statusText || sameGroup ? '10px' : '0'} 0; color: ${sameGroup ? '#1a4d80' : '#666'};`;

    let messageHtml = `<strong>Grading Queue:</strong> ${this.escapeHtml(queuedName)}<br><strong>SpeedGrader:</strong> ${this.escapeHtml(speedgraderName)}`;
    if (sameGroup) {
      messageHtml += '<br>These names are different, but both students appear in the same Canvas group.';
      if (matchedGroupHeader) {
        messageHtml += `<br><strong>Matched Group:</strong> ${this.escapeHtml(matchedGroupHeader)}`;
      }
    }
    messageDiv.innerHTML = messageHtml;

    warningDiv.appendChild(heading);
    warningDiv.appendChild(messageDiv);

    if (!sameGroup && showGroupsLink) {
      const autoCheckWrap = document.createElement('div');
      autoCheckWrap.style.cssText = 'margin: 0 0 8px 0;';
      const autoCheckLink = document.createElement('a');
      autoCheckLink.href = '#';
      autoCheckLink.textContent = 'Open groups and auto-check membership';
      autoCheckLink.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer;';
      autoCheckLink.onclick = (event) => {
        event.preventDefault();
        this.startGroupsCheck(queuedName, speedgraderName);
      };
      autoCheckWrap.appendChild(autoCheckLink);
      warningDiv.appendChild(autoCheckWrap);

      const openGroupWrap = document.createElement('div');
      openGroupWrap.style.cssText = 'margin: 0 0 8px 0;';
      const openGroupLabel = document.createElement('span');
      openGroupLabel.style.cssText = 'color: #666;';
      openGroupLabel.textContent = 'Or, open group for:';
      const openGroupList = document.createElement('ul');
      openGroupList.style.cssText = 'margin: 4px 0 0 0; padding-left: 20px;';

      const makeGroupLi = (name, primaryName, secondaryName) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = name;
        a.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer;';
        a.onclick = (event) => {
          event.preventDefault();
          this.startGroupsCheck(primaryName, secondaryName, true);
        };
        li.appendChild(a);
        return li;
      };

      openGroupList.appendChild(makeGroupLi(queuedName, queuedName, speedgraderName));
      openGroupList.appendChild(makeGroupLi(speedgraderName, speedgraderName, queuedName));
      openGroupWrap.appendChild(openGroupLabel);
      openGroupWrap.appendChild(openGroupList);
      warningDiv.appendChild(openGroupWrap);
    }

    if (statusText) {
      const status = document.createElement('p');
      status.style.cssText = `margin: 0; font-size: 13px; color: ${sameGroup ? '#1f5fae' : '#555'};`;
      status.textContent = statusText;
      warningDiv.appendChild(status);
    }

    const closeButton = document.createElement('button');
    closeButton.textContent = '\u00d7';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: ${sameGroup ? '#1f5fae' : '#ff6f00'};
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 1;
    `;
    closeButton.onclick = () => warningDiv.remove();
    warningDiv.appendChild(closeButton);
  },

  startGroupsCheck(queuedName, speedgraderName, noAutoClose = false) {
    const warningDiv = document.getElementById('csh-student-mismatch-warning');
    if (!warningDiv) return;
    if (warningDiv.dataset.checkInProgress === 'true') return;

    this.renderBanner({
      queuedName,
      speedgraderName,
      sameGroup: false,
      matchedGroupHeader: '',
      statusText: 'Checking course groups...',
      showGroupsLink: false,
    });

    try {
      window.postMessage({
        type: CSH_MESSAGE_TYPES.START_GROUPS_CHECK,
        queuedName,
        speedgraderName,
        noAutoClose: !!noAutoClose,
      }, '*');
    } catch (e) {
      this.renderBanner({
        queuedName,
        speedgraderName,
        sameGroup: false,
        matchedGroupHeader: '',
        statusText: 'Could not start groups check.',
        showGroupsLink: this.isGroupAssignmentDetected(),
      });
    }
  },

  maybeApplyGroupsResult(msg) {
    const warningDiv = document.getElementById('csh-student-mismatch-warning');
    if (!warningDiv) return;

    const currentQueued = this.normalizeName(warningDiv.dataset.queuedName || '');
    const currentSpeedgrader = this.normalizeName(warningDiv.dataset.speedgraderName || '');
    const messageQueued = this.normalizeName(msg.queuedName || '');
    const messageSpeedgrader = this.normalizeName(msg.speedgraderName || '');

    if (!currentQueued || !currentSpeedgrader) return;
    if (currentQueued !== messageQueued || currentSpeedgrader !== messageSpeedgrader) return;

    if (msg.sameGroup) {
      this.upsertCurrentTripletCache();
      this.renderBanner({
        queuedName: warningDiv.dataset.queuedName || msg.queuedName,
        speedgraderName: warningDiv.dataset.speedgraderName || msg.speedgraderName,
        sameGroup: true,
        matchedGroupHeader: msg.matchedGroupHeader || '',
        statusText: '',
        showGroupsLink: false,
      });
      return;
    }

    const failureText = msg.error
      ? `Groups check could not verify same-group status: ${msg.error}`
      : 'Groups check completed and did not find both names in one group.';

    this.renderBanner({
      queuedName: warningDiv.dataset.queuedName || msg.queuedName,
      speedgraderName: warningDiv.dataset.speedgraderName || msg.speedgraderName,
      sameGroup: false,
      matchedGroupHeader: '',
      statusText: failureText,
      showGroupsLink: this.isGroupAssignmentDetected(),
    });
  },

  maybeApplyTripletCacheLookupResult(msg) {
    const pendingLookup = this.__pendingTripletLookup;
    if (!pendingLookup) return;
    if (!msg || msg.requestId !== pendingLookup.requestId) return;

    this.__pendingTripletLookup = null;

    const currentContext = this.getCurrentTripletContext();
    if (!currentContext || this.getTripletContextKey(currentContext) !== pendingLookup.contextKey) {
      return;
    }

    if (msg.error || !msg.hit || !this.isGroupAssignmentDetected()) {
      return;
    }

    if (!this.isCurrentSubmissionAlreadyGraded()) {
      return;
    }

    try {
      window.postMessage({
        type: CSH_MESSAGE_TYPES.TRIGGER_GROUP_MATCH_GRADING_STATUS,
        queuedName: pendingLookup.queuedName,
        isGraded: true,
      }, '*');
    } catch (e) {
      console.warn('CSH: Failed to trigger cached same-group graded flow.', e);
    }
  },

  attachGroupsResultListener() {
    if (this.__groupsResultListenerAttached) return;
    this.__groupsResultListenerAttached = true;

    window.addEventListener('message', (event) => {
      try {
        if (!event || event.source !== window) return;
        const msg = event.data;
        if (!msg || !msg.type) return;

        if (msg.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT) {
          this.maybeApplyGroupsResult(msg);
          return;
        }

        if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP_RESULT) {
          this.maybeApplyTripletCacheLookupResult(msg);
        }
      } catch (e) {
        console.error('Error handling groups check result message:', e);
      }
    });
  },

  async showStudentNameMismatchWarning(queuedName, speedgraderName) {
    try {
      const showGroupsLink = await this.waitForGroupIndicators();

      this.renderBanner({
        queuedName,
        speedgraderName,
        sameGroup: false,
        matchedGroupHeader: '',
        statusText: '',
        showGroupsLink,
      });

      if (showGroupsLink && AUTO_GROUP_CHECK_ON_NAME_MISMATCH) {
        this.startGroupsCheck(queuedName, speedgraderName);
      }

      console.warn('CSH: Student name mismatch detected!', {
        queued: queuedName,
        speedgrader: speedgraderName
      });
    } catch (e) {
      console.error('Error displaying student name mismatch warning:', e);
    }
  },

  checkQueuedStudentName(retryCount = 0, maxRetries = 20) {
    const queued = QUEUED_STUDENT_NAME;
    if (!queued || !queued.name) {
      console.log('CSH: No queued student name to check');
      return;
    }

    const currentName = StudentNameService.getCurrentStudentNameFromPage(true);

    if (!currentName) {
      if (retryCount < maxRetries) {
        console.log(`CSH: Student name not available yet, retrying... (${retryCount + 1}/${maxRetries})`);
        setTimeout(() => this.checkQueuedStudentName(retryCount + 1, maxRetries), 1000);
      } else {
        console.warn('CSH: Could not get current student name from SpeedGrader after maximum retries');
      }
      return;
    }

    try {
      window.postMessage({ type: CSH_MESSAGE_TYPES.CLEAR_QUEUED_STUDENT }, '*');
    } catch (e) {
      console.warn('CSH: Failed to send clear queued student message', e);
    }

    if (currentName.trim().toLowerCase() !== queued.name.trim().toLowerCase()) {
      if (NOTIFY_ON_STUDENT_NAME_MISMATCH) {
        this.showStudentNameMismatchWarning(queued.name, currentName);
      }
    } else {
      console.log('CSH: Student names match! \u2713');
      this.checkMatchedStudentNameForCachedGroupContext(queued.name);
    }
  }
};

const NameSanityCheck = {
  isNameUnnatural(name) {
    const letters = String(name || '').replace(/[^a-zA-Z]/g, '');
    if (!letters || letters.length < 2) return false;
    return letters === letters.toUpperCase() || letters === letters.toLowerCase();
  },

  formatNameNatural(name) {
    let result = '';
    let nextUpper = true;
    for (let i = 0; i < name.length; i++) {
      const ch = name[i];
      if (/[a-zA-Z]/.test(ch)) {
        result += nextUpper ? ch.toUpperCase() : ch.toLowerCase();
        nextUpper = false;
      } else {
        result += ch;
        nextUpper = true;
      }
    }
    return result;
  },

  getOrCreateContainer() {
    let div = document.getElementById('csh-name-sanity-warning');
    if (div) return div;

    div = document.createElement('div');
    div.id = 'csh-name-sanity-warning';
    div.setAttribute('role', 'alert');
    div.setAttribute('aria-live', 'polite');
    div.style.cssText = `
      position: fixed;
      top: 120px;
      right: 20px;
      border-radius: 4px;
      padding: 15px 20px;
      max-width: 420px;
      z-index: 10000;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #333;
      background-color: #fff3cd;
      border: 2px solid #ff9800;
    `;
    document.body.appendChild(div);
    return div;
  },

  removeContainer() {
    const div = document.getElementById('csh-name-sanity-warning');
    if (div) div.remove();
  },

  showWarning(name, issue) {
    const container = this.getOrCreateContainer();
    container.innerHTML = '';

    const heading = document.createElement('h3');
    heading.style.cssText = 'margin: 0 24px 8px 0; font-size: 16px; font-weight: 600; color: #ff6f00;';
    heading.textContent = 'Unusual Name Format';

    const message = document.createElement('p');
    message.style.cssText = 'margin: 0 0 10px 0; color: #666;';
    message.textContent = issue === 'uppercase'
      ? 'The name for this student appears to be all uppercase.'
      : 'The name for this student appears to be all lowercase.';

    container.appendChild(heading);
    container.appendChild(message);

    const suggested = this.formatNameNatural(name);

    const linkWrap = document.createElement('div');
    linkWrap.style.cssText = 'margin: 0 0 4px 0;';

    const useSuggestedLink = document.createElement('a');
    useSuggestedLink.href = '#';
    useSuggestedLink.textContent = `Use ${suggested}`;
    useSuggestedLink.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer; display: inline-block; margin-right: 16px;';
    useSuggestedLink.onclick = (event) => {
      event.preventDefault();
      this.savePreferredName(suggested);
    };
    linkWrap.appendChild(useSuggestedLink);

    const useAsIsLink = document.createElement('a');
    useAsIsLink.href = '#';
    useAsIsLink.textContent = 'Use as-is';
    useAsIsLink.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer; display: inline-block;';
    useAsIsLink.onclick = (event) => {
      event.preventDefault();
      this.savePreferredName(name);
    };
    linkWrap.appendChild(useAsIsLink);

    container.appendChild(linkWrap);

    const ignoreLink = document.createElement('div');
    ignoreLink.style.cssText = 'margin: 6px 0 0 0;';
    const ignoreA = document.createElement('a');
    ignoreA.href = '#';
    ignoreA.textContent = 'Ignore';
    ignoreA.style.cssText = 'color: #888; text-decoration: underline; cursor: pointer; font-size: 12px;';
    ignoreA.onclick = (event) => {
      event.preventDefault();
      this.removeContainer();
    };
    ignoreLink.appendChild(ignoreA);
    container.appendChild(ignoreLink);

    const closeButton = document.createElement('button');
    closeButton.textContent = '\u00d7';
    closeButton.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #ff6f00;
      padding: 0;
      width: 24px;
      height: 24px;
      line-height: 1;
    `;
    closeButton.onclick = () => this.removeContainer();
    container.appendChild(closeButton);
  },

  savePreferredName(name) {
    this.removeContainer();
    try {
      const params = new URLSearchParams(location.search || window.location.search);
      const sid = params.get('student_id');
      if (!sid) return;
      window.postMessage({
        type: CSH_MESSAGE_TYPES.SAVE_STUDENT_NAME,
        studentId: sid,
        preferredName: name,
      }, '*');
    } catch (e) {
      console.error('Error saving preferred name:', e);
    }
  },

  check() {
    try {
      const params = new URLSearchParams(location.search || window.location.search);
      const sid = params.get('student_id');
      if (!sid || (STUDENT_NAMES && STUDENT_NAMES[sid])) return;

      const name = StudentNameService.getCurrentStudentNameFromPage();
      if (!name) return;

      if (!this.isNameUnnatural(name)) return;

      const letters = name.replace(/[^a-zA-Z]/g, '');
      const issue = letters === letters.toUpperCase() ? 'uppercase' : 'lowercase';
      this.showWarning(name, issue);
    } catch (e) {
      console.error('Error in name sanity check:', e);
    }
  },
};

function initializeAllFeatures() {
  if (typeof SubmissionDispatcher !== 'undefined') {
    SubmissionDispatcher.whenReady((api) => {
      console.log('%c[CSH DEMO] SubmissionCoordinator ready \u2014 full pipeline is live!', 'font-weight:bold;color:#2ecc71;font-size:14px');
      console.log('[CSH DEMO] Request path: speedgrader.js \u2192 SubmissionDispatcher \u2192 IframeSubmissionAdapter \u2192 (postMessage) \u2192 iframe-content-loader \u2192 adapter');
      console.log('[CSH DEMO] Fetching submission text via api.getText()...');

      api.getText()
        .then((text) => {
          const preview = typeof text === 'string' ? text.slice(0, 500) : String(text);
          console.log('%c[CSH DEMO] \u2713 Submission text received successfully!', 'font-weight:bold;color:#2ecc71');
          console.log('[CSH DEMO] Character count:', typeof text === 'string' ? text.length : 'N/A');
          console.log('[CSH DEMO] Preview (first 500 chars):');
          console.log('%c' + preview, 'color:#555;background:#f5f5f5;padding:4px 8px;border-left:3px solid #2ecc71');
          if (typeof text === 'string' && text.length > 500) {
            console.log('[CSH DEMO] ... (truncated, full length:', text.length, 'chars)');
          }

          if (typeof text !== 'string' || text.length < 20) {
            console.log('%c[CSH DEMO] \u26a0 Text too short for highlight demo, skipping', 'color:#f39c12');
            return;
          }

          const ranges = [];
          const count = 2 + Math.floor(Math.random() * 3);
          const minChunk = 10;
          const maxChunk = 80;
          const used = [];

          for (let i = 0; i < count; i++) {
            let start, end, attempts = 0;
            do {
              const chunkLen = minChunk + Math.floor(Math.random() * (maxChunk - minChunk + 1));
              start = Math.floor(Math.random() * (text.length - chunkLen));
              end = start + chunkLen;
              attempts++;
            } while (
              attempts < 20 &&
              used.some(([s, e]) => start < e && end > s)
            );

            if (attempts < 20) {
              used.push([start, end]);
              ranges.push({ start, end });
            }
          }

          if (ranges.length === 0) return;

          console.log('%c[CSH DEMO] \ud83c\udfa8 Applying ' + ranges.length + ' random highlight(s) individually...', 'font-weight:bold;color:#8e44ad');

          let completed = 0;
          ranges.forEach((r, i) => {
            const snippet = text.slice(r.start, r.end).replace(/\s+/g, ' ').trim();
            const className = HighlightClassSelector.getNext();
            if (!className) {
              console.log('[CSH DEMO]   Range ' + (i + 1) + ': skipped (no class available)');
              return;
            }

            console.log('[CSH DEMO]   Range ' + (i + 1) + ': chars ' + r.start + '\u2013' + r.end + ' \u2192 "' + snippet.slice(0, 60) + (snippet.length > 60 ? '\u2026' : '') + '" (' + className + ')');
            console.log('[CSH DEMO]   Range ' + (i + 1) + ' expected [' + className + ']: "' + text.slice(r.start, r.end) + '"');

            api.applyHighlights([r], className)
              .then(() => {
                completed++;
                if (completed === ranges.length) {
                  console.log('%c[CSH DEMO] \u2713 All ' + ranges.length + ' highlights applied successfully!', 'font-weight:bold;color:#2ecc71');
                }
              })
              .catch((err) => {
                console.error('%c[CSH DEMO] \u2717 Failed to apply range ' + (i + 1) + ' (' + className + '):', 'font-weight:bold;color:#e74c3c', err.message);
              });
          });
        })
        .catch((err) => {
          console.error('%c[CSH DEMO] \u2717 Failed to fetch submission text:', 'font-weight:bold;color:#e74c3c', err.message);
        });
    });
  }

  PlaceholderEngine.waitForTinyMCE();

  CommentModeController.attachCommentModeObserver();

  RubricController.handleRubricFunctionality();

  try {
    NotificationUI.attachGroupsResultListener();

    setTimeout(() => NotificationUI.checkQueuedStudentName(), 500);
  } catch (e) {
    console.error('Error initializing queue student name check:', e);
  }

  if (ENABLE_NAME_SANITY_CHECK) {
    try {
      setTimeout(() => {
        const tryCheck = (retry = 0) => {
          NameSanityCheck.check();
          if (retry < 20 && !document.querySelector('button[data-testid="student-select-trigger"] [data-testid="selected-student"]')) {
            setTimeout(() => tryCheck(retry + 1), 1000);
          }
        };
        tryCheck();
      }, 1000);
    } catch (e) {
      console.error('Error initializing name sanity check:', e);
    }
  }
}

function tryInit() {
  if (!SettingsBridge.init()) return false;
  SettingsBridge.attachSettingsUpdateListener();
  SettingsBridge.waitForStoredSettings(initializeAllFeatures);
  return true;
}

if (!tryInit()) {
  const observer = new MutationObserver(() => {
    if (tryInit()) {
      observer.disconnect();
    }
  });
  observer.observe(document.head, { attributes: true, attributeFilter: ['data-csh-settings'] });
}
