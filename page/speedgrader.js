(() => {
  'use strict';

  // ============================================================================
  // GLOBAL STATE & CONFIGURATION
  // ============================================================================

  // Extension settings
  let PLACEHOLDERS;
  let OPEN_RUBRIC_FOR_UNGRADED;
  let OPEN_COMMENT_LIBRARY_AFTER_SUBMIT;
  let AUTO_FILL_FULL_POINTS;
  let REMEMBER_POINTS_FOR_COMMENTS;
  let OPEN_COMMENT_BOX_AFTER_MAX_POINTS;
  let OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS;
  let CLEAR_COMMENT_BOX_ON_MAX_POINTS;
  let NOTIFY_ON_STUDENT_NAME_MISMATCH;
  let SAVED_POINTS;
  let STUDENT_NAME_FORMAT;
  let STUDENT_NAMES;
  let QUEUED_STUDENT_NAME;
  let LAST_TOUCHED_STUDENT_ID = null;
  const TOUCHED_POINTS = new Set();

  // Map to store initial "blank" values of comment library dropdowns (keyed by criterion ID)
  const BLANK_DROPDOWN_VALUES = {};

  // ============================================================================
  // NAMESPACE: SettingsBridge
  // Handles settings initialization, validation, and live updates from extension
  // ============================================================================
  const SettingsBridge = {
    /**
     * Initialize settings from script element data-settings attribute
     */
    init() {
      try {
        const raw = document.currentScript
          && document.currentScript.dataset
          && document.currentScript.dataset.settings;

        if (!raw) {
          console.error('No settings found in script dataset. Exiting...');
          return false;
        }

        return this.applySettingsFromJson(raw);
      } catch (e) {
        console.error('Error initializing settings from script dataset:', e);
        return false;
      }
    },

    /**
     * Parse and apply settings from JSON string
     */
    applySettingsFromJson(jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        return this.applySettings(parsed);
      } catch (e) {
        console.error('Error parsing settings JSON:', e);
        return false;
      }
    },

    /**
     * Apply parsed settings object to global variables
     */
    applySettings(settings) {
      if (!settings) return false;

      // Synced settings
      if (Array.isArray(settings.placeholders) && settings.placeholders.length) {
        PLACEHOLDERS = settings.placeholders;
      }
      if (typeof settings.openRubricForUngraded !== 'undefined') {
        OPEN_RUBRIC_FOR_UNGRADED = !!settings.openRubricForUngraded;
      }
      if (typeof settings.openCommentLibraryAfterSubmit !== 'undefined') {
        OPEN_COMMENT_LIBRARY_AFTER_SUBMIT = !!settings.openCommentLibraryAfterSubmit;
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
      if (typeof settings.clearCommentBoxOnMaxPoints !== 'undefined') {
        CLEAR_COMMENT_BOX_ON_MAX_POINTS = !!settings.clearCommentBoxOnMaxPoints;
      }
      if (typeof settings.notifyOnStudentNameMismatch !== 'undefined') {
        NOTIFY_ON_STUDENT_NAME_MISMATCH = !!settings.notifyOnStudentNameMismatch;
      }
      if (settings.savedPoints && typeof settings.savedPoints === 'object') {
        SAVED_POINTS = settings.savedPoints;
      }
      if (settings.studentNameFormat && typeof settings.studentNameFormat === 'string') {
        STUDENT_NAME_FORMAT = settings.studentNameFormat;
      }

      // Local (non-synced) settings
      if (settings.studentNames && typeof settings.studentNames === 'object') {
        STUDENT_NAMES = settings.studentNames;
      }
      if (settings.queuedStudentName) {
        QUEUED_STUDENT_NAME = settings.queuedStudentName;
      }

      return true;
    },

    /**
     * Listen for live setting updates from the extension content script
     */
    attachSettingsUpdateListener() {
      window.addEventListener('message', (event) => {
        try {
          // Validate message origin
          if (!event || event.source !== window) return;

          // Validate message type
          const msg = event.data;
          if (!msg || msg.type !== CSH_MESSAGE_TYPES.UPDATE_SETTINGS) return;

          // Process settings update
          const settings = msg.settings || {};
          const changes = msg.studentNameChanges || {};

          // Apply new settings
          this.applySettings(settings);

          // If rubric auto-open is enabled, trigger rubric functionality
          if (OPEN_RUBRIC_FOR_UNGRADED) {
            try {
              RubricController.handleRubricFunctionality();
            } catch (e) {
              // ignore
            }
          }

          // If a studentName mapping changed for the current student_id, do in-place replacement
          this.handleStudentNameChange(changes);

          // Attempt in-place application for placeholders
          PlaceholderEngine.applySettingsToEditors();
          PlaceholderEngine.applySettingsToTextareas();
          PlaceholderEngine.attachCommentLibraryTextareaListeners();
        } catch (e) {
          console.error('Error handling CSH_UPDATE_SETTINGS message:', e);
        }
      });
    },

    /**
     * Handle in-place replacement of student names when they change
     */
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

        // Replace in all editors
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
    }
  };

  // ============================================================================
  // NAMESPACE: StudentNameService
  // Handles student name resolution from URL mappings or SpeedGrader UI
  // ============================================================================
  const StudentNameService = {
    /**
     * Get the current student name from SpeedGrader UI based on configured format
     */
    getCurrentStudentNameFromPage(forceFullName = false) {
      // Find the selected student name element from the student selector button in the navbar
      const el = document.querySelector(
        'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
      );
      let fullName = el?.textContent?.trim() || null;

      // If the name is truncated (ends with ellipsis), try to get the full name using a fallback query
      if (fullName && fullName.endsWith('…')) {
        try {
          // Extract the truncated name without the ellipsis
          const truncatedName = fullName.slice(0, -1).trim();

          // Query for the full name using the name attribute
          const fullNameElement = document.querySelector(
            `button[data-testid="student-select-trigger"] [name^="${truncatedName}"]`
          );

          if (fullNameElement) {
            // Get the full name from the name attribute
            const nameAttr = fullNameElement.getAttribute('name');
            if (nameAttr) {
              fullName = nameAttr;
            }
          }
        } catch (e) {
          // If fallback fails, continue with the truncated name
          console.error('Error retrieving full student name from truncated version:', e);
        }
      }

      // Return the name based on the configured format
      if (!fullName) return null;
      if (STUDENT_NAME_FORMAT === 'full-name' || forceFullName) {
        return fullName;
      }
      // Default to first name
      return fullName.split(/\s+/)[0];
    },

    /**
     * Get the student name to use: from mappings or from SpeedGrader UI
     */
    getStudentName() {
      // Prefer a saved name for the student_id query param if provided
      try {
        const params = new URLSearchParams(location.search || window.location.search);
        const sid = params.get('student_id');
        if (sid && STUDENT_NAMES && STUDENT_NAMES[sid]) {
          if (LAST_TOUCHED_STUDENT_ID !== sid) {
            LAST_TOUCHED_STUDENT_ID = sid;
            try {
              window.postMessage({ type: CSH_MESSAGE_TYPES.TOUCH_STUDENT_NAME, key: sid }, '*');
            } catch (e) {
              // ignore
            }
          }
          return STUDENT_NAMES[sid];
        }
      } catch (e) {
        console.error('Error parsing URL for student_id:', e);
      }

      // Fallback to UI extraction
      return this.getCurrentStudentNameFromPage();
    }
  };

  // ============================================================================
  // NAMESPACE: PlaceholderEngine
  // Handles placeholder replacement in TinyMCE editors and textareas
  // ============================================================================
  const PlaceholderEngine = {
    /**
     * Replace placeholders in a TinyMCE editor with the current student name
     */
    replacePlaceholdersInEditor(editor) {
      try {
        const content = editor.getContent();
        if (!content) return;
        const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
        if (!hasPlaceholder) return;

        const name = StudentNameService.getStudentName();
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

    /**
     * Apply placeholder replacement to all existing TinyMCE editors
     */
    applySettingsToEditors() {
      if (!window.tinymce) return;
      window.tinymce.editors.forEach(editor => this.replacePlaceholdersInEditor(editor));
    },

    /**
     * Replace placeholders in a textarea with the current student name
     */
    replacePlaceholdersInTextarea(textarea) {
      try {
        const content = textarea.value;
        if (!content) return;
        const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
        if (!hasPlaceholder) return;

        const name = StudentNameService.getStudentName();
        if (!name) return;

        let updated = content;
        PLACEHOLDERS.forEach(ph => {
          if (updated.includes(ph)) {
            updated = updated.replaceAll(ph, name);
          }
        });
        if (updated !== content) {
          textarea.value = updated;
          // Trigger input event to notify listeners
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } catch (e) {
        console.error('Error replacing placeholders in textarea:', e);
      }
    },

    /**
     * Apply placeholder replacement to all comment textareas
     */
    applySettingsToTextareas() {
      const textareas = document.querySelectorAll('textarea[data-testid^="free-form-comment-area-"]');
      textareas.forEach(textarea => this.replacePlaceholdersInTextarea(textarea));
    },

    /**
     * Attach listeners to comment-library inputs to trigger placeholder replacement
     */
    attachCommentLibraryTextareaListeners() {
      const commentLibraryInputs = document.querySelectorAll('input[data-testid^="comment-library-"]');

      commentLibraryInputs.forEach((libraryInput) => {
        // Avoid attaching multiple listeners
        if (libraryInput.__textareaListenerAttached) return;
        libraryInput.__textareaListenerAttached = true;

        // Extract criterion ID from data-testid (format: "comment-library-{ID}")
        const testId = libraryInput.getAttribute('data-testid');
        const criterionId = testId ? testId.split('-').pop() : null;

        if (!criterionId) return;

        // Find the corresponding textarea
        const textarea = document.querySelector(`textarea[data-testid^="free-form-comment-area-"][data-testid$="${criterionId}"]`);
        if (!textarea) return;

        // Listen for input changes on the comment library input
        libraryInput.addEventListener('input', () => {
          this.replacePlaceholdersInTextarea(textarea);
        });
      });
    },

    /**
     * Attach hook to a TinyMCE editor to handle future content sets
     */
    attachEditorHook(editor) {
      // Avoid attaching multiple times
      if (!editor || editor.__studentNameHookAttached) return;
      editor.__studentNameHookAttached = true;

      // Hook into content setting
      editor.on('SetContent', () => {
        this.replacePlaceholdersInEditor(editor);
      });
    },

    /**
     * Attach hooks to all existing editors
     */
    attachToExistingEditors() {
      if (!window.tinymce) return;
      window.tinymce.editors.forEach(editor => this.attachEditorHook(editor));
    },

    /**
     * Wait for TinyMCE to be available, then attach hooks and set up polling
     */
    waitForTinyMCE() {
      if (window.tinymce) {
        this.attachToExistingEditors();

        // Handle editors added later (SPA navigation, reinit, etc.)
        window.tinymce.on('AddEditor', (e) => {
          this.attachEditorHook(e.editor);
        });

        // Periodically check for any editors that might have been missed
        setInterval(() => this.attachToExistingEditors(), 5000);
        return;
      }

      // TinyMCE not ready yet, retry
      setTimeout(() => this.waitForTinyMCE(), 250);
    }
  };

  // ============================================================================
  // NAMESPACE: RubricController
  // Handles rubric view/cancel wiring and initialization
  // ============================================================================
  const RubricController = {
    /**
     * Attach all rubric-related handlers after the rubric UI loads
     */
    attachAllRubricHandlers() {
      CommentLibraryController.attachCommentLibraryHandler();
      this.attachCancelRubricListener();
      PointsMemory.attachAutoFillListeners();
      PointsMemory.attachCommentLibraryChangeListeners();
      PlaceholderEngine.attachCommentLibraryTextareaListeners();
      StructuredRubricUX.attachStructuredRubricListeners();
      StructuredRubricUX.attachClearCommentOnMaxPointsListeners();
      PlaceholderEngine.applySettingsToTextareas();
    },

    /**
     * Attach click listener to the view-rubric-button with idempotency check
     */
    attachViewRubricListener(rubricButton) {
      // Check if listener already attached (avoid duplicates)
      if (rubricButton.__viewRubricHandlerAttached) return;

      rubricButton.__viewRubricHandlerAttached = true;
      rubricButton.addEventListener('click', () => {
        // Give the rubric UI time to load, then attach handlers
        setTimeout(() => this.attachAllRubricHandlers(), 1000);
      });
    },

    /**
     * Reattach the view-rubric-button listener after it reappears in the DOM
     */
    reattachViewRubricListener(retryCount = 0, maxRetries = 10) {
      const rubricButton = document.querySelector('button[data-testid="view-rubric-button"]');

      if (!rubricButton) {
        // Button not found yet, retry after 500ms (up to maxRetries)
        if (retryCount < maxRetries) {
          setTimeout(() => this.reattachViewRubricListener(retryCount + 1, maxRetries), 500);
        } else {
          console.log('CSH: view-rubric-button not found after maximum retries');
        }
        return;
      }

      // Button found, attach the click listener
      this.attachViewRubricListener(rubricButton);
      console.log('CSH: view-rubric-button listener reattached');
    },

    /**
     * Attach listener to cancel button to reattach view-rubric-button handlers when cancelled
     */
    attachCancelRubricListener() {
      const cancelButton = document.querySelector('button[data-testid="cancel-rubric-assessment-button"]');
      if (!cancelButton) return;

      // Avoid attaching multiple listeners
      if (cancelButton.__cancelRubricListenerAttached) return;
      cancelButton.__cancelRubricListenerAttached = true;

      // Attach the click listener to "Cancel" button
      cancelButton.addEventListener('click', () => {
        // Wait 1 second after cancellation, then reattach view-rubric-button listener
        setTimeout(() => {
          this.reattachViewRubricListener();
        }, 1000);
      });
    },

    /**
     * Apply functionality related to rubric handling
     */
    handleRubricFunctionality() {
      const rubricButton = document.querySelector('button[data-testid="view-rubric-button"]');

      if (!rubricButton) {
        // Check if the rubric is already open (save button exists)
        const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
        if (saveButton) {
          // Rubric is already open, so skip the retry
          console.log('Rubric button not found, but rubric is already open');
          return;
        }

        // Button not found and rubric not open, retry after 2 seconds
        console.log('Rubric button not found yet');
        setTimeout(() => this.handleRubricFunctionality(), 2000);
        return;
      }

      // Attach the click listener for view-rubric-button
      this.attachViewRubricListener(rubricButton);

      // Button found, wait 2 seconds before checking for the rubric table
      if (!OPEN_RUBRIC_FOR_UNGRADED) return;
      setTimeout(() => {
        const rubricTable = document.querySelector('div.rubric_summary');
        if (!rubricTable) {
          // Automatically open rubric if the rubric button is present and there's no rubric table (i.e. no previous evaluation exists).
          rubricButton.click();
        }
      }, 2000);
    }
  };

  // ============================================================================
  // NAMESPACE: CommentLibraryController
  // Handles comment library submission and opening behavior
  // ============================================================================
  const CommentLibraryController = {
    /**
     * Attach click listener to the save rubric button
     */
    attachCommentLibraryHandler() {
      const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
      if (!saveButton) return;

      // Avoid attaching multiple listeners
      if (saveButton.__commentLibraryHandlerAttached) return;
      saveButton.__commentLibraryHandlerAttached = true;

      // Attach the click listener to "Submit Assessment" button
      saveButton.addEventListener('click', () => {
        // Apply placeholder replacement to textareas before submission
        PlaceholderEngine.applySettingsToTextareas();

        // Handle points saving for comments if feature is enabled
        if (REMEMBER_POINTS_FOR_COMMENTS) {
          this.handlePointsSaving();
        }

        // Wait 1 second after submission
        setTimeout(() => {
          // Reattach the view-rubric-button listener since it gets removed when the rubric collapses
          RubricController.reattachViewRubricListener();

          // Skip if the setting is disabled
          if (!OPEN_COMMENT_LIBRARY_AFTER_SUBMIT) return;

          // Find and click the comment library button
          const commentLibButton = document.querySelector('button[data-testid="comment-library-button"]');
          if (commentLibButton) {
            commentLibButton.click();
          }
        }, 1000);
      });
    },

    /**
     * Handle saving points for comments
     */
    handlePointsSaving() {
      try {
        // Get assignment_id from URL
        const params = new URLSearchParams(location.search || window.location.search);
        const assignmentId = params.get('assignment_id');

        if (!assignmentId) return;

        const pointsToSave = {};

        // Find all criterion points inputs
        const criterionInputs = document.querySelectorAll('input[data-testid^="rubric-criterion-"], input[data-testid^="criterion-score-"]');

        criterionInputs.forEach((input) => {
          try {
            // Extract criterion ID from data-testid (format: "rubric-criterion-{ID}")
            const testId = input.getAttribute('data-testid');
            const criterionId = testId ? testId.split('-').pop() : null;

            if (!criterionId) return;

            // Check if save-comment-checkbox is checked
            const saveCheckbox = document.querySelector(`input[data-testid^="save-comment-checkbox-"][data-testid$="${criterionId}"]`);
            const isSaveChecked = saveCheckbox && saveCheckbox.checked;

            // Check if Comment Library dropdown has a value
            const dropdown = document.querySelector(`input[data-testid^="comment-library-"][data-testid$="${criterionId}"]`);
            const dropdownValue = dropdown ? dropdown.value : null;
            const blankValue = BLANK_DROPDOWN_VALUES[criterionId] || null;
            const hasDropdownValue = dropdownValue && dropdownValue !== blankValue;

            // Check if textarea has content
            const textarea = document.querySelector(`textarea[data-testid^="free-form-comment-area-"][data-testid$="${criterionId}"]`);
            const textareaValue = textarea ? textarea.value : null;
            const hasTextareaContent = textareaValue && textareaValue.trim().length > 0;

            const pointsValue = input.value;
            let keyValue = null;

            if (isSaveChecked && pointsValue && textareaValue) {
              // If checkbox is checked, use textarea value for the key
              // Truncate to 99 chars and add ellipsis if longer than 100 (mimicking Canvas)
              const truncatedValue = textareaValue.length > 100
                ? textareaValue.substring(0, 99) + '…'
                : textareaValue;
              keyValue = truncatedValue;
            } else if (pointsValue && hasTextareaContent && hasDropdownValue) {
              // If checkbox is not checked, use dropdown value (but only if textarea has content too)
              keyValue = dropdownValue;
            }

            // Save the points if we have a key value
            if (keyValue) {
              const key = `${assignmentId}::${criterionId}::${keyValue}`;
              pointsToSave[key] = pointsValue;
            }
          } catch (e) {
            console.error('Error processing criterion for points saving:', e);
          }
        });

        // If we have points to save, send message to extension
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

  // ============================================================================
  // NAMESPACE: PointsMemory
  // Handles point memory (auto-fill, save/load, prepopulation from comments)
  // ============================================================================
  const PointsMemory = {
    /**
     * Attach focus listeners to criterion inputs for auto-filling full points
     */
    attachAutoFillListeners() {
      // Skip if the setting is disabled
      if (!AUTO_FILL_FULL_POINTS) return;

      // Find all criterion score inputs
      const scoreInputs = document.querySelectorAll('input[data-testid^="criterion-score-"]');

      scoreInputs.forEach((input) => {
        // Avoid attaching multiple listeners
        if (input.__autoFillListenerAttached) return;
        input.__autoFillListenerAttached = true;

        input.addEventListener('focus', () => {
          try {
            // If no value exists, populate with max points
            if (!input.value || input.value.trim() === '') {
              // Navigate the DOM to find the max points span
              // Path: input -> parent span -> parent span -> parent label[data-cid="TextInput"]
              //       -> parent span -> next sibling span -> child span
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

              // Parse the max points from the text content (format: "/# pts")
              const text = childSpan.textContent.trim();
              const match = text.match(/\/(\d+(?:\.\d+)?)\s*pts?/);
              if (!match) return;

              const maxPoints = match[1];

              // Set the input value to the max points
              input.value = maxPoints;

              // Trigger events to ensure Canvas registers the change
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }

            // Select the entire input content for easy editing
            input.select();
          } catch (e) {
            console.error('Error auto-filling points for criterion:', e);
          }
        });
      });
    },

    /**
     * Attach change listeners to comment library dropdowns for prepopulating points
     * NOTE: The comment library dropdowns don't fire standard change events when selections are made.
     * To work around this, we use polling: we detect focus/blur to know when to poll, and check
     * the dropdown value every 500ms while it has focus to detect value changes.
     */
    attachCommentLibraryChangeListeners() {
      // Skip if the feature is disabled
      if (!REMEMBER_POINTS_FOR_COMMENTS) return;
      if (!SAVED_POINTS || typeof SAVED_POINTS !== 'object') return;

      // Get assignment_id from URL
      let assignmentId;
      try {
        const params = new URLSearchParams(location.search || window.location.search);
        assignmentId = params.get('assignment_id');
        if (!assignmentId) return;
      } catch (e) {
        console.error('Error parsing URL for assignment_id:', e);
        return;
      }

      // Find all comment library dropdowns
      const dropdowns = document.querySelectorAll('input[data-testid^="comment-library-"]');

      // First pass: capture initial "blank" values for each dropdown
      dropdowns.forEach((dropdown) => {
        const testId = dropdown.getAttribute('data-testid');
        const criterionId = testId ? testId.split('-').pop() : null;
        if (criterionId && !BLANK_DROPDOWN_VALUES[criterionId]) {
          // Store the initial value as the "blank" value
          BLANK_DROPDOWN_VALUES[criterionId] = dropdown.value;
        }
      });

      dropdowns.forEach((dropdown) => {
        // Avoid attaching multiple listeners
        if (dropdown.__pointsPrePopulateListenerAttached) return;
        dropdown.__pointsPrePopulateListenerAttached = true;

        // Extract criterion ID from data-testid (format: "comment-library-{ID}")
        const testId = dropdown.getAttribute('data-testid');
        const criterionId = testId ? testId.split('-').pop() : null;

        if (!criterionId) return;

        // Get the corresponding points input element
        const pointsInput = document.querySelector(`input[data-testid^="rubric-criterion-"][data-testid$="${criterionId}"], input[data-testid^="criterion-score-"][data-testid$="${criterionId}"]`);
        if (!pointsInput) return;

        // Track the previous dropdown value and polling interval
        let previousDropdownValue = dropdown.value;
        let pollingInterval = null;

        // Helper function to check dropdown value and prepopulate points
        const checkAndPrepopulatePoints = () => {
          try {
            const currentDropdownValue = dropdown.value;

            // If dropdown value hasn't changed, don't do anything
            if (currentDropdownValue === previousDropdownValue) return;

            // Value has changed, update previousDropdownValue for the next check
            previousDropdownValue = currentDropdownValue;

            // Get the blank value for this criterion
            const blankValue = BLANK_DROPDOWN_VALUES[criterionId] || null;

            // If the new value is empty or matches the blank value, don't prepopulate points
            if (!currentDropdownValue || currentDropdownValue === blankValue) return;

            // Create lookup key using assignment_id, criterion_id, and dropdown value
            const key = `${assignmentId}::${criterionId}::${currentDropdownValue}`;

            // Check if we have saved points for this comment
            if (SAVED_POINTS[key]) {
              // Set the points value from saved history
              // Use the native setter to properly update framework-controlled inputs, then trigger focus/blur events to ensure Canvas registers the update.
              const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
              nativeInputValueSetter.call(pointsInput, SAVED_POINTS[key]);
              setTimeout(() => {
                pointsInput.focus();
                setTimeout(() => {
                  dropdown.focus();
                }, 50);
              }, 50);

              // Trigger input event to ensure Canvas (and framework) registers the change
              pointsInput.dispatchEvent(new Event('input', { bubbles: true }));
              pointsInput.dispatchEvent(new Event('change', { bubbles: true }));

              if (!TOUCHED_POINTS.has(key)) {
                TOUCHED_POINTS.add(key);
                try {
                  window.postMessage({ type: CSH_MESSAGE_TYPES.TOUCH_POINTS, keys: [key] }, '*');
                } catch (e) {
                  // ignore
                }
              }
            }
          } catch (e) {
            console.error('Error prepopulating points from comment library:', e);
          }
        };

        // When the dropdown receives focus, start polling
        dropdown.addEventListener('focus', () => {
          previousDropdownValue = dropdown.value;

          // Start polling for value changes every 500ms
          if (!pollingInterval) {
            pollingInterval = setInterval(checkAndPrepopulatePoints, 500);
          }
        });

        // When the dropdown loses focus, stop polling
        dropdown.addEventListener('blur', () => {
          if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
          }
        });
      });
    }
  };

  // ============================================================================
  // NAMESPACE: StructuredRubricUX
  // Handles structured rubric comment box behavior and auto-clear on max points
  // ============================================================================
  const StructuredRubricUX = {
    /**
     * Attach click listeners to structured rubric max-point rating buttons to auto-clear comment boxes
     */
    attachClearCommentOnMaxPointsListeners() {
      // Find all structured rubric rating buttons for max points (ratings-0)
      const maxPointsButtons = document.querySelectorAll('button[data-testid^="traditional-criterion-"][data-testid$="-ratings-0"]');

      maxPointsButtons.forEach((button) => {
        // Avoid attaching multiple listeners
        if (button.__clearCommentOnMaxPointsListenerAttached) return;
        button.__clearCommentOnMaxPointsListenerAttached = true;

        button.addEventListener('click', () => {
          try {
            // Check if the setting is enabled
            if (!CLEAR_COMMENT_BOX_ON_MAX_POINTS) return;

            // Extract criterion_id from data-testid
            // Format: "traditional-criterion-{criterion_id}-ratings-0"
            const testId = button.getAttribute('data-testid');
            if (!testId || !testId.startsWith('traditional-criterion-')) return;

            const parts = testId.split('-');
            // parts: ['traditional', 'criterion', criterion_id, 'ratings', '0']
            if (parts.length < 3) return;

            const criterionId = parts[2];

            // Find and click the clear-comment button for this criterion
            const clearCommentButton = document.querySelector(`button[data-testid="clear-comment-button-${criterionId}"]`);
            if (clearCommentButton) {
              clearCommentButton.click();
            }
          } catch (e) {
            console.error('Error handling clear comment on max points click:', e);
          }
        });
      });
    },

    /**
     * Attach click listeners to structured rubric rating buttons to auto-open comment boxes
     */
    attachStructuredRubricListeners() {
      // Find all structured rubric rating buttons
      const ratingButtons = document.querySelectorAll('button[data-testid^="traditional-criterion-"]');

      ratingButtons.forEach((button) => {
        // Avoid attaching multiple listeners
        if (button.__structuredRubricListenerAttached) return;
        button.__structuredRubricListenerAttached = true;

        button.addEventListener('click', () => {
          try {
            // Extract criterion_id and rubric_point_id from data-testid
            // Format: "traditional-criterion-{criterion_id}-ratings-{rubric_point_id}"
            const testId = button.getAttribute('data-testid');
            if (!testId || !testId.startsWith('traditional-criterion-')) return;

            const parts = testId.split('-');
            // parts: ['traditional', 'criterion', criterion_id, 'ratings', rubric_point_id, ...]
            if (parts.length < 5) return;

            const criterionId = parts[2];
            const rubricPointId = parseInt(parts[4], 10);

            // Check if the feature is enabled for this point level
            if (rubricPointId === 0) {
              // Maximum points - check if the first option is enabled
              if (!OPEN_COMMENT_BOX_AFTER_MAX_POINTS) return;
            } else {
              // Less-than-maximum points - check if the second option is enabled
              if (!OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS) return;
            }

            // Find and click the toggle-comment button for this criterion
            const toggleCommentButton = document.querySelector(`button[data-testid="toggle-comment-${criterionId}"]`);

            // Helper function to focus the comment text area
            const focusCommentTextArea = () => {
              const commentTextArea = document.querySelector(`textarea[data-testid="comment-text-area-${criterionId}"]`);
              if (commentTextArea) {
                commentTextArea.focus();
              }
            };

            if (!toggleCommentButton) {
              // If toggle button not found, check if textarea already exists and focus it
              focusCommentTextArea();
              return;
            }

            toggleCommentButton.click();

            // Wait for UI to cooldown, then focus the comment text area
            setTimeout(focusCommentTextArea, 500);
          } catch (e) {
            console.error('Error handling structured rubric rating button click:', e);
          }
        });
      });
    }
  };

  // ============================================================================
  // NAMESPACE: NotificationUI
  // Handles student name mismatch warnings and notifications
  // ============================================================================
  const NotificationUI = {
    /**
     * Escape HTML special characters for safe display in DOM
     */
    escapeHtml(text) {
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, (m) => map[m]);
    },

    /**
     * Display a warning notification when student names don't match
     */
    showStudentNameMismatchWarning(queuedName, speedgraderName) {
      try {
        // Create a warning container
        const warningDiv = document.createElement('div');
        warningDiv.id = 'csh-student-mismatch-warning';
        warningDiv.setAttribute('role', 'alert');
        warningDiv.setAttribute('aria-live', 'assertive');
        warningDiv.style.cssText = `
          position: fixed;
          top: 65px;
          right: 20px;
          background-color: #fff3cd;
          border: 2px solid #ff9800;
          border-radius: 4px;
          padding: 15px 20px;
          max-width: 400px;
          z-index: 10000;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 14px;
          line-height: 1.5;
          color: #333;
        `;

        const heading = document.createElement('h3');
        heading.style.cssText = 'margin: 0px 24px 8px 0px; font-size: 16px; font-weight: 600; color: #ff6f00;';
        heading.textContent = '⚠️ Student Name Mismatch';

        const messageDiv = document.createElement('p');
        messageDiv.style.cssText = 'margin: 0 0 10px 0; color: #666;';
        messageDiv.innerHTML = `<strong>Grading Queue:</strong> ${this.escapeHtml(queuedName)}<br><strong>SpeedGrader:</strong> ${this.escapeHtml(speedgraderName)}`;

        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
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
        closeButton.onclick = () => warningDiv.remove();

        warningDiv.appendChild(heading);
        warningDiv.appendChild(messageDiv);
        warningDiv.appendChild(closeButton);
        document.body.appendChild(warningDiv);

        console.warn('CSH: Student name mismatch detected!', {
          queued: queuedName,
          speedgrader: speedgraderName
        });
      } catch (e) {
        console.error('Error displaying student name mismatch warning:', e);
      }
    },

    /**
     * Check if queued student name matches the current SpeedGrader student name with retry logic
     */
    checkQueuedStudentName(retryCount = 0, maxRetries = 20) {
      const queued = QUEUED_STUDENT_NAME;
      if (!queued || !queued.name) {
        console.log('CSH: No queued student name to check');
        return;
      }

      // Get the current student name from SpeedGrader
      const currentName = StudentNameService.getCurrentStudentNameFromPage(true); // Force full name for comparison

      // If name is not available yet, retry after a delay (up to maxRetries)
      if (!currentName) {
        if (retryCount < maxRetries) {
          console.log(`CSH: Student name not available yet, retrying... (${retryCount + 1}/${maxRetries})`);
          setTimeout(() => this.checkQueuedStudentName(retryCount + 1, maxRetries), 1000);
        } else {
          console.warn('CSH: Could not get current student name from SpeedGrader after maximum retries');
        }
        return;
      }

      // Clear the queued student name by sending message to loader script
      try {
        window.postMessage({ type: CSH_MESSAGE_TYPES.CLEAR_QUEUED_STUDENT }, '*');
      } catch (e) {
        console.warn('CSH: Failed to send clear queued student message', e);
      }

      // Compare names (case-insensitive) and show notification if enabled
      if (currentName.toLowerCase() !== queued.name.toLowerCase()) {
        if (NOTIFY_ON_STUDENT_NAME_MISMATCH) {
          this.showStudentNameMismatchWarning(queued.name, currentName);
        }
      } else {
        console.log('CSH: Student names match! ✓');
      }
    }
  };

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  // Initialize extension settings from script data attribute
  if (!SettingsBridge.init()) {
    console.error('CSH: Failed to initialize settings. Exiting...');
    return;
  }

  // Attach listener for live settings updates from the content script
  SettingsBridge.attachSettingsUpdateListener();

  // Start TinyMCE placeholder hooks and polling
  PlaceholderEngine.waitForTinyMCE();

  // Handle rubric view button and auto-open logic
  RubricController.handleRubricFunctionality();

  // Check for queued student name from the Grading Queue (with built-in retry mechanism)
  try {
    // Wait a moment for the SpeedGrader navbar to load, then start checking
    setTimeout(() => NotificationUI.checkQueuedStudentName(), 500);
  } catch (e) {
    console.error('Error initializing queue student name check:', e);
  }
})();
