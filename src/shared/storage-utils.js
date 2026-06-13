'use strict';

import { logger } from './logger.js';

/** Fallback storage limits when chrome.storage quotas are unavailable. */
const FALLBACK_LIMITS = {
  savedPoints: {
    maxEntries: 5000,
    maxBytes: 8 * 1024,
  },
  studentNames: {
    maxEntries: 10000,
    maxBytes: 128 * 1024,
  },
};

let DEFAULT_LIMITS = { ...FALLBACK_LIMITS };

/**
 * Queries chrome.storage quotas and current usage to compute per-key limits.
 * Falls back to FALLBACK_LIMITS when chrome APIs are unavailable.
 */
export async function getDefaultLimits() {
  const cloneLimits = () => ({
    savedPoints: { ...FALLBACK_LIMITS.savedPoints },
    studentNames: { ...FALLBACK_LIMITS.studentNames }
  });

  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const limits = cloneLimits();

      // Helper: wraps getBytesInUse in a promise
      const getBytesInUse = (area) => new Promise((resolve) => {
        if (!area || typeof area.getBytesInUse !== 'function') return resolve(null);
        area.getBytesInUse(null, (bytes) => {
          if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
          resolve(typeof bytes === 'number' ? bytes : null);
        });
      });

      // Sync storage: allocate 80% of remaining quota to savedPoints
      const syncArea = chrome.storage.sync;
      const syncQuota = syncArea && Number.isFinite(syncArea.QUOTA_BYTES) ? syncArea.QUOTA_BYTES : null;
      const syncItemQuota = syncArea && Number.isFinite(syncArea.QUOTA_BYTES_PER_ITEM) ? syncArea.QUOTA_BYTES_PER_ITEM : null;
      if (syncQuota !== null) {
        const syncUsage = await getBytesInUse(syncArea);
        if (syncUsage !== null) {
          const availableSync = Math.max(syncQuota - syncUsage, 0);
          let savedPointsBytes = Math.floor(availableSync * 0.8);
          if (syncItemQuota !== null) {
            savedPointsBytes = Math.min(savedPointsBytes, syncItemQuota);
          }
          limits.savedPoints.maxBytes = savedPointsBytes;
        }
      }

      // Local storage: allocate 60% of remaining quota to studentNames
      const localArea = chrome.storage.local;
      const localQuota = localArea && Number.isFinite(localArea.QUOTA_BYTES) ? localArea.QUOTA_BYTES : null;
      if (localQuota !== null) {
        const localUsage = await getBytesInUse(localArea);
        if (localUsage !== null) {
          const availableLocal = Math.max(localQuota - localUsage, 0);
          limits.studentNames.maxBytes = Math.floor(availableLocal * 0.6);
        }
      }

      // Fallback to navigator.storage.estimate when local QUOTA_BYTES is unavailable
      if (localQuota === null && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate && typeof location !== 'undefined' && location.protocol === 'chrome-extension:') {
        const estimate = await navigator.storage.estimate();
        const availableBytes = Math.max((estimate.quota || 0) - (estimate.usage || 0), 0);
        limits.studentNames.maxBytes = Math.floor(availableBytes * 0.6);
      }

      return limits;
    }
  } catch (e) {
    logger.warn('failed to get extension storage quota.', e.message);
  }

  return cloneLimits();
}

/** Fetches limits once and caches in DEFAULT_LIMITS. */
export async function initializeLimits() {
  DEFAULT_LIMITS = await getDefaultLimits();
}

/** Approximate byte count of a JSON value (UTF-16 length * 2). */
export function estimateBytes(value) {
  try {
    const json = JSON.stringify(value || {});
    return json.length * 2;
  } catch (e) {
    return 0;
  }
}

/** Ensures a meta object has a `lastUsed` map, creating one if missing. */
export function ensureMeta(meta) {
  const normalized = meta && typeof meta === 'object' ? meta : {};
  if (!normalized.lastUsed || typeof normalized.lastUsed !== 'object') {
    normalized.lastUsed = {};
  }
  return normalized;
}

