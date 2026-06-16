/** Synced settings (per-install preferences). Each key maps to a toggle or stored value. */
export const SYNCED_SETTINGS = {
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

/** Local-only settings (per-device, not synced). */
export const LOCAL_SETTINGS = {
  studentNames: {},
  studentNamesMeta: { lastUsed: {} },
  queuedStudentName: null,
  aiEnabled: false,
  aiEndpointUrl: 'http://localhost:11434',
  aiModel: 'qwen3.5:4b',
};
