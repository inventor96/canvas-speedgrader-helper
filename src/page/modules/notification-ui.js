import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { observeUntil } from '@/shared/observe-until.js';
import { get } from './settings-store.js';
import { escapeHtml, normalizeName, waitForElement } from './helpers/dom-utils.js';
import { getCurrentStudentNameFromPage } from './student-name-service.js';

let _groupsResultListenerAttached = false;
let _pendingTripletLookup = null;
const GROUP_INDICATOR_WAIT_MS = 3500;

export function getCurrentTripletContext() {
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
}

export function getTripletContextKey(context) {
  if (!context || !context.courseId || !context.assignmentId || !context.studentId) {
    return '';
  }

  return `${context.courseId}|${context.assignmentId}|${context.studentId}`;
}

function isCurrentSubmissionAlreadyGraded() {
  return !!document.querySelector('[data-testid="graded-icon"]');
}

function upsertCurrentTripletCache() {
  const context = getCurrentTripletContext();
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
}

async function checkMatchedStudentNameForCachedGroupContext(queuedName) {
  const startingContext = getCurrentTripletContext();
  if (!startingContext) return;

  const startingContextKey = getTripletContextKey(startingContext);
  const showGroupsLink = await waitForGroupIndicators();
  if (!showGroupsLink) return;

  const currentContext = getCurrentTripletContext();
  if (!currentContext || getTripletContextKey(currentContext) !== startingContextKey) {
    return;
  }

  const requestId = `csh-triplet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  _pendingTripletLookup = {
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
    _pendingTripletLookup = null;
    console.warn('CSH: Failed to request group triplet cache lookup.', e);
  }
}

function isGroupAssignmentDetected() {
  const groupModeRadio = document.querySelector('input[name="commentMode"][value="group"]');
  const wholeGroupNotice = Array.from(document.querySelectorAll('span')).some(
    (span) => span.textContent?.trim() === 'All comments are sent to the whole group'
  );

  return !!groupModeRadio || wholeGroupNotice;
}

function waitForGroupIndicators(timeoutMs = GROUP_INDICATOR_WAIT_MS) {
  return observeUntil(isGroupAssignmentDetected, { timeout: timeoutMs });
}

function getOrCreateWarningContainer() {
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
}

function applyWarningStyle(warningDiv) {
  warningDiv.style.backgroundColor = '#fff3cd';
  warningDiv.style.border = '2px solid #ff9800';
  warningDiv.style.color = '#333';
}

function applyInfoStyle(warningDiv) {
  warningDiv.style.backgroundColor = '#e8f4ff';
  warningDiv.style.border = '2px solid #2f7ed8';
  warningDiv.style.color = '#123b66';
}

function renderBanner({ queuedName, speedgraderName, sameGroup, matchedGroupHeader, statusText, showGroupsLink }) {
  const warningDiv = getOrCreateWarningContainer();
  warningDiv.dataset.queuedName = queuedName;
  warningDiv.dataset.speedgraderName = speedgraderName;
  warningDiv.dataset.checkInProgress = statusText === 'Checking course groups...' ? 'true' : 'false';

  if (sameGroup) {
    applyInfoStyle(warningDiv);
  } else {
    applyWarningStyle(warningDiv);
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

  let messageHtml = `<strong>Grading Queue:</strong> ${escapeHtml(queuedName)}<br><strong>SpeedGrader:</strong> ${escapeHtml(speedgraderName)}`;
  if (sameGroup) {
    messageHtml += '<br>These names are different, but both students appear in the same Canvas group.';
    if (matchedGroupHeader) {
      messageHtml += `<br><strong>Matched Group:</strong> ${escapeHtml(matchedGroupHeader)}`;
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
      startGroupsCheck(queuedName, speedgraderName);
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
        startGroupsCheck(primaryName, secondaryName, true);
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
}

function startGroupsCheck(queuedName, speedgraderName, noAutoClose = false) {
  const warningDiv = document.getElementById('csh-student-mismatch-warning');
  if (!warningDiv) return;
  if (warningDiv.dataset.checkInProgress === 'true') return;

  renderBanner({
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
    renderBanner({
      queuedName,
      speedgraderName,
      sameGroup: false,
      matchedGroupHeader: '',
      statusText: 'Could not start groups check.',
      showGroupsLink: isGroupAssignmentDetected(),
    });
  }
}

function maybeApplyGroupsResult(msg) {
  const warningDiv = document.getElementById('csh-student-mismatch-warning');
  if (!warningDiv) return;

  const currentQueued = normalizeName(warningDiv.dataset.queuedName || '');
  const currentSpeedgrader = normalizeName(warningDiv.dataset.speedgraderName || '');
  const messageQueued = normalizeName(msg.queuedName || '');
  const messageSpeedgrader = normalizeName(msg.speedgraderName || '');

  if (!currentQueued || !currentSpeedgrader) return;
  if (currentQueued !== messageQueued || currentSpeedgrader !== messageSpeedgrader) return;

  if (msg.sameGroup) {
    upsertCurrentTripletCache();
    renderBanner({
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

  renderBanner({
    queuedName: warningDiv.dataset.queuedName || msg.queuedName,
    speedgraderName: warningDiv.dataset.speedgraderName || msg.speedgraderName,
    sameGroup: false,
    matchedGroupHeader: '',
    statusText: failureText,
    showGroupsLink: isGroupAssignmentDetected(),
  });
}

function maybeApplyTripletCacheLookupResult(msg) {
  const pendingLookup = _pendingTripletLookup;
  if (!pendingLookup) return;
  if (!msg || msg.requestId !== pendingLookup.requestId) return;

  _pendingTripletLookup = null;

  const currentContext = getCurrentTripletContext();
  if (!currentContext || getTripletContextKey(currentContext) !== pendingLookup.contextKey) {
    return;
  }

  if (msg.error || !msg.hit || !isGroupAssignmentDetected()) {
    return;
  }

  if (!isCurrentSubmissionAlreadyGraded()) {
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
}

export function attachGroupsResultListener() {
  if (_groupsResultListenerAttached) return;
  _groupsResultListenerAttached = true;

  window.addEventListener('message', (event) => {
    try {
      if (!event || event.source !== window) return;
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT) {
        maybeApplyGroupsResult(msg);
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP_RESULT) {
        maybeApplyTripletCacheLookupResult(msg);
      }
    } catch (e) {
      console.error('Error handling groups check result message:', e);
    }
  });
}

async function showStudentNameMismatchWarning(queuedName, speedgraderName) {
  try {
    const showGroupsLink = await waitForGroupIndicators();

    renderBanner({
      queuedName,
      speedgraderName,
      sameGroup: false,
      matchedGroupHeader: '',
      statusText: '',
      showGroupsLink,
    });

    if (showGroupsLink && get('autoGroupCheckOnNameMismatch')) {
      startGroupsCheck(queuedName, speedgraderName);
    }

    console.warn('CSH: Student name mismatch detected!', {
      queued: queuedName,
      speedgrader: speedgraderName
    });
  } catch (e) {
    console.error('Error displaying student name mismatch warning:', e);
  }
}

export function checkQueuedStudentName() {
  const queued = get('queuedStudentName');

  if (!queued || !queued.name) {
    console.log('CSH: No queued student name to check');
    return;
  }

  const currentName = getCurrentStudentNameFromPage(true);

  if (!currentName) {
    const STUDENT_SELECTOR = 'button[data-testid="student-select-trigger"] [data-testid="selected-student"]';
    waitForElement(STUDENT_SELECTOR, 20000).then(() => {
      const name = getCurrentStudentNameFromPage(true);
      if (name) finishStudentNameCheck(queued.name, name);
    });
    return;
  }

  finishStudentNameCheck(queued.name, currentName);
}

function finishStudentNameCheck(queuedName, currentName) {
  try {
    window.postMessage({ type: CSH_MESSAGE_TYPES.CLEAR_QUEUED_STUDENT }, '*');
  } catch (e) {
    console.warn('CSH: Failed to send clear queued student message', e);
  }

  if (currentName.trim().toLowerCase() !== queuedName.trim().toLowerCase()) {
    if (get('notifyOnStudentNameMismatch')) {
      showStudentNameMismatchWarning(queuedName, currentName);
    }
  } else {
    console.log('CSH: Student names match! \u2713');
    checkMatchedStudentNameForCachedGroupContext(queuedName);
  }
}
