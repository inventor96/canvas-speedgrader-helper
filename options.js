// Create a placeholder item element
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

// Load placeholders and settings from storage and populate the form
function loadPlaceholders() {
  chrome.storage.sync.get(SYNCED_SETTINGS, (data) => {
    const list = document.getElementById('placeholders-list');
    list.innerHTML = '';
    const items = (data && data.placeholders && data.placeholders.length) ? data.placeholders : SYNCED_SETTINGS.placeholders;
    items.forEach(p => list.appendChild(createItem(p)));

    // Load synced settings
    const cb = document.getElementById('open-rubric');
    if (cb) cb.checked = !!data.openRubricForUngraded;

    const commentLibCb = document.getElementById('open-comment-library');
    if (commentLibCb) commentLibCb.checked = !!data.openCommentLibraryAfterSubmit;

    const autoFillCb = document.getElementById('auto-fill-full-points');
    if (autoFillCb) autoFillCb.checked = !!data.autoFillFullPoints;

    const rememberPointsCb = document.getElementById('remember-points-for-comments');
    if (rememberPointsCb) rememberPointsCb.checked = !!data.rememberPointsForComments;

    const openCommentBoxMaxPointsCb = document.getElementById('open-comment-box-after-max-points');
    if (openCommentBoxMaxPointsCb) openCommentBoxMaxPointsCb.checked = !!data.openCommentBoxAfterMaxPoints;

    const openCommentBoxLessThanMaxPointsCb = document.getElementById('open-comment-box-after-less-than-max-points');
    if (openCommentBoxLessThanMaxPointsCb) openCommentBoxLessThanMaxPointsCb.checked = !!data.openCommentBoxAfterLessThanMaxPoints;

    const clearCommentBoxOnMaxPointsCb = document.getElementById('clear-comment-box-on-max-points');
    if (clearCommentBoxOnMaxPointsCb) clearCommentBoxOnMaxPointsCb.checked = !!data.clearCommentBoxOnMaxPoints;

    const notifyMismatchCb = document.getElementById('notify-student-name-mismatch');
    if (notifyMismatchCb) notifyMismatchCb.checked = data.notifyOnStudentNameMismatch !== false;

    const format = data && data.studentNameFormat ? data.studentNameFormat : SYNCED_SETTINGS.studentNameFormat;
    const formatRadio = document.querySelector(`input[name="student-name-format"][value="${format}"]`);
    if (formatRadio) formatRadio.checked = true;
  });
}

// Create a student item element for the student list
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

// Save student mappings from the DOM to local storage
function saveStudentsFromDOM(callback) {
  const rows = Array.from(document.querySelectorAll('.student-item'));
  const students = {};
  rows.forEach(r => {
    const id = r.querySelector('.student-id').value;
    const name = (r.querySelector('.student-name').value || '').trim();
    if (id) students[id] = name;
  });
  window.CSHStorageUtils.saveStudentNamesWithPrune(students, callback);
}

// Load student mappings from local storage and populate the student list
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

// Helper to get student mappings from local storage
function getStudentsFromStorage() {
  return new Promise(resolve => {
    chrome.storage.local.get({ studentNames: {} }, (data) => {
      resolve(data && data.studentNames ? data.studentNames : {});
    });
  });
}

// CSV Parsing and Exporting Helpers
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

