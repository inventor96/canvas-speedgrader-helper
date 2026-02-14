(() => {
  'use strict';

  // Extension settings
  let PLACEHOLDERS;
  let OPEN_RUBRIC_FOR_UNGRADED;
  let OPEN_COMMENT_LIBRARY_AFTER_SUBMIT;
  let AUTO_FILL_FULL_POINTS;
  let REMEMBER_POINTS_FOR_COMMENTS;
  let OPEN_COMMENT_BOX_AFTER_MAX_POINTS;
  let OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS;
  let CLEAR_COMMENT_BOX_ON_MAX_POINTS;
  let SAVED_POINTS;
  let STUDENT_NAME_FORMAT;
  let STUDENT_NAMES;
  let LAST_TOUCHED_STUDENT_ID = null;
  const TOUCHED_POINTS = new Set();

  // Map to store initial "blank" values of comment library dropdowns (keyed by criterion ID)
  const BLANK_DROPDOWN_VALUES = {};

  // Read settings injected by the extension loader via the script element's data-settings.
  try {
    const raw = document.currentScript
      && document.currentScript.dataset
      && document.currentScript.dataset.settings;

    if (!raw) {
      console.error('No settings found in script dataset. Exiting...');
      return;
    }

    const parsed = JSON.parse(raw);

    // Synced settings
    if (parsed && Array.isArray(parsed.placeholders) && parsed.placeholders.length) {
      PLACEHOLDERS = parsed.placeholders;
    }
    if (parsed && typeof parsed.openRubricForUngraded !== 'undefined') {
      OPEN_RUBRIC_FOR_UNGRADED = !!parsed.openRubricForUngraded;
    }
    if (parsed && typeof parsed.openCommentLibraryAfterSubmit !== 'undefined') {
      OPEN_COMMENT_LIBRARY_AFTER_SUBMIT = !!parsed.openCommentLibraryAfterSubmit;
    }
    if (parsed && typeof parsed.autoFillFullPoints !== 'undefined') {
      AUTO_FILL_FULL_POINTS = !!parsed.autoFillFullPoints;
    }
    if (parsed && typeof parsed.rememberPointsForComments !== 'undefined') {
      REMEMBER_POINTS_FOR_COMMENTS = !!parsed.rememberPointsForComments;
    }
    if (parsed && typeof parsed.openCommentBoxAfterMaxPoints !== 'undefined') {
      OPEN_COMMENT_BOX_AFTER_MAX_POINTS = !!parsed.openCommentBoxAfterMaxPoints;
    }
    if (parsed && typeof parsed.openCommentBoxAfterLessThanMaxPoints !== 'undefined') {
      OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS = !!parsed.openCommentBoxAfterLessThanMaxPoints;
    }
    if (parsed && typeof parsed.clearCommentBoxOnMaxPoints !== 'undefined') {
      CLEAR_COMMENT_BOX_ON_MAX_POINTS = !!parsed.clearCommentBoxOnMaxPoints;
    }
    if (parsed && parsed.savedPoints && typeof parsed.savedPoints === 'object') {
      SAVED_POINTS = parsed.savedPoints;
    }
    if (parsed && parsed.studentNameFormat && typeof parsed.studentNameFormat === 'string') {
      STUDENT_NAME_FORMAT = parsed.studentNameFormat;
    }

    // Local (non-synced) settings
    if (parsed && parsed.studentNames && typeof parsed.studentNames === 'object') {
      STUDENT_NAMES = parsed.studentNames;
    }
  } catch (e) {
    // Can't do much if parsing fails
    console.error('Error parsing settings from script dataset:', e);
    console.error('Exiting...');
    return;
  }

  /** Helper to get the current student name from the page based on the configured format. */
  function getCurrentStudentNameFromPage() {
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
    if (STUDENT_NAME_FORMAT === 'full-name') {
      return fullName;
    }
    // Default to first name
    return fullName.split(/\s+/)[0];
  }

  /** Get the student name to use based on student_id mapping or page content */
  function getStudentName() {
    // Prefer a saved name for the student_id query param if provided.
    try {
      const params = new URLSearchParams(location.search || window.location.search);
      const sid = params.get('student_id');
      if (sid && STUDENT_NAMES && STUDENT_NAMES[sid]) {
        if (LAST_TOUCHED_STUDENT_ID !== sid) {
          LAST_TOUCHED_STUDENT_ID = sid;
          try {
            window.postMessage({ type: 'CSH_TOUCH_STUDENT_NAME', key: sid }, '*');
          } catch (e) {
            // ignore
          }
        }
        return STUDENT_NAMES[sid];
      }
    } catch (e) {
      // log URL parsing errors
      console.error('Error parsing URL for student_id:', e);
    }

    // Fallback
    return getCurrentStudentNameFromPage();
  }

  /** Replace placeholders in the given editor with the current student name. */
  function replacePlaceholdersInEditor(editor) {
    try {
      const content = editor.getContent();
      if (!content) return;
      const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
      if (!hasPlaceholder) return;

      const name = getStudentName();
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
      // log editor errors
      console.error('Error replacing placeholders in editor:', e);
    }
  }

  /** Apply current settings to any existing editors (replace placeholders in-place). */
  function applySettingsToEditors() {
    if (!window.tinymce) return;
    window.tinymce.editors.forEach(replacePlaceholdersInEditor);
  }

  /** Replace placeholders in the given textarea with the current student name. */
  function replacePlaceholdersInTextarea(textarea) {
    try {
      const content = textarea.value;
      if (!content) return;
      const hasPlaceholder = PLACEHOLDERS.some(ph => content.includes(ph));
      if (!hasPlaceholder) return;

      const name = getStudentName();
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
      // log textarea errors
      console.error('Error replacing placeholders in textarea:', e);
    }
  }

  /** Attach listeners to comment-library inputs to trigger placeholder replacement on corresponding textareas */
  function attachCommentLibraryTextareaListeners() {
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
        replacePlaceholdersInTextarea(textarea);
      });
    });
  }

  /** Apply current settings to textareas (replace placeholders in-place). */
  function applySettingsToTextareas() {
    const textareas = document.querySelectorAll('textarea[data-testid^="free-form-comment-area-"]');
    textareas.forEach(replacePlaceholdersInTextarea);
  }

  /** Attach hook to a TinyMCE editor to handle future content sets. */
  function attachEditorHook(editor) {
    // Avoid attaching multiple times
    if (!editor || editor.__studentNameHookAttached) return;
    editor.__studentNameHookAttached = true;

    // Hook into content setting
    editor.on('SetContent', () => {
      replacePlaceholdersInEditor(editor);
    });
  }

  /** Attach hook to all existing editors */
  function attachToExistingEditors() {
    if (!window.tinymce) return;
    window.tinymce.editors.forEach(attachEditorHook);
  }

  /** Wait for TinyMCE to be ready, then attach hooks */
  function waitForTinyMCE() {
    if (window.tinymce) {
      attachToExistingEditors();

      // Handle editors added later (SPA navigation, reinit, etc.)
      window.tinymce.on('AddEditor', (e) => {
        attachEditorHook(e.editor);
      });

      // Periodically check for any editors that might have been missed
      setInterval(attachToExistingEditors, 5000);

      return;
    }

    // TinyMCE not ready yet
    setTimeout(waitForTinyMCE, 250);
  }

  /** Add click event listener to the save rubric button to auto-open comment library and save points */
  function attachCommentLibraryHandler() {
    const saveButton = document.querySelector('button[data-testid="save-rubric-assessment-button"]');
    if (!saveButton) return;

    // Avoid attaching multiple listeners
    if (saveButton.__commentLibraryHandlerAttached) return;
    saveButton.__commentLibraryHandlerAttached = true;

    // Attach the click listener to "Submit Assessment" button
    saveButton.addEventListener('click', () => {
      // Apply placeholder replacement to textareas before submission
      applySettingsToTextareas();

      // Handle points saving for comments if feature is enabled
      if (REMEMBER_POINTS_FOR_COMMENTS) {
        try {
          // Get assignment_id from URL
          const params = new URLSearchParams(location.search || window.location.search);
          const assignmentId = params.get('assignment_id');

          if (assignmentId) {
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
                  // Truncate to 99 chars and add ellipsis if longer than 100 (mimicing Canvas)
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
                type: 'CSH_SAVE_POINTS',
                pointsToSave
              }, '*');
            }
          }
        } catch (e) {
          console.error('Error saving points for comments:', e);
        }
      }

      // Wait 1 second after submission
      setTimeout(() => {
        // Skip if the setting is disabled
        if (!OPEN_COMMENT_LIBRARY_AFTER_SUBMIT) return;

        // Find and click the comment library button
        const commentLibButton = document.querySelector('button[data-testid="comment-library-button"]');
        if (commentLibButton) {
          commentLibButton.click();
        }
      }, 1000);
    });
  }

  /** Attach focus listeners to criterion inputs for auto-filling full points */
  function attachAutoFillListeners() {
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
          // Log errors but continue
          console.error('Error auto-filling points for criterion:', e);
        }
      });
    });
  }

  /** Attach change listeners to comment library dropdowns for prepopulating points */
  // NOTE: The comment library dropdowns don't fire standard change events when selections are made.
  // To work around this, we use polling: we detect focus/blur to know when to poll, and check
  // the dropdown value every 500ms while it has focus to detect value changes.
  function attachCommentLibraryChangeListeners() {
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
      function checkAndPrepopulatePoints() {
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
                window.postMessage({ type: 'CSH_TOUCH_POINTS', keys: [key] }, '*');
              } catch (e) {
                // ignore
              }
            }
          }
        } catch (e) {
          console.error('Error prepopulating points from comment library:', e);
        }
      }

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

  /** Attach click listeners to structured rubric max-point rating buttons to auto-clear comment boxes */
  function attachClearCommentOnMaxPointsListeners() {
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
  }

  /** Attach click listeners to structured rubric rating buttons to auto-open comment boxes */
  function attachStructuredRubricListeners() {
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

  /** Apply functionality related to rubric handling */
  function handleRubricFunctionality() {
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
      setTimeout(handleRubricFunctionality, 2000);
      return;
    }

    // Attach the click listener for view-rubric-button
    if (!rubricButton.__viewRubricHandlerAttached) {
      rubricButton.__viewRubricHandlerAttached = true;
      rubricButton.addEventListener('click', () => {
        // Give the rubric UI time to load, then attach handlers
        setTimeout(() => {
          attachCommentLibraryHandler();
          attachAutoFillListeners();
          attachCommentLibraryChangeListeners();
          attachCommentLibraryTextareaListeners();
          attachStructuredRubricListeners();
          attachClearCommentOnMaxPointsListeners();
          applySettingsToTextareas();
        }, 1000);
      });
    }


    // Button found, wait 2 seconds before checking for the rubric table
    if (!OPEN_RUBRIC_FOR_UNGRADED) return;
    setTimeout(() => {
      const rubricTable = document.querySelector('div.rubric_summary');
      if (!rubricTable) {
        // Automaticaly open rubric if the rubric button is present and there's no rubric table (i.e. no previous evaluation exists).
        rubricButton.click();
      }
    }, 2000);
  }

  // Listen for settings updates from the extension content script and apply them live.
  window.addEventListener('message', (event) => {
    try {
      // Validate message origin
      if (!event || event.source !== window) return;

      // Validate message type
      const msg = event.data;
      if (!msg || msg.type !== 'CSH_UPDATE_SETTINGS') return;

      // Fallback values
      const s = msg.settings || {};
      const changes = msg.studentNameChanges || {};

      // Update placeholders
      if (Array.isArray(s.placeholders) && s.placeholders.length) {
        PLACEHOLDERS = s.placeholders;
      }

      // Update rubric setting
      if (typeof s.openRubricForUngraded !== 'undefined') {
        OPEN_RUBRIC_FOR_UNGRADED = !!s.openRubricForUngraded;
        if (OPEN_RUBRIC_FOR_UNGRADED) {
          try { handleRubricFunctionality(); } catch (e) { /* ignore */ }
        }
      }

      // Update comment library setting
      if (typeof s.openCommentLibraryAfterSubmit !== 'undefined') {
        OPEN_COMMENT_LIBRARY_AFTER_SUBMIT = !!s.openCommentLibraryAfterSubmit;
      }

      // Update auto-fill full points setting
      if (typeof s.autoFillFullPoints !== 'undefined') {
        AUTO_FILL_FULL_POINTS = !!s.autoFillFullPoints;
      }

      // Update remember points for comments setting
      if (typeof s.rememberPointsForComments !== 'undefined') {
        REMEMBER_POINTS_FOR_COMMENTS = !!s.rememberPointsForComments;
      }

      // Update structured rubric settings
      if (typeof s.openCommentBoxAfterMaxPoints !== 'undefined') {
        OPEN_COMMENT_BOX_AFTER_MAX_POINTS = !!s.openCommentBoxAfterMaxPoints;
      }

      if (typeof s.openCommentBoxAfterLessThanMaxPoints !== 'undefined') {
        OPEN_COMMENT_BOX_AFTER_LESS_THAN_MAX_POINTS = !!s.openCommentBoxAfterLessThanMaxPoints;
      }

      if (typeof s.clearCommentBoxOnMaxPoints !== 'undefined') {
        CLEAR_COMMENT_BOX_ON_MAX_POINTS = !!s.clearCommentBoxOnMaxPoints;
      }

      // Update saved points map
      if (s.savedPoints && typeof s.savedPoints === 'object') {
        SAVED_POINTS = s.savedPoints;
      }

      // Update student name format
      if (s.studentNameFormat && typeof s.studentNameFormat === 'string') {
        STUDENT_NAME_FORMAT = s.studentNameFormat;
      }

      // Update student name map
      if (s.studentNames && typeof s.studentNames === 'object') {
        STUDENT_NAMES = s.studentNames;
      }

      // If a studentName mapping changed for the current student_id, try to replace old->new in-place.
      try {
        // Get current student_id from URL
        const params = new URLSearchParams(location.search || window.location.search);
        const sid = params.get('student_id');

        // If we have a change for this student_id, do in-place replacement
        if (sid && changes && changes[sid] && changes[sid].old !== changes[sid].new) {
          // Get old and new names
          const oldName = changes[sid].old || getCurrentStudentNameFromPage(); // Fallback to current name if old is empty
          const newName = changes[sid].new || getStudentName(); // Fallback to current name if new is empty
          if (!oldName || !newName) return;

          // Replace in all editors
          if (window.tinymce) {
            window.tinymce.editors.forEach((editor) => {
              try {
                const content = editor.getContent();
                if (!content) return;
                if (content.includes(oldName)) {
                  const updated = content.replaceAll(oldName, newName);
                  if (updated !== content) editor.setContent(updated);
                }
              } catch (e) {
                // log per-editor errors
                console.error('Error updating editor content for student name change:', e);
              }
            });
          }
        }
      } catch (e) {
        // log URL parsing / replacement errors
        console.error('Error parsing URL or replacing student names:', e);
      }

      // Attempt in-place application for placeholders.
      applySettingsToEditors();
      applySettingsToTextareas();
      attachCommentLibraryTextareaListeners();
    } catch (e) {
      // log overall message handling errors
      console.error('Error handling CSH_UPDATE_SETTINGS message:', e);
    }
  });

  // Start processes
  waitForTinyMCE();
  handleRubricFunctionality();
})();
