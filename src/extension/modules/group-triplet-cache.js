const GROUP_TRIPLET_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const GROUP_TRIPLET_CACHE_STORAGE_KEY = 'groupTripletCache';
const groupTripletCache = new Map();
let hasLoadedGroupTripletCache = false;
let isLoadingGroupTripletCache = false;
const groupTripletCacheLoadQueue = [];

function getGroupTripletCacheKey(courseId, assignmentId, studentId) {
  const normalizedCourseId = String(courseId || '').trim();
  const normalizedAssignmentId = String(assignmentId || '').trim();
  const normalizedStudentId = String(studentId || '').trim();

  if (!normalizedCourseId || !normalizedAssignmentId || !normalizedStudentId) {
    return null;
  }

  return `${normalizedCourseId}|${normalizedAssignmentId}|${normalizedStudentId}`;
}

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

    while (groupTripletCacheLoadQueue.length) {
      const queuedCallback = groupTripletCacheLoadQueue.shift();
      try {
        queuedCallback();
      } catch (e) {}
    }
  });
}

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
