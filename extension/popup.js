document.addEventListener('DOMContentLoaded', async () => {
  // Initialize storage limits based on browser quota
  if (typeof window.CSHStorageUtils !== 'undefined' && typeof window.CSHStorageUtils.initializeLimits === 'function') {
    await window.CSHStorageUtils.initializeLimits();
  }

  const studentIdEl = document.getElementById('student-id');
  const nameInput = document.getElementById('student-name');
  const saveBtn = document.getElementById('save');
  const statusEl = document.getElementById('status');
  const noStudentEl = document.getElementById('no-student');
  const formEl = document.getElementById('form');
  const openSettingsBtn = document.getElementById('open-settings');

  // Helper to show status messages
  function showStatus(msg, timeout = 1500) {
    statusEl.textContent = msg;
    if (timeout) setTimeout(() => (statusEl.textContent = ''), timeout);
  }

  // Get the active tab URL and extract student_id
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.url) {
      noStudentEl.style.display = '';
      return;
    }
    let sid = null;
    try {
      const url = new URL(tab.url);
      const isSpeedGraderPage =
        url.hostname.endsWith('.instructure.com') &&
        /^\/courses\/[^/]+\/gradebook\/speed_grader/.test(url.pathname);

      if (!isSpeedGraderPage) {
        noStudentEl.style.display = '';
        return;
      }

      sid = url.searchParams.get('student_id');
    } catch (e) {
      // ignore
    }

    if (!sid) {
      noStudentEl.style.display = '';
      return;
    }

    studentIdEl.textContent = sid;
    formEl.style.display = '';

    // Load existing mapping from local storage
    chrome.storage.local.get({ studentNames: {} }, (data) => {
      const mapping = data && data.studentNames ? data.studentNames : {};
      nameInput.value = mapping[sid] || '';

      // Focus the input for convenience
      nameInput.focus();
    });

    // Save function reused by button click and Enter key
    function saveMapping() {
      const val = nameInput.value.trim();
      chrome.storage.local.get({ studentNames: {} }, (data) => {
        const mapping = data && data.studentNames ? data.studentNames : {};
        if (val) {
          mapping[sid] = val;
        } else {
          // Remove mapping if input cleared
          delete mapping[sid];
        }
        window.CSHStorageUtils.saveStudentNamesWithPrune(mapping, () => {
          showStatus('Saved');
        });
      });
    }

    saveBtn.addEventListener('click', saveMapping);

    // Pressing Enter in the input should save (like clicking Save)
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        saveMapping();
      }
    });
  });

  function openOptionsPage() {
    try {
      if (chrome && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
        return;
      }
      if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.openOptionsPage) {
        browser.runtime.openOptionsPage();
        return;
      }
      const url = (chrome && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('options.html') : 'options.html';
      if (chrome && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    } catch (e) {
      const url = (chrome && chrome.runtime && chrome.runtime.getURL) ? chrome.runtime.getURL('options.html') : 'options.html';
      window.open(url, '_blank');
    }
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', openOptionsPage);
  }
});
