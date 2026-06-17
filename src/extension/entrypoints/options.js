import { SYNCED_SETTINGS, LOCAL_SETTINGS } from '@/shared/settings.js';
import { saveStudentNamesWithPrune, initializeLimits } from '@/shared/storage-utils.js';

/** Creates a single placeholder list item with an input and remove button. */
function createItem(value = '') {
  const container = document.createElement('div');
  container.className = 'placeholder-item';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'placeholder-input';
  input.value = value;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-btn';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => container.remove());

  container.appendChild(input);
  container.appendChild(remove);
  return container;
}

/** Reads synced settings and populates all form controls. */
function loadPlaceholders() {
  chrome.storage.sync.get(SYNCED_SETTINGS, (data) => {
    // Populate placeholder inputs
    const list = document.getElementById('placeholders-list');
    list.innerHTML = '';
    const items = (data && data.placeholders && data.placeholders.length) ? data.placeholders : SYNCED_SETTINGS.placeholders;
    items.forEach(p => list.appendChild(createItem(p)));

    // Map each checkbox from storage to its DOM element
    const cb = document.getElementById('open-rubric');
    if (cb) cb.checked = !!data.openRubricForUngraded;

    const commentLibCb = document.getElementById('open-comment-library');
    if (commentLibCb) commentLibCb.checked = !!data.openCommentLibraryAfterSubmit;

    const closeSpeedgraderAfterSubmitCommentCb = document.getElementById('close-speedgrader-tab-after-submit-comment');
    if (closeSpeedgraderAfterSubmitCommentCb) closeSpeedgraderAfterSubmitCommentCb.checked = !!data.closeSpeedgraderTabAfterSubmitComment;

    const autoCompleteQueueItemAfterCommentSubmitCb = document.getElementById('auto-complete-queue-item-after-comment-submit');
    if (autoCompleteQueueItemAfterCommentSubmitCb) autoCompleteQueueItemAfterCommentSubmitCb.checked = !!data.autoCompleteQueueItemAfterCommentSubmit;

    const autoSetCommentsToWholeGroupCb = document.getElementById('auto-set-comments-to-whole-group-when-available');
    if (autoSetCommentsToWholeGroupCb) autoSetCommentsToWholeGroupCb.checked = !!data.autoSetCommentsToWholeGroupWhenAvailable;

    const scrollToSubmitCommentCb = document.getElementById('scroll-to-submit-comment-after-comment-library-selection');
    if (scrollToSubmitCommentCb) scrollToSubmitCommentCb.checked = !!data.scrollToSubmitCommentAfterCommentLibrarySelection;

    const useTeamNameCb = document.getElementById('use-team-name-for-group-placeholder-replacement');
    if (useTeamNameCb) useTeamNameCb.checked = !!data.useTeamNameForGroupPlaceholderReplacement;

    const autoFillCb = document.getElementById('auto-fill-full-points');
    if (autoFillCb) autoFillCb.checked = !!data.autoFillFullPoints;

    const rememberPointsCb = document.getElementById('remember-points-for-comments');
    if (rememberPointsCb) rememberPointsCb.checked = !!data.rememberPointsForComments;

    const openCommentBoxMaxPointsCb = document.getElementById('open-comment-box-after-max-points');
    if (openCommentBoxMaxPointsCb) openCommentBoxMaxPointsCb.checked = !!data.openCommentBoxAfterMaxPoints;

    const openCommentBoxLessThanMaxPointsCb = document.getElementById('open-comment-box-after-less-than-max-points');
    if (openCommentBoxLessThanMaxPointsCb) openCommentBoxLessThanMaxPointsCb.checked = !!data.openCommentBoxAfterLessThanMaxPoints;

    const rubricAutoScrollToNextCriterionCb = document.getElementById('rubric-auto-scroll-to-next-criterion');
    if (rubricAutoScrollToNextCriterionCb) rubricAutoScrollToNextCriterionCb.checked = !!data.rubricAutoScrollToNextCriterion;

    const rubricAutoScrollToFirstCriterionAfterOpeningCb = document.getElementById('rubric-auto-scroll-to-first-criterion-after-opening');
    if (rubricAutoScrollToFirstCriterionAfterOpeningCb) rubricAutoScrollToFirstCriterionAfterOpeningCb.checked = !!data.rubricAutoScrollToFirstCriterionAfterOpening;

    const clearCommentBoxOnMaxPointsCb = document.getElementById('clear-comment-box-on-max-points');
    if (clearCommentBoxOnMaxPointsCb) clearCommentBoxOnMaxPointsCb.checked = !!data.clearCommentBoxOnMaxPoints;

    const notifyMismatchCb = document.getElementById('notify-student-name-mismatch');
    if (notifyMismatchCb) notifyMismatchCb.checked = data.notifyOnStudentNameMismatch !== false;

    const autoGroupCheckCb = document.getElementById('auto-group-check-on-name-mismatch');
    if (autoGroupCheckCb) autoGroupCheckCb.checked = !!data.autoGroupCheckOnNameMismatch;

    const enableNameSanityCheckCb = document.getElementById('enable-name-sanity-check');
    if (enableNameSanityCheckCb) enableNameSanityCheckCb.checked = data.enableNameSanityCheck !== false;

    const autoSelectAlreadyGradedCb = document.getElementById('auto-select-already-graded-when-group-matched');
    if (autoSelectAlreadyGradedCb) autoSelectAlreadyGradedCb.checked = !!data.autoSelectAlreadyGradedWhenGroupMatched;

    const autoCloseSpeedgraderTabWhenGroupMatchedAndUngradedCb = document.getElementById('auto-close-speedgrader-tab-when-group-matched-and-ungraded');
    if (autoCloseSpeedgraderTabWhenGroupMatchedAndUngradedCb) autoCloseSpeedgraderTabWhenGroupMatchedAndUngradedCb.checked = !!data.autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded;

    const autoOpenNextQueueItemAfterCompleteCb = document.getElementById('auto-open-next-queue-item-after-complete');
    if (autoOpenNextQueueItemAfterCompleteCb) autoOpenNextQueueItemAfterCompleteCb.checked = !!data.autoOpenNextQueueItemAfterComplete;

    const autoClickLoadQueueWhenEmptyCb = document.getElementById('auto-click-load-queue-when-empty');
    if (autoClickLoadQueueWhenEmptyCb) autoClickLoadQueueWhenEmptyCb.checked = !!data.autoClickLoadQueueWhenEmpty;

    const autoClickLoadQueueEveryHourWhenLessThanTenItemsCb = document.getElementById('auto-click-load-queue-every-hour-when-less-than-ten-items');
    if (autoClickLoadQueueEveryHourWhenLessThanTenItemsCb) autoClickLoadQueueEveryHourWhenLessThanTenItemsCb.checked = !!data.autoClickLoadQueueEveryHourWhenLessThanTenItems;

    // Populate name format radio
    const format = data && data.studentNameFormat ? data.studentNameFormat : SYNCED_SETTINGS.studentNameFormat;
    const formatRadio = document.querySelector(`input[name="student-name-format"][value="${format}"]`);
    if (formatRadio) formatRadio.checked = true;
  });
}

