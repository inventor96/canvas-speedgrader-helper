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

  // Content Script → Page
  UPDATE_SETTINGS: 'CSH_UPDATE_SETTINGS',
};