/** Removes stale lastUsed entries whose keys no longer exist in the map. */
export function normalizeMetaKeys(map, meta) {
  const normalized = ensureMeta(meta);
  const mapKeys = new Set(Object.keys(map || {}));
  Object.keys(normalized.lastUsed).forEach((key) => {
    if (!mapKeys.has(key)) {
      delete normalized.lastUsed[key];
    }
  });
  return normalized;
}

/** Records `now` as the last-used timestamp for each key in `keys`. */
export function touchMeta(meta, keys, now = Date.now()) {
  const normalized = ensureMeta(meta);
  if (!Array.isArray(keys)) return normalized;
  keys.forEach((key) => {
    if (key) normalized.lastUsed[key] = now;
  });
  return normalized;
}

/**
 * Evicts the least-recently-used entries from a map until both
 * maxEntries and maxBytes constraints are satisfied. Returns the
 * cleaned map, meta, and a list of pruned keys.
 */
export function pruneLruMap(map, meta, limits) {
  const capped = limits || {};
  const maxEntries = Number.isFinite(capped.maxEntries) ? capped.maxEntries : Infinity;
  const maxBytes = Number.isFinite(capped.maxBytes) ? capped.maxBytes : Infinity;

  const workingMap = map && typeof map === 'object' ? { ...map } : {};
  let workingMeta = normalizeMetaKeys(workingMap, meta);

  const keys = Object.keys(workingMap);
  let currentBytes = estimateBytes(workingMap);

  // Early exit if within all limits
  if (keys.length <= maxEntries && currentBytes <= maxBytes) {
    return { map: workingMap, meta: workingMeta, prunedKeys: [] };
  }

  // Sort entries by last-used timestamp (oldest first)
  const lastUsed = workingMeta.lastUsed || {};
  const sortable = keys.map((key) => ({
    key,
    ts: typeof lastUsed[key] === 'number' ? lastUsed[key] : 0
  }));

  sortable.sort((a, b) => a.ts - b.ts);

  // Evict oldest entries until within limits
  const prunedKeys = [];
  let index = 0;
  while ((Object.keys(workingMap).length > maxEntries || currentBytes > maxBytes) && index < sortable.length) {
    const removeKey = sortable[index].key;
    delete workingMap[removeKey];
    delete workingMeta.lastUsed[removeKey];
    prunedKeys.push(removeKey);
    currentBytes = estimateBytes(workingMap);
    index += 1;
  }

  return { map: workingMap, meta: workingMeta, prunedKeys };
}

/** Convenience wrapper: prunes the savedPoints map. */
export function pruneSavedPoints(map, meta, limits) {
  return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.savedPoints);
}

/** Convenience wrapper: prunes the studentNames map. */
export function pruneStudentNames(map, meta, limits) {
  return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.studentNames);
}

/**
 * Writes student names to chrome.storage.local with automatic LRU pruning
 * and last-used timestamp updates.
 */
export function saveStudentNamesWithPrune(students, callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (typeof callback === 'function') callback();
    return;
  }

  // Read existing meta, merge new timestamps, prune, and write
  chrome.storage.local.get({ studentNamesMeta: { lastUsed: {} } }, (data) => {
    const meta = touchMeta(data.studentNamesMeta || { lastUsed: {} }, Object.keys(students));
    const pruned = pruneStudentNames(students, meta);

    chrome.storage.local.set({ studentNames: pruned.map, studentNamesMeta: pruned.meta }, () => {
      if (chrome.runtime && chrome.runtime.lastError) {
        logger.warn('failed saving studentNames.', chrome.runtime.lastError.message);
      }
      if (pruned.prunedKeys && pruned.prunedKeys.length) {
        logger.warn('pruned studentNames entries.', pruned.prunedKeys.length);
      }
      if (typeof callback === 'function') callback();
    });
  });
}
