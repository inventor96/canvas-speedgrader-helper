'use strict';

import { logger } from './logger.js';

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

export async function getDefaultLimits() {
  const cloneLimits = () => ({
    savedPoints: { ...FALLBACK_LIMITS.savedPoints },
    studentNames: { ...FALLBACK_LIMITS.studentNames }
  });

  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const limits = cloneLimits();

      const getBytesInUse = (area) => new Promise((resolve) => {
        if (!area || typeof area.getBytesInUse !== 'function') return resolve(null);
        area.getBytesInUse(null, (bytes) => {
          if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
          resolve(typeof bytes === 'number' ? bytes : null);
        });
      });

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

      const localArea = chrome.storage.local;
      const localQuota = localArea && Number.isFinite(localArea.QUOTA_BYTES) ? localArea.QUOTA_BYTES : null;
      if (localQuota !== null) {
        const localUsage = await getBytesInUse(localArea);
        if (localUsage !== null) {
          const availableLocal = Math.max(localQuota - localUsage, 0);
          limits.studentNames.maxBytes = Math.floor(availableLocal * 0.6);
        }
      }

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

export async function initializeLimits() {
  DEFAULT_LIMITS = await getDefaultLimits();
}

export function estimateBytes(value) {
  try {
    const json = JSON.stringify(value || {});
    return json.length * 2;
  } catch (e) {
    return 0;
  }
}

export function ensureMeta(meta) {
  const normalized = meta && typeof meta === 'object' ? meta : {};
  if (!normalized.lastUsed || typeof normalized.lastUsed !== 'object') {
    normalized.lastUsed = {};
  }
  return normalized;
}

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

export function touchMeta(meta, keys, now = Date.now()) {
  const normalized = ensureMeta(meta);
  if (!Array.isArray(keys)) return normalized;
  keys.forEach((key) => {
    if (key) normalized.lastUsed[key] = now;
  });
  return normalized;
}

export function pruneLruMap(map, meta, limits) {
  const capped = limits || {};
  const maxEntries = Number.isFinite(capped.maxEntries) ? capped.maxEntries : Infinity;
  const maxBytes = Number.isFinite(capped.maxBytes) ? capped.maxBytes : Infinity;

  const workingMap = map && typeof map === 'object' ? { ...map } : {};
  let workingMeta = normalizeMetaKeys(workingMap, meta);

  const keys = Object.keys(workingMap);
  let currentBytes = estimateBytes(workingMap);

  if (keys.length <= maxEntries && currentBytes <= maxBytes) {
    return { map: workingMap, meta: workingMeta, prunedKeys: [] };
  }

  const lastUsed = workingMeta.lastUsed || {};
  const sortable = keys.map((key) => ({
    key,
    ts: typeof lastUsed[key] === 'number' ? lastUsed[key] : 0
  }));

  sortable.sort((a, b) => a.ts - b.ts);

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

export function pruneSavedPoints(map, meta, limits) {
  return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.savedPoints);
}

export function pruneStudentNames(map, meta, limits) {
  return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.studentNames);
}

export function saveStudentNamesWithPrune(students, callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (typeof callback === 'function') callback();
    return;
  }

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


