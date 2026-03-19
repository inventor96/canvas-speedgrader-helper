/**
 * Message types for page ↔ content script communication
 * These strings are used in postMessage calls between the page context and content script context
 */
const CSH_MESSAGE_TYPES = {
  // Page → Content Script
  SAVE_POINTS: 'CSH_SAVE_POINTS',
  TOUCH_POINTS: 'CSH_TOUCH_POINTS',
  TOUCH_STUDENT_NAME: 'CSH_TOUCH_STUDENT_NAME',
  CLEAR_QUEUED_STUDENT: 'CSH_CLEAR_QUEUED_STUDENT',
  START_GROUPS_CHECK: 'CSH_START_GROUPS_CHECK',

  // Content Script → Page
  UPDATE_SETTINGS: 'CSH_UPDATE_SETTINGS',

  // Content Script/Worker/Groups page routing
  GROUPS_GET_PENDING_CONTEXT: 'CSH_GROUPS_GET_PENDING_CONTEXT',
  GROUPS_CHECK_COMPLETE: 'CSH_GROUPS_CHECK_COMPLETE',
  GROUPS_CHECK_RESULT: 'CSH_GROUPS_CHECK_RESULT',
};
