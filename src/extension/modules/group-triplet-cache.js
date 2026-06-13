/** Cache TTL for group triplet lookups (6 hours). */
const GROUP_TRIPLET_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** chrome.storage.local key for persisting the triplet cache. */
const GROUP_TRIPLET_CACHE_STORAGE_KEY = 'groupTripletCache';
/** In-memory map: courseId|assignmentId|studentId → { createdAt }. */
const groupTripletCache = new Map();
let hasLoadedGroupTripletCache = false;
let isLoadingGroupTripletCache = false;
/** Queue of callbacks that arrived while initial load was in flight. */
const groupTripletCacheLoadQueue = [];

/** Builds a deterministic cache key from course/assignment/student IDs. */
function getGroupTripletCacheKey(courseId, assignmentId, studentId) {
  const normalizedCourseId = String(courseId || '').trim();
  const normalizedAssignmentId = String(assignmentId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();

  if (!normalizedCourseId || !normalizedAssignmentId || !normalizedStudentId) {
    return null;
  }

  return `${normalizedCourseId}|${normalizedAssignmentId}|${normalizedStudentId}`;
}

/** Removes entries older than TTL. Returns true if any entries were pruned. */
function pruneGroupTripletCache(now = Date.now()) {
  let removedAny = false;

  for (const [key, entry] of groupTripletCache.entries()) {
    if (!entry || (now - (entry.createdAt || 0)) > GROUP_TRIPLET_CACHE_TTL_MS) {
      groupTripletCache.delete(key);
      removedAny = true;
    }
  }

  return removedAny;
}

/** Loads the cache from chrome.storage.local on first call; queues concurrent requests. */
function loadGroupTripletCache(callback) {
  if (hasLoadedGroupTripletCache) {
    callback();
    return;
  }

  groupTripletCacheLoadQueue.push(callback);
  if (isLoadingGroupTripletCache) {
    return;
  }

  isLoadingGroupTripletCache = true;

  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) {
    hasLoadedGroupTripletCache = true;
    isLoadingGroupTripletCache = false;
    while (groupTripletCacheLoadQueue.length) {
      const queuedCallback = groupTripletCacheLoadQueue.shift();
      try {
        queuedCallback();
      } catch (e) {}
    }
    return;
  }

  // Load from storage and populate in-memory map
  chrome.storage.local.get({ [GROUP_TRIPLET_CACHE_STORAGE_KEY]: {} }, (data) => {
    const storedEntries = data && data[GROUP_TRIPLET_CACHE_STORAGE_KEY];

    if (storedEntries && typeof storedEntries === 'object') {
      Object.entries(storedEntries).forEach(([key, value]) => {
        const createdAt = value && Number.isFinite(value.createdAt) ? value.createdAt : 0;
        if (key && createdAt > 0) {
          groupTripletCache.set(key, { createdAt });
        }
      });
    }

    hasLoadedGroupTripletCache = true;
    isLoadingGroupTripletCache = false;

    // Drain queued callbacks
    while (groupTripletCacheLoadQueue.length) {
      const queuedCallback = groupTripletCacheLoadQueue.shift();
      try {
        queuedCallback();
      } catch (e) {}
    }
  });
}

/** Persists the in-memory cache to chrome.storage.local. */
function persistGroupTripletCache(callback) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) {
    if (typeof callback === 'function') callback();
    return;
  }

  const serialized = {};
  groupTripletCache.forEach((entry, key) => {
    serialized[key] = { createdAt: entry.createdAt };
  });

  chrome.storage.local.set({ [GROUP_TRIPLET_CACHE_STORAGE_KEY]: serialized }, () => {
    if (typeof callback === 'function') callback();
  });
}

/** Ensures cache is loaded, prunes stale entries, and if any were removed persists the change. */
function withGroupTripletCache(callback) {
  loadGroupTripletCache(() => {
    const removedAny = pruneGroupTripletCache();
    if (removedAny) {
      persistGroupTripletCache(() => callback());
      return;
    }

    callback();
  });
}

export { getGroupTripletCacheKey, pruneGroupTripletCache, withGroupTripletCache, groupTripletCache, persistGroupTripletCache };
