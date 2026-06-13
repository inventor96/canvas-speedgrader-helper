import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { observeUntil } from '@/shared/observe-until.js';

const SEARCH_INPUT_SELECTOR = '[data-testid="group-search-input"]';
const GROUPS_CONTAINER_SELECTOR = 'div.student-groups';
const GROUP_HEADER_CLASS = 'student-groups-header';
const GROUP_BODY_CLASS = 'student-group-body';
const GROUP_MEMBER_SELECTOR = 'span.screenreader-only';

const MAX_WAIT_FOR_RESULTS_MS = 10000;
const QUIET_WINDOW_MS = 700;
const MAX_WAIT_FOR_SEARCH_INPUT_MS = 10000;
const GROUPS_READY_POLL_MS = 250;
const GROUPS_READY_MAX_WAIT_MS = 6000;

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function setInputValue(input, nextValue) {
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(input, nextValue);
  } else {
    input.value = nextValue;
  }
}

function fireSearchEvents(input, value) {
  const stringValue = String(value || '');
  const lastChar = stringValue.slice(-1);
  const key = lastChar || 'Unidentified';
  let code = 'Unidentified';

  if (/^[a-z]$/i.test(lastChar)) {
    code = `Key${lastChar.toUpperCase()}`;
  } else if (/^[0-9]$/.test(lastChar)) {
    code = `Digit${lastChar}`;
  } else if (lastChar === ' ') {
    code = 'Space';
  }

  input.focus();
  setInputValue(input, stringValue);

  input.dispatchEvent(new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    code
  }));

  input.dispatchEvent(new Event('input', {
    bubbles: true,
    cancelable: true,
  }));

  input.dispatchEvent(new KeyboardEvent('keyup', {
    bubbles: true,
    cancelable: true,
    key,
    code
  }));
}

function waitForDebouncedResults() {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let quietTimer = null;
    let observer = null;

    const finalize = () => {
      if (settled) return;
      settled = true;
      if (quietTimer) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
      if (observer) {
        observer.disconnect();
      }
      resolve();
    };

    const scheduleQuietResolve = () => {
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      quietTimer = setTimeout(finalize, QUIET_WINDOW_MS);
    };

    observer = new MutationObserver(() => {
      scheduleQuietResolve();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    scheduleQuietResolve();
    window.setTimeout(finalize, MAX_WAIT_FOR_RESULTS_MS);
  });
}

async function waitForSearchInput() {
  return observeUntil(() => document.querySelector(SEARCH_INPUT_SELECTOR), {
    timeout: MAX_WAIT_FOR_SEARCH_INPUT_MS,
  });
}

function parseGroups() {
  const groups = [];
  const containers = document.querySelectorAll(GROUPS_CONTAINER_SELECTOR);

  containers.forEach((container) => {
    let pendingHeader = '';

    Array.from(container.children).forEach((child) => {
      if (child.classList.contains(GROUP_HEADER_CLASS)) {
        pendingHeader = (child.textContent || '').trim();
        return;
      }

      if (child.classList.contains(GROUP_BODY_CLASS)) {
        const memberNames = Array.from(child.querySelectorAll(GROUP_MEMBER_SELECTOR))
          .map((node) => (node.textContent || '').trim())
          .filter(Boolean);

        groups.push({
          header: pendingHeader,
          memberNames,
        });

        pendingHeader = '';
      }
    });
  });

  return groups;
}

function hasTargetName(groups, targetName) {
  const normalizedTarget = normalizeName(targetName);
  if (!normalizedTarget) return false;

  return groups.some((group) => group.memberNames.some((member) => normalizeName(member) === normalizedTarget));
}

async function waitForGroupsToLoad(queuedName, speedgraderName) {
  const startedAt = Date.now();
  let lastSignature = '';
  let stablePollCount = 0;
  let bestGroups = [];

  while (Date.now() - startedAt < GROUPS_READY_MAX_WAIT_MS) {
    const groups = parseGroups();
    const totalMembers = groups.reduce((acc, group) => acc + group.memberNames.length, 0);
    const signature = JSON.stringify(groups.map((group) => [group.header, group.memberNames]));
    const queuedFound = hasTargetName(groups, queuedName);
    const speedgraderFound = hasTargetName(groups, speedgraderName);

    if (signature === lastSignature) {
      stablePollCount += 1;
    } else {
      stablePollCount = 0;
    }

    lastSignature = signature;

    if (groups.length > 0 || totalMembers > 0) {
      bestGroups = groups;
    }

    if (queuedFound || speedgraderFound) {
      return groups;
    }

    if ((groups.length > 0 || totalMembers > 0) && stablePollCount >= 2) {
      return groups;
    }

    await new Promise((resolve) => window.setTimeout(resolve, GROUPS_READY_POLL_MS));
  }

  return bestGroups;
}

function evaluateSameGroup(groups, queuedName, speedgraderName) {
  const normalizedQueued = normalizeName(queuedName);
  const normalizedSpeedgrader = normalizeName(speedgraderName);

  for (const group of groups) {
    const normalizedMembers = new Set(group.memberNames.map(normalizeName));
    if (normalizedMembers.has(normalizedQueued) && normalizedMembers.has(normalizedSpeedgrader)) {
      return {
        sameGroup: true,
        matchedGroupHeader: group.header || '',
      };
    }
  }

  return {
    sameGroup: false,
    matchedGroupHeader: '',
  };
}

async function notifyComplete(payload) {
  try {
    await chrome.runtime.sendMessage({
      type: CSH_MESSAGE_TYPES.GROUPS_CHECK_COMPLETE,
      ...payload,
    });
  } catch (e) {}
}

async function run() {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
    return;
  }

  let contextResponse;
  try {
    contextResponse = await chrome.runtime.sendMessage({
      type: CSH_MESSAGE_TYPES.GROUPS_GET_PENDING_CONTEXT,
    });
  } catch (e) {
    return;
  }

  if (!contextResponse || !contextResponse.ok || !contextResponse.context) {
    return;
  }

  const queuedName = contextResponse.context.queuedName || '';
  const speedgraderName = contextResponse.context.speedgraderName || '';

  if (!queuedName || !speedgraderName) {
    await notifyComplete({
      sameGroup: false,
      groupsCount: 0,
      error: 'Missing student names for groups check.',
    });
    return;
  }

  const searchInput = await waitForSearchInput();
  if (!searchInput) {
    await notifyComplete({
      sameGroup: false,
      groupsCount: 0,
      error: 'Timed out waiting for groups search input to appear on page.',
    });
    return;
  }

  fireSearchEvents(searchInput, queuedName);
  await waitForDebouncedResults();

  const groups = await waitForGroupsToLoad(queuedName, speedgraderName);
  const evaluation = evaluateSameGroup(groups, queuedName, speedgraderName);

  await notifyComplete({
    sameGroup: evaluation.sameGroup,
    matchedGroupHeader: evaluation.matchedGroupHeader,
    groupsCount: groups.length,
    error: null,
  });
}

run().catch(async (e) => {
  await notifyComplete({
    sameGroup: false,
    groupsCount: 0,
    error: e && e.message ? e.message : 'Unexpected groups page error.',
  });
});