/** Strips trailing slashes and appends /api/tags. */
function buildTagsUrl(endpoint) {
  return endpoint.replace(/\/+$/, '') + '/api/tags';
}

/** Populates the model <select> from the Ollama /api/tags endpoint. */
async function fetchModels(endpointUrl) {
  const select = document.getElementById('ai-model');
  const trimmed = (endpointUrl || '').trim();
  if (!trimmed) {
    select.innerHTML = '<option value="">Enter an endpoint URL and click Refresh models</option>';
    select.disabled = true;
    updateAiCheckboxState();
    return;
  }

  select.disabled = true;
  select.innerHTML = '<option value="">Loading models...</option>';

  try {
    const url = buildTagsUrl(trimmed);
    const response = await fetch(url);
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status} ${response.statusText}${text ? ' \u2014 ' + text.slice(0, 200) : ''}`);
    }
    const data = await response.json();
    const models = (data.models || []).map(m => m.name);

    if (models.length === 0) {
      select.innerHTML = '<option value="" disabled selected>No models available at this endpoint</option>';
      select.disabled = true;
      updateAiCheckboxState();
      return;
    }

    const savedValue = select.dataset.savedValue || '';
    select.innerHTML = '<option value="">\u2014 Select a model \u2014</option>' +
      models.map(m => `<option value="${m.replace(/"/g, '&quot;')}">${m.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</option>`).join('');
    select.disabled = false;

    if (savedValue && models.includes(savedValue)) {
      select.value = savedValue;
    }

    updateAiCheckboxState();
  } catch (err) {
    select.innerHTML = `<option value="" disabled selected>Error: ${err.message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</option>`;
    select.disabled = true;
    updateAiCheckboxState();
  }
}

