import { SYNCED_SETTINGS } from '../../shared/settings.js';
import { saveStudentNamesWithPrune, initializeLimits } from '../../shared/storage-utils.js';

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

function loadPlaceholders() {
  chrome.storage.sync.get(SYNCED_SETTINGS, (data) => {
    const list = document.getElementById('placeholders-list');
    list.innerHTML = '';
    const items = (data && data.placeholders && data.placeholders.length) ? data.placeholders : SYNCED_SETTINGS.placeholders;
    items.forEach(p => list.appendChild(createItem(p)));

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

    const format = data && data.studentNameFormat ? data.studentNameFormat : SYNCED_SETTINGS.studentNameFormat;
    const formatRadio = document.querySelector(`input[name="student-name-format"][value="${format}"]`);
    if (formatRadio) formatRadio.checked = true;
  });
}

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

function getStudentsFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get({ studentNames: {} }, (data) => {
      resolve(data && data.studentNames ? data.studentNames : {});
    });
  });
}

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

function normalizeHeader(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

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

function toCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function exportStudentsToCsv(students) {
  const lines = ['student_id,preferred_name'];
  Object.keys(students).forEach(id => {
    lines.push(`${toCsvValue(id)},${toCsvValue(students[id])}`);
  });
  return lines.join('\n');
}

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

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initializeLimits === 'function') {
    await initializeLimits();
  }

  loadPlaceholders();
  loadStudents();

  document.getElementById('add-placeholder').addEventListener('click', () => {
    document.getElementById('placeholders-list').appendChild(createItem(''));
  });

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

  document.getElementById('save').addEventListener('click', () => {
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
        const status = document.getElementById('status');
        status.textContent = 'Saved';
        setTimeout(() => (status.textContent = ''), 1500);
      });
    });
  });

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
