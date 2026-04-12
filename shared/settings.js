/**
 * Settings definitions and defaults for Canvas SpeedGrader Helper extension.
 * These settings are allowed to be synced between devices.
 */
const SYNCED_SETTINGS = {
  placeholders: ["STUDENT_NAME"],
  openRubricForUngraded: false,
  openCommentLibraryAfterSubmit: false,
  closeSpeedgraderTabAfterSubmitComment: false,
  autoSetCommentsToWholeGroupWhenAvailable: false,
  scrollToSubmitCommentAfterCommentLibrarySelection: false,
  useTeamNameForGroupPlaceholderReplacement: false,
  studentNameFormat: 'first-name',
  autoFillFullPoints: false,
  rememberPointsForComments: false,
  openCommentBoxAfterMaxPoints: false,
  openCommentBoxAfterLessThanMaxPoints: false,
  rubricAutoScrollToNextCriterion: false,
  rubricAutoScrollToFirstCriterionAfterOpening: false,
  clearCommentBoxOnMaxPoints: false,
  notifyOnStudentNameMismatch: false,
  autoGroupCheckOnNameMismatch: false,
  autoSelectAlreadyGradedWhenGroupMatched: false,
  autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded: false,
  autoOpenNextQueueItemAfterComplete: false,
  autoCompleteQueueItemAfterCommentSubmit: false,
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