/** Enables/disables the AI checkbox based on endpoint + model state. */
function updateAiCheckboxState() {
  const endpoint = (document.getElementById('ai-endpoint-url')?.value || '').trim();
  const model = document.getElementById('ai-model')?.value || '';
  const checkbox = document.getElementById('enable-ai');

  const valid = endpoint.length > 0 && model.length > 0;
  if (!valid) {
    checkbox.checked = false;
    checkbox.disabled = true;
  } else {
    checkbox.disabled = false;
  }
}

/** Validates endpoint + model by calling /api/tags and checking the model is in the list. */
async function validateAiSettings(endpoint, model) {
  const url = buildTagsUrl(endpoint);
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    return { valid: false, error: `Failed to connect to ${endpoint}: ${err.message}` };
  }
  if (!response.ok) {
    let text = '';
    try { text = await response.text(); } catch {}
    return { valid: false, error: `Failed to fetch models from ${endpoint}: ${response.status} ${response.statusText}${text ? ' \u2014 ' + text.slice(0, 200) : ''}` };
  }
  let data;
  try {
    data = await response.json();
  } catch (err) {
    return { valid: false, error: `Invalid response from ${endpoint}: ${err.message}` };
  }
  const models = (data.models || []).map(m => m.name);
  if (!models.includes(model)) {
    return { valid: false, error: `Model "${model}" not found at ${endpoint}. Available models: ${models.join(', ') || 'none'}` };
  }
  return { valid: true };
}

/** Reads local-only AI settings and populates the AI form controls. */
function loadLocalSettings() {
  chrome.storage.local.get(LOCAL_SETTINGS, (data) => {
    const enableAiCb = document.getElementById('enable-ai');
    if (enableAiCb) enableAiCb.checked = !!data.aiEnabled;

    const endpointInput = document.getElementById('ai-endpoint-url');
    if (endpointInput) endpointInput.value = data.aiEndpointUrl || '';

    const modelSelect = document.getElementById('ai-model');
    if (modelSelect) {
      modelSelect.dataset.savedValue = data.aiModel || '';
    }

    const keepAliveInput = document.getElementById('ai-keep-alive');
    if (keepAliveInput) keepAliveInput.value = data.aiKeepAlive;

    fetchModels((document.getElementById('ai-endpoint-url')?.value || '').trim());
  });
}

/** Creates a student item row with read-only ID and editable name. */
function createStudentItem(id = '', name = '') {
  const container = document.createElement('div');
  container.className = 'student-item';

  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.className = 'student-id';
  idInput.value = id;
  idInput.disabled = true;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'student-name';
  nameInput.value = name;

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-btn';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    container.remove();
    saveStudentsFromDOM(loadStudents);
  });

  container.appendChild(idInput);
  container.appendChild(nameInput);
  container.appendChild(remove);
  return container;
}

