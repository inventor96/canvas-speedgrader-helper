import { logger } from '@/shared/logger.js';
import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { get } from './settings-store.js';
import { getCurrentStudentNameFromPage } from './student-name-service.js';

/** Checks if a name is all-uppercase or all-lowercase (excluding non-letters). */
export function isNameUnnatural(name) {
  const letters = String(name || '').replace(/[^a-zA-Z]/g, '');
  if (!letters || letters.length < 2) return false;
  return letters === letters.toUpperCase() || letters === letters.toLowerCase();
}

/** Converts a name to Title Case, using non-letter characters as word boundaries. */
export function formatNameNatural(name) {
  let result = '';
  let nextUpper = true;
  for (let i = 0; i < name.length; i++) {
    const ch = name[i];
    if (/[a-zA-Z]/.test(ch)) {
      result += nextUpper ? ch.toUpperCase() : ch.toLowerCase();
      nextUpper = false;
    } else {
      result += ch;
      nextUpper = true;
    }
  }
  return result;
}

/** Gets or creates the warning banner element for name sanity warnings. */
function getOrCreateContainer() {
  let div = document.getElementById('csh-name-sanity-warning');
  if (div) return div;

  div = document.createElement('div');
  div.id = 'csh-name-sanity-warning';
  div.setAttribute('role', 'alert');
  div.setAttribute('aria-live', 'polite');
  div.style.cssText = `
    position: fixed;
    top: 120px;
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
    background-color: #fff3cd;
    border: 2px solid #ff9800;
  `;
  document.body.appendChild(div);
  return div;
}

/** Removes the warning banner. */
function removeContainer() {
  const div = document.getElementById('csh-name-sanity-warning');
  if (div) div.remove();
}

/** Renders the warning banner with options to use suggested formatting, use as-is, or ignore. */
function showWarning(name, issue) {
  const container = getOrCreateContainer();
  container.innerHTML = '';

  const heading = document.createElement('h3');
  heading.style.cssText = 'margin: 0 24px 8px 0; font-size: 16px; font-weight: 600; color: #ff6f00;';
  heading.textContent = 'Unusual Name Format';

  const message = document.createElement('p');
  message.style.cssText = 'margin: 0 0 10px 0; color: #666;';
  message.textContent = issue === 'uppercase'
    ? 'The name for this student appears to be all uppercase.'
    : 'The name for this student appears to be all lowercase.';

  container.appendChild(heading);
  container.appendChild(message);

  const suggested = formatNameNatural(name);

  const linkWrap = document.createElement('div');
  linkWrap.style.cssText = 'margin: 0 0 4px 0;';

  // "Use [suggested format]" link
  const useSuggestedLink = document.createElement('a');
  useSuggestedLink.href = '#';
  useSuggestedLink.textContent = `Use ${suggested}`;
  useSuggestedLink.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer; display: inline-block; margin-right: 16px;';
  useSuggestedLink.onclick = (event) => {
    event.preventDefault();
    savePreferredName(suggested);
  };
  linkWrap.appendChild(useSuggestedLink);

  // "Use as-is" link
  const useAsIsLink = document.createElement('a');
  useAsIsLink.href = '#';
  useAsIsLink.textContent = 'Use as-is';
  useAsIsLink.style.cssText = 'color: #1e5aa8; text-decoration: underline; cursor: pointer; display: inline-block;';
  useAsIsLink.onclick = (event) => {
    event.preventDefault();
    savePreferredName(name);
  };
  linkWrap.appendChild(useAsIsLink);

  container.appendChild(linkWrap);

  // "Ignore" link
  const ignoreLink = document.createElement('div');
  ignoreLink.style.cssText = 'margin: 6px 0 0 0;';
  const ignoreA = document.createElement('a');
  ignoreA.href = '#';
  ignoreA.textContent = 'Ignore';
  ignoreA.style.cssText = 'color: #888; text-decoration: underline; cursor: pointer; font-size: 12px;';
  ignoreA.onclick = (event) => {
    event.preventDefault();
    removeContainer();
  };
  ignoreLink.appendChild(ignoreA);
  container.appendChild(ignoreLink);

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
    color: #ff6f00;
    padding: 0;
    width: 24px;
    height: 24px;
    line-height: 1;
  `;
  closeButton.onclick = () => removeContainer();
  container.appendChild(closeButton);
}

/** Saves a preferred name for the current student to local storage. */
function savePreferredName(name) {
  removeContainer();
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    const sid = params.get('student_id');
    if (!sid) return;
    window.postMessage({
      type: CSH_MESSAGE_TYPES.SAVE_STUDENT_NAME,
      studentId: sid,
      preferredName: name,
    }, '*');
  } catch (e) {
    logger.error('Error saving preferred name:', e);
  }
}

/** Checks the current student's name and shows a warning if it's unnaturally formatted. */
export function check() {
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    const sid = params.get('student_id');
    const studentNames = get('studentNames');
    // Skip if a preferred name already exists
    if (!sid || (studentNames && studentNames[sid])) return;

    const name = getCurrentStudentNameFromPage();
    if (!name) return;

    if (!isNameUnnatural(name)) return;

    const letters = name.replace(/[^a-zA-Z]/g, '');
    const issue = letters === letters.toUpperCase() ? 'uppercase' : 'lowercase';
    showWarning(name, issue);
  } catch (e) {
    logger.error('Error in name sanity check:', e);
  }
}
