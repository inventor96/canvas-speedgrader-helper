import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { initializeLimits, saveStudentNamesWithPrune } from '@/shared/storage-utils.js';

/** Initialise the popup: detect SpeedGrader tab, load preferred name, wire buttons. */
document.addEventListener('DOMContentLoaded', async () => {
  if (typeof initializeLimits === 'function') {
    await initializeLimits();
  }

  const studentIdEl = document.getElementById('student-id');
  const nameInput = document.getElementById('student-name');
  const saveBtn = document.getElementById('save');
  const statusEl = document.getElementById('status');
  const noStudentEl = document.getElementById('no-student');
  const formEl = document.getElementById('form');
  const jumpGroupsWrapEl = document.getElementById('jump-groups-wrap');
  const jumpGroupsBtn = document.getElementById('jump-groups');
  const jumpGroupsStatusEl = document.getElementById('jump-groups-status');
  const openSettingsBtn = document.getElementById('open-settings');
  let activeSpeedgraderTabId = null;

  /** Shows a status message briefly, then clears it. */
  function showStatus(msg, timeout = 1500) {
    statusEl.textContent = msg;
    if (timeout) setTimeout(() => (statusEl.textContent = ''), timeout);
  }

  /** Shows an error message for the "Jump to groups" button. */
  function showJumpGroupsError(msg, timeout = 3000) {
    if (!jumpGroupsStatusEl) return;
    jumpGroupsStatusEl.textContent = msg || '';
    if (timeout && msg) {
      setTimeout(() => {
        if (jumpGroupsStatusEl.textContent === msg) {
          jumpGroupsStatusEl.textContent = '';
        }
      }, timeout);
    }
  }

  // Identify the active SpeedGrader tab and extract student ID
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
      // Ignore invalid URLs
    }

    if (!sid) {
      noStudentEl.style.display = '';
      return;
    }

    // Show the form and load existing preferred name
    studentIdEl.textContent = sid;
    formEl.style.display = '';
    jumpGroupsWrapEl.style.display = '';
    activeSpeedgraderTabId = tab.id;

    chrome.storage.local.get({ studentNames: {} }, (data) => {
      const mapping = data && data.studentNames ? data.studentNames : {};
      nameInput.value = mapping[sid] || '';

      nameInput.focus();
    });

    /** Saves the preferred name mapping to local storage. */
    function saveMapping() {
      const val = nameInput.value.trim();
      chrome.storage.local.get({ studentNames: {} }, (data) => {
        const mapping = data && data.studentNames ? data.studentNames : {};
        if (val) {
          mapping[sid] = val;
        } else {
          delete mapping[sid];
        }
        saveStudentNamesWithPrune(mapping, () => {
          showStatus('Saved');
        });
      });
    }

    saveBtn.addEventListener('click', saveMapping);

    // Allow Enter key to save
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        saveMapping();
      }
    });

    // "Jump to groups" button triggers the groups check via content script
    if (jumpGroupsBtn) {
      jumpGroupsBtn.addEventListener('click', () => {
        if (!activeSpeedgraderTabId) {
          showJumpGroupsError('Open SpeedGrader first');
          return;
        }

        showJumpGroupsError('');
        jumpGroupsBtn.disabled = true;

        chrome.tabs.sendMessage(activeSpeedgraderTabId, {
          type: CSH_MESSAGE_TYPES.POPUP_JUMP_TO_STUDENT_GROUPS,
        }, (response) => {
          jumpGroupsBtn.disabled = false;

          if (chrome.runtime && chrome.runtime.lastError) {
            showJumpGroupsError('Could not reach SpeedGrader tab');
            return;
          }

          if (!response || !response.ok) {
            showJumpGroupsError((response && response.error) ? response.error : 'Could not open groups page');
            return;
          }
        });
      });
    }
  });

  /** Opens the extension's options page. */
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