// Normalize CSV header values for easier matching
function normalizeHeader(value) {
  return (value || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
}

// Parse students from CSV text into an array of {id, name} objects
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

// Convert a value to a CSV-safe string
function toCsvValue(value) {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

// Export student mappings to CSV format
function exportStudentsToCsv(students) {
  const lines = ['student_id,preferred_name'];
  Object.keys(students).forEach(id => {
    lines.push(`${toCsvValue(id)},${toCsvValue(students[id])}`);
  });
  return lines.join('\n');
}

// Trigger download of a CSV file with given filename and content
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

// Display import results summary and conflicts
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

// Initialize the options page
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize storage limits based on browser quota
  if (typeof window.CSHStorageUtils !== 'undefined' && typeof window.CSHStorageUtils.initializeLimits === 'function') {
    await window.CSHStorageUtils.initializeLimits();
  }

  loadPlaceholders();
  loadStudents();

  // Add new placeholder item
  document.getElementById('add-placeholder').addEventListener('click', () => {
    document.getElementById('placeholders-list').appendChild(createItem(''));
  });

  // Make open-comment-box-after-max-points and clear-comment-box-on-max-points mutually exclusive
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

  // Save settings and student mappings
  document.getElementById('save').addEventListener('click', () => {
    const inputs = Array.from(document.querySelectorAll('.placeholder-input')).map(i => i.value.trim()).filter(Boolean);
    const toSave = inputs.length ? inputs : SYNCED_SETTINGS.placeholders;
    const openRubric = !!document.getElementById('open-rubric') && document.getElementById('open-rubric').checked;
    const openCommentLibrary = !!document.getElementById('open-comment-library') && document.getElementById('open-comment-library').checked;
    const autoFillFullPoints = !!document.getElementById('auto-fill-full-points') && document.getElementById('auto-fill-full-points').checked;
    const rememberPointsForComments = !!document.getElementById('remember-points-for-comments') && document.getElementById('remember-points-for-comments').checked;
    const openCommentBoxAfterMaxPoints = !!document.getElementById('open-comment-box-after-max-points') && document.getElementById('open-comment-box-after-max-points').checked;
    const openCommentBoxAfterLessThanMaxPoints = !!document.getElementById('open-comment-box-after-less-than-max-points') && document.getElementById('open-comment-box-after-less-than-max-points').checked;
    const clearCommentBoxOnMaxPoints = !!document.getElementById('clear-comment-box-on-max-points') && document.getElementById('clear-comment-box-on-max-points').checked;
    const notifyOnStudentNameMismatch = !!document.getElementById('notify-student-name-mismatch') && document.getElementById('notify-student-name-mismatch').checked;
    const studentNameFormat = document.querySelector('input[name="student-name-format"]:checked')?.value || SYNCED_SETTINGS.studentNameFormat;

    saveStudentsFromDOM(() => {
      // After local save, save synced settings
      chrome.storage.sync.set({
        placeholders: toSave,
        openRubricForUngraded: openRubric,
        openCommentLibraryAfterSubmit: openCommentLibrary,
        autoFillFullPoints: autoFillFullPoints,
        rememberPointsForComments: rememberPointsForComments,
        openCommentBoxAfterMaxPoints: openCommentBoxAfterMaxPoints,
        openCommentBoxAfterLessThanMaxPoints: openCommentBoxAfterLessThanMaxPoints,
        clearCommentBoxOnMaxPoints: clearCommentBoxOnMaxPoints,
        notifyOnStudentNameMismatch: notifyOnStudentNameMismatch,
        studentNameFormat: studentNameFormat
      }, () => {
        // Show saved status
        const status = document.getElementById('status');
        status.textContent = 'Saved';
        setTimeout(() => (status.textContent = ''), 1500);
      });
    });
  });

  // Export and Import elements
  const exportBtn = document.getElementById('export-students');
  const importBtn = document.getElementById('import-students');
  const importFile = document.getElementById('import-students-file');

  if (exportBtn) {
    // Export student mappings to CSV
    exportBtn.addEventListener('click', async () => {
      const students = await getStudentsFromStorage();
      const csv = exportStudentsToCsv(students);
      const timestamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`student-preferred-names-${timestamp}.csv`, csv);
    });
  }

  if (importBtn && importFile) {
    // Trigger file input click on import button click
    importBtn.addEventListener('click', () => importFile.click());

    // Handle CSV file selection and import student mappings
    importFile.addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      // Get imported and existing students
      const text = await file.text();
      const incoming = parseStudentsFromCsv(text);
      const existing = await getStudentsFromStorage();

      // Import state
      const merged = { ...existing };
      const conflicts = [];
      let addedCount = 0;
      let skippedCount = 0;
      let sameCount = 0;

      // Loop through incoming students
      incoming.forEach(({ id, name }) => {
        const incomingName = (name || '').trim();

        // Check for conflicts
        if (Object.prototype.hasOwnProperty.call(existing, id)) {
          const currentName = (existing[id] || '').trim();

          if (currentName === incomingName) {
            // Same name, count as same
            sameCount += 1;
          } else {
            // Conflict detected
            conflicts.push(`Student ID ${id}: existing name "${currentName}" differs from imported name "${incomingName}".`);
            skippedCount += 1;
          }
        } else {
          // New entry, add it
          merged[id] = incomingName;
          addedCount += 1;
        }
      });

      // Save merged results back to storage
      window.CSHStorageUtils.saveStudentNamesWithPrune(merged, () => {
        // Reload students after import
        loadStudents();

        // Show import results
        const summary = `Import complete. Added ${addedCount} entr${addedCount === 1 ? 'y' : 'ies'}. ${sameCount} matched existing. ${skippedCount} conflict${skippedCount === 1 ? '' : 's'} skipped.`;
        setImportResults(summary, conflicts);
      });

      // Clear the file input value to allow re-importing the same file if needed
      importFile.value = '';
    });
  }
});