/** Reads student name rows from the DOM and persists with LRU pruning. */
function saveStudentsFromDOM(callback) {
  const rows = Array.from(document.querySelectorAll('.student-item'));
  const students = {};
  rows.forEach(r => {
    const id = r.querySelector('.student-id').value;
    const name = (r.querySelector('.student-name').value || '').trim();
    if (id) students[id] = name;
  });
  saveStudentNamesWithPrune(students, callback);
}

/** Loads student names from local storage and renders the list. */
function loadStudents() {
  chrome.storage.local.get({ studentNames: {} }, (data) => {
    const list = document.getElementById('students-list');
    const noNamesEl = document.getElementById('no-student-names');
    noNamesEl.style.display = Object.keys(data.studentNames || {}).length === 0 ? '' : 'none';
    if (!list) return;
    list.innerHTML = '';
    const students = data && data.studentNames ? data.studentNames : {};
    Object.keys(students).forEach(id => list.appendChild(createStudentItem(id, students[id])));
  });
}

/** Returns a promise resolving to the stored student names map. */
function getStudentsFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get({ studentNames: {} }, (data) => {
      resolve(data && data.studentNames ? data.studentNames : {});
    });
  });
}

/** Parses CSV text into a 2D array of strings, handling quoted fields. */
function parseCsv(text) {
  const rows = [];
  let current = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      current.push(field);
      field = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      current.push(field);
      if (current.length > 1 || current[0] !== '') {
        rows.push(current);
      }
      current = [];
      field = '';
      continue;
    }
    field += char;
  }
  current.push(field);
  if (current.length > 1 || current[0] !== '') {
    rows.push(current);
  }
  return rows;
}

