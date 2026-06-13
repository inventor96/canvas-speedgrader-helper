import { CSH_MESSAGE_TYPES } from '@/shared/message-types.js';
import { get, auxState } from './settings-store.js';

export function getCurrentStudentNameFromPage(forceFullName = false) {
  const el = document.querySelector(
    'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
  );
  let fullName = el?.textContent?.trim() || null;

  if (fullName && fullName.endsWith('\u2026')) {
    try {
      const truncatedName = fullName.slice(0, -1).trim();
      const fullNameElement = document.querySelector(
        `button[data-testid="student-select-trigger"] [name^="${truncatedName}"]`
      );
      if (fullNameElement) {
        const nameAttr = fullNameElement.getAttribute('name');
        if (nameAttr) {
          fullName = nameAttr;
        }
      }
    } catch (e) {
      console.error('Error retrieving full student name from truncated version:', e);
    }
  }

  if (!fullName) return null;
  if (get('studentNameFormat') === 'full-name' || forceFullName) {
    return fullName;
  }
  return fullName.split(/\s+/)[0];
}

export function getStudentName() {
  try {
    const params = new URLSearchParams(location.search || window.location.search);
    const sid = params.get('student_id');
    const studentNames = get('studentNames');
    if (sid && studentNames && studentNames[sid]) {
      if (auxState.lastTouchedStudentId !== sid) {
        auxState.lastTouchedStudentId = sid;
        try {
          window.postMessage({ type: CSH_MESSAGE_TYPES.TOUCH_STUDENT_NAME, key: sid }, '*');
        } catch (e) {}
      }
      return studentNames[sid];
    }
  } catch (e) {
    console.error('Error parsing URL for student_id:', e);
  }

  return getCurrentStudentNameFromPage();
}
