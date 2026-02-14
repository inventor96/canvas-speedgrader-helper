/**
 * Settings definitions and defaults for Canvas SpeedGrader Helper extension.
 * These settings are allowed to be synced between devices.
 */
const SYNCED_SETTINGS = {
  placeholders: ["STUDENT_NAME"],
  openRubricForUngraded: false,
  openCommentLibraryAfterSubmit: false,
  studentNameFormat: 'first-name',
  autoFillFullPoints: false,
  rememberPointsForComments: false,
  openCommentBoxAfterMaxPoints: false,
  openCommentBoxAfterLessThanMaxPoints: false,
  clearCommentBoxOnMaxPoints: false,
  notifyOnStudentNameMismatch: false,
  savedPoints: {},
  savedPointsMeta: { lastUsed: {} },
};

/**
 * Settings definitions and defaults for Canvas SpeedGrader Helper extension.
 * These settings are stored locally and not synced.
 */
const LOCAL_SETTINGS = {
  studentNames: {},
  studentNamesMeta: { lastUsed: {} },
  queuedStudentName: null,
};
