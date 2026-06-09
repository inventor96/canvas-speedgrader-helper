/**
 * Settings definitions and defaults for Canvas SpeedGrader Helper extension.
 * These settings are allowed to be synced between devices.
 */
const SYNCED_SETTINGS = {
  placeholders: ["STUDENT_NAME"],
  openRubricForUngraded: true,
  openCommentLibraryAfterSubmit: true,
  closeSpeedgraderTabAfterSubmitComment: true,
  autoSetCommentsToWholeGroupWhenAvailable: true,
  scrollToSubmitCommentAfterCommentLibrarySelection: true,
  useTeamNameForGroupPlaceholderReplacement: true,
  studentNameFormat: 'first-name',
  autoFillFullPoints: true,
  rememberPointsForComments: true,
  openCommentBoxAfterMaxPoints: false,
  openCommentBoxAfterLessThanMaxPoints: true,
  rubricAutoScrollToNextCriterion: true,
  rubricAutoScrollToFirstCriterionAfterOpening: true,
  clearCommentBoxOnMaxPoints: true,
  notifyOnStudentNameMismatch: true,
  autoGroupCheckOnNameMismatch: true,
  enableNameSanityCheck: true,
  autoSelectAlreadyGradedWhenGroupMatched: true,
  autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded: true,
  autoOpenNextQueueItemAfterComplete: true,
  autoClickLoadQueueWhenEmpty: true,
  autoClickLoadQueueEveryHourWhenLessThanTenItems: true,
  autoCompleteQueueItemAfterCommentSubmit: true,
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