/** Lowercases and strips whitespace/punctuation from a CSV header value. */
function normalizeHeader(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

/** Parses student CSV into an array of { id, name } objects, detecting headers. */
function parseStudentsFromCsv(text) {
  const rows = parseCsv(text).map(row => row.map(cell => (cell || '').trim()));
  if (!rows.length) return [];

  let startIndex = 0;
  let idIndex = 0;
  let nameIndex = 1;
  const header = rows[0].map(normalizeHeader);
  const headerHasId = header.includes('student_id') || header.includes('studentid') || header.includes('id');
  const headerHasName = header.includes('preferred_name') || header.includes('preferredname') || header.includes('name');
  if (headerHasId || headerHasName) {
    startIndex = 1;
    if (header.includes('student_id')) idIndex = header.indexOf('student_id');
    else if (header.includes('studentid')) idIndex = header.indexOf('studentid');
    else if (header.includes('id')) idIndex = header.indexOf('id');

    if (header.includes('preferred_name')) nameIndex = header.indexOf('preferred_name');
    else if (header.includes('preferredname')) nameIndex = header.indexOf('preferredname');
    else if (header.includes('name')) nameIndex = header.indexOf('name');
  }

  const students = [];
  for (let i = startIndex; i < rows.length; i += 1) {
    const row = rows[i];
    const id = (row[idIndex] || '').trim();
    const name = (row[nameIndex] || '').trim();
    if (!id) continue;
    students.push({ id, name });
  }
  return students;
}

/** Escapes a value for CSV output, wrapping in quotes if needed. */
function toCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Converts the student names map to CSV format. */
function exportStudentsToCsv(students) {
  const lines = ['student_id,preferred_name'];
  Object.keys(students).forEach(id => {
    lines.push(`${toCsvValue(id)},${toCsvValue(students[id])}`);
  });
  return lines.join('\n');
}

/** Triggers a file download from a string. */
function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Displays the import results summary and conflict list. */
function setImportResults(summary, conflicts) {
  const container = document.getElementById('import-results');
  const summaryEl = document.getElementById('import-summary');
  const listEl = document.getElementById('import-conflicts');
  if (!summaryEl || !listEl || !container) return;
  summaryEl.textContent = summary;
  listEl.innerHTML = '';
  if (conflicts.length) {
    conflicts.forEach(conflict => {
      const item = document.createElement('li');
      item.textContent = conflict;
      listEl.appendChild(item);
    });
  }
  container.classList.toggle('hidden', !summary);
}

/** Initialise the options page: load settings, wire event listeners. */
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initializeLimits === 'function') {
    await initializeLimits();
  }

  // Load existing settings and student names
  loadPlaceholders();
  loadLocalSettings();
  loadStudents();

  // Add placeholder button
  document.getElementById('add-placeholder').addEventListener('click', () => {
    document.getElementById('placeholders-list').appendChild(createItem(''));
  });

  // Mutually exclusive checkboxes: open comment on max vs clear comment on max
  const openCommentBoxMaxCheckbox = document.getElementById('open-comment-box-after-max-points');
  const clearCommentBoxCheckbox = document.getElementById('clear-comment-box-on-max-points');

  if (openCommentBoxMaxCheckbox && clearCommentBoxCheckbox) {
    openCommentBoxMaxCheckbox.addEventListener('change', () => {
      if (openCommentBoxMaxCheckbox.checked) {
        clearCommentBoxCheckbox.checked = false;
      }
    });

    clearCommentBoxCheckbox.addEventListener('change', () => {
      if (clearCommentBoxCheckbox.checked) {
        openCommentBoxMaxCheckbox.checked = false;
      }
    });
  }

  // Wire up AI settings reactivity
  const endpointInput = document.getElementById('ai-endpoint-url');
  const modelSelect = document.getElementById('ai-model');
  const refreshBtn = document.getElementById('refresh-models');

  if (endpointInput) {
    endpointInput.addEventListener('input', updateAiCheckboxState);
  }
  if (modelSelect) {
    modelSelect.addEventListener('change', updateAiCheckboxState);
  }
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchModels((document.getElementById('ai-endpoint-url')?.value || '').trim());
    });
  }

  // Save all settings to chrome.storage
  document.getElementById('save').addEventListener('click', async () => {
    // Validate AI settings before saving
    const aiEnabled = !!document.getElementById('enable-ai') && document.getElementById('enable-ai').checked;
    const aiEndpointUrl = (document.getElementById('ai-endpoint-url')?.value || '').trim();
    const aiModel = (document.getElementById('ai-model')?.value || '').trim();

    const statusEl = document.getElementById('status');
    if (aiEndpointUrl && aiModel) {
      const result = await validateAiSettings(aiEndpointUrl, aiModel);
      if (!result.valid) {
        statusEl.textContent = result.error;
        statusEl.style.color = '#a23';
        setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, 5000);
        return;
      }
    } else if ((aiEndpointUrl && !aiModel) || (!aiEndpointUrl && aiModel)) {
      statusEl.textContent = 'Both Endpoint URL and Model must be configured together, or both left blank.';
      statusEl.style.color = '#a23';
      setTimeout(() => { statusEl.textContent = ''; statusEl.style.color = ''; }, 5000);
      return;
    }

    const inputs = Array.from(document.querySelectorAll('.placeholder-input')).map(i => i.value.trim()).filter(Boolean);
    const toSave = inputs.length ? inputs : SYNCED_SETTINGS.placeholders;
    const openRubric = !!document.getElementById('open-rubric') && document.getElementById('open-rubric').checked;
    const openCommentLibrary = !!document.getElementById('open-comment-library') && document.getElementById('open-comment-library').checked;
    const closeSpeedgraderTabAfterSubmitComment = !!document.getElementById('close-speedgrader-tab-after-submit-comment') && document.getElementById('close-speedgrader-tab-after-submit-comment').checked;
    const autoCompleteQueueItemAfterCommentSubmit = !!document.getElementById('auto-complete-queue-item-after-comment-submit') && document.getElementById('auto-complete-queue-item-after-comment-submit').checked;
    const autoSetCommentsToWholeGroupWhenAvailable = !!document.getElementById('auto-set-comments-to-whole-group-when-available') && document.getElementById('auto-set-comments-to-whole-group-when-available').checked;
    const scrollToSubmitCommentAfterCommentLibrarySelection = !!document.getElementById('scroll-to-submit-comment-after-comment-library-selection') && document.getElementById('scroll-to-submit-comment-after-comment-library-selection').checked;
    const useTeamNameForGroupPlaceholderReplacement = !!document.getElementById('use-team-name-for-group-placeholder-replacement') && document.getElementById('use-team-name-for-group-placeholder-replacement').checked;
    const autoFillFullPoints = !!document.getElementById('auto-fill-full-points') && document.getElementById('auto-fill-full-points').checked;
    const rememberPointsForComments = !!document.getElementById('remember-points-for-comments') && document.getElementById('remember-points-for-comments').checked;
    const openCommentBoxAfterMaxPoints = !!document.getElementById('open-comment-box-after-max-points') && document.getElementById('open-comment-box-after-max-points').checked;
    const openCommentBoxAfterLessThanMaxPoints = !!document.getElementById('open-comment-box-after-less-than-max-points') && document.getElementById('open-comment-box-after-less-than-max-points').checked;
    const rubricAutoScrollToNextCriterion = !!document.getElementById('rubric-auto-scroll-to-next-criterion') && document.getElementById('rubric-auto-scroll-to-next-criterion').checked;
    const rubricAutoScrollToFirstCriterionAfterOpening = !!document.getElementById('rubric-auto-scroll-to-first-criterion-after-opening') && document.getElementById('rubric-auto-scroll-to-first-criterion-after-opening').checked;
    const clearCommentBoxOnMaxPoints = !!document.getElementById('clear-comment-box-on-max-points') && document.getElementById('clear-comment-box-on-max-points').checked;
    const notifyOnStudentNameMismatch = !!document.getElementById('notify-student-name-mismatch') && document.getElementById('notify-student-name-mismatch').checked;
    const autoGroupCheckOnNameMismatch = !!document.getElementById('auto-group-check-on-name-mismatch') && document.getElementById('auto-group-check-on-name-mismatch').checked;
    const enableNameSanityCheck = !!document.getElementById('enable-name-sanity-check') && document.getElementById('enable-name-sanity-check').checked;
    const autoSelectAlreadyGradedWhenGroupMatched = !!document.getElementById('auto-select-already-graded-when-group-matched') && document.getElementById('auto-select-already-graded-when-group-matched').checked;
    const autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded = !!document.getElementById('auto-close-speedgrader-tab-when-group-matched-and-ungraded') && document.getElementById('auto-close-speedgrader-tab-when-group-matched-and-ungraded').checked;
    const autoOpenNextQueueItemAfterComplete = !!document.getElementById('auto-open-next-queue-item-after-complete') && document.getElementById('auto-open-next-queue-item-after-complete').checked;
    const autoClickLoadQueueWhenEmpty = !!document.getElementById('auto-click-load-queue-when-empty') && document.getElementById('auto-click-load-queue-when-empty').checked;
    const autoClickLoadQueueEveryHourWhenLessThanTenItems = !!document.getElementById('auto-click-load-queue-every-hour-when-less-than-ten-items') && document.getElementById('auto-click-load-queue-every-hour-when-less-than-ten-items').checked;
    const studentNameFormat = document.querySelector('input[name="student-name-format"]:checked')?.value || SYNCED_SETTINGS.studentNameFormat;

    const aiKeepAlive = Math.min(360, Math.max(5, parseInt(document.getElementById('ai-keep-alive')?.value, 10) || LOCAL_SETTINGS.aiKeepAlive));

    // Save students first, then synced settings, then local settings
    saveStudentsFromDOM(() => {
      chrome.storage.sync.set({
        placeholders: toSave,
        openRubricForUngraded: openRubric,
        openCommentLibraryAfterSubmit: openCommentLibrary,
        closeSpeedgraderTabAfterSubmitComment: closeSpeedgraderTabAfterSubmitComment,
        autoCompleteQueueItemAfterCommentSubmit: autoCompleteQueueItemAfterCommentSubmit,
        autoSetCommentsToWholeGroupWhenAvailable: autoSetCommentsToWholeGroupWhenAvailable,
        scrollToSubmitCommentAfterCommentLibrarySelection: scrollToSubmitCommentAfterCommentLibrarySelection,
        useTeamNameForGroupPlaceholderReplacement: useTeamNameForGroupPlaceholderReplacement,
        autoFillFullPoints: autoFillFullPoints,
        rememberPointsForComments: rememberPointsForComments,
        openCommentBoxAfterMaxPoints: openCommentBoxAfterMaxPoints,
        openCommentBoxAfterLessThanMaxPoints: openCommentBoxAfterLessThanMaxPoints,
        rubricAutoScrollToNextCriterion: rubricAutoScrollToNextCriterion,
        rubricAutoScrollToFirstCriterionAfterOpening: rubricAutoScrollToFirstCriterionAfterOpening,
        clearCommentBoxOnMaxPoints: clearCommentBoxOnMaxPoints,
        notifyOnStudentNameMismatch: notifyOnStudentNameMismatch,
        autoGroupCheckOnNameMismatch: autoGroupCheckOnNameMismatch,
        enableNameSanityCheck: enableNameSanityCheck,
        autoSelectAlreadyGradedWhenGroupMatched: autoSelectAlreadyGradedWhenGroupMatched,
        autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded: autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded,
        autoOpenNextQueueItemAfterComplete: autoOpenNextQueueItemAfterComplete,
        autoClickLoadQueueWhenEmpty: autoClickLoadQueueWhenEmpty,
        autoClickLoadQueueEveryHourWhenLessThanTenItems: autoClickLoadQueueEveryHourWhenLessThanTenItems,
        studentNameFormat: studentNameFormat
      }, () => {
        // Save local AI settings after synced settings complete
        chrome.storage.local.set({
          aiEnabled,
          aiEndpointUrl,
          aiModel,
          aiKeepAlive,
        }, () => {
          statusEl.textContent = 'Saved';
          statusEl.style.color = '';
          setTimeout(() => (statusEl.textContent = ''), 1500);
        });
      });
    });
  });

  // Export/import student names
  const exportBtn = document.getElementById('export-students');
  const importBtn = document.getElementById('import-students');
  const importFile = document.getElementById('import-students-file');

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      const students = await getStudentsFromStorage();
      const csv = exportStudentsToCsv(students);
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`student-preferred-names-${timestamp}.csv`, csv);
    });
  }

  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());

    importFile.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const text = await file.text();
      const incoming = parseStudentsFromCsv(text);
      const existing = await getStudentsFromStorage();

      // Merge: skip conflicts where existing names differ, add new entries
      const merged = { ...existing };
      const conflicts = [];
      let addedCount = 0;
      let skippedCount = 0;
      let sameCount = 0;

      incoming.forEach(({ id, name }) => {
        const incomingName = (name || '').trim();

        if (Object.prototype.hasOwnProperty.call(existing, id)) {
          const currentName = (existing[id] || '').trim();

          if (currentName === incomingName) {
            sameCount += 1;
          } else {
            conflicts.push(`Student ID ${id}: existing name "${currentName}" differs from imported name "${incomingName}".`);
            skippedCount += 1;
          }
        } else {
          merged[id] = incomingName;
          addedCount += 1;
        }
      });

      saveStudentNamesWithPrune(merged, () => {
        loadStudents();
        const summary = `Import complete. Added ${addedCount} entr${addedCount === 1 ? 'y' : 'ies'}. ${sameCount} matched existing. ${skippedCount} conflict${skippedCount === 1 ? '' : 's'} skipped.`;
        setImportResults(summary, conflicts);
      });

      importFile.value = '';
    });
  }
});
