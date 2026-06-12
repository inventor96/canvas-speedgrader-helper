import { CSH_MESSAGE_TYPES } from '../shared/message-types.js';
import { initializeLimits, saveStudentNamesWithPrune, CSHStorageUtils } from '../shared/storage-utils.js';

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof CSHStorageUtils !== 'undefined' && typeof initializeLimits === 'function') {
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

  function showStatus(msg, timeout = 1500) {
    statusEl.textContent = msg;
    if (timeout) setTimeout(() => (statusEl.textContent = ''), timeout);
  }

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
    jumpGroupsWrapEl.style.display = '';
    activeSpeedgraderTabId = tab.id;

    chrome.storage.local.get({ studentNames: {} }, (data) => {
      const mapping = data && data.studentNames ? data.studentNames : {};
      nameInput.value = mapping[sid] || '';

      nameInput.focus();
    });

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

    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.keyCode === 13) {
        e.preventDefault();
        saveMapping();
      }
    });

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
