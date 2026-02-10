(() => {
  'use strict';

  // Fallback limits used until browser quota is available
  const FALLBACK_LIMITS = {
    savedPoints: {
      maxEntries: 5000, // Probably closer to like 70 in practice
      maxBytes: 8 * 1024,
    },
    studentNames: {
      maxEntries: 10000,
      maxBytes: 128 * 1024,
    },
  };

  // DEFAULT_LIMITS will be populated by initializeLimits()
  let DEFAULT_LIMITS = { ...FALLBACK_LIMITS };

  /** Get limits based on extension storage quotas */
  async function getDefaultLimits() {
    // Clone the fallback limits so we can safely override byte caps.
    const cloneLimits = () => ({
      savedPoints: { ...FALLBACK_LIMITS.savedPoints },
      studentNames: { ...FALLBACK_LIMITS.studentNames }
    });

    try {
      if (typeof chrome !== 'undefined' && chrome.storage) {
        // Step 1: start from safe defaults and only override byte caps when quotas are known.
        const limits = cloneLimits();

        // Wrap storage.getBytesInUse into a promise and return null on failure.
        const getBytesInUse = (area) => new Promise((resolve) => {
          if (!area || typeof area.getBytesInUse !== 'function') return resolve(null);
          area.getBytesInUse(null, (bytes) => {
            if (chrome.runtime && chrome.runtime.lastError) return resolve(null);
            resolve(typeof bytes === 'number' ? bytes : null);
          });
        });

        // Step 2: compute sync quota headroom for savedPoints (sync storage).
        const syncArea = chrome.storage.sync;
        const syncQuota = syncArea && Number.isFinite(syncArea.QUOTA_BYTES) ? syncArea.QUOTA_BYTES : null;
        const syncItemQuota = syncArea && Number.isFinite(syncArea.QUOTA_BYTES_PER_ITEM) ? syncArea.QUOTA_BYTES_PER_ITEM : null;
        if (syncQuota !== null) {
          const syncUsage = await getBytesInUse(syncArea);
          if (syncUsage !== null) {
            const availableSync = Math.max(syncQuota - syncUsage, 0);
            // Allocate 80% of available sync quota to savedPoints
            let savedPointsBytes = Math.floor(availableSync * 0.8);
            // savedPoints is stored as a single sync item; enforce the per-item cap.
            if (syncItemQuota !== null) {
              savedPointsBytes = Math.min(savedPointsBytes, syncItemQuota);
            }
            limits.savedPoints.maxBytes = savedPointsBytes;
          }
        }

        // Step 3: compute local quota headroom for studentNames (local storage).
        const localArea = chrome.storage.local;
        const localQuota = localArea && Number.isFinite(localArea.QUOTA_BYTES) ? localArea.QUOTA_BYTES : null;
        if (localQuota !== null) {
          const localUsage = await getBytesInUse(localArea);
          if (localUsage !== null) {
            const availableLocal = Math.max(localQuota - localUsage, 0);
            // Allocate 60% of available local quota to studentNames
            limits.studentNames.maxBytes = Math.floor(availableLocal * 0.6);
          }
        }

        // Step 4: if local quota is unknown, try navigator estimate in extension pages only.
        if (localQuota === null && typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate && typeof location !== 'undefined' && location.protocol === 'chrome-extension:') {
          const estimate = await navigator.storage.estimate();
          const availableBytes = Math.max((estimate.quota || 0) - (estimate.usage || 0), 0);
          // Only use this fallback for extension pages, not content scripts.
          limits.studentNames.maxBytes = Math.floor(availableBytes * 0.6);
        }

        return limits;
      }
    } catch (e) {
      console.warn('CSH storage warning: failed to get extension storage quota.', e.message);
    }

    // Return fallback limits if API unavailable or on error
    return cloneLimits();
  }

  /** Initialize DEFAULT_LIMITS based on browser quota (call at startup) */
  async function initializeLimits() {
    DEFAULT_LIMITS = await getDefaultLimits();
  }

  /** Estimate the byte size of a value when stored as JSON */
  function estimateBytes(value) {
    try {
      const json = JSON.stringify(value || {});
      return json.length * 2; // Rough estimate: 2 bytes per character for UTF-16 encoding used by JavaScript strings
    } catch (e) {
      return 0;
    }
  }

  /** Ensure the meta object has the correct structure */
  function ensureMeta(meta) {
    const normalized = meta && typeof meta === 'object' ? meta : {};
    if (!normalized.lastUsed || typeof normalized.lastUsed !== 'object') {
      // If meta is missing or malformed, initialize with empty structure
      normalized.lastUsed = {};
    }
    return normalized;
  }

  /** Normalize meta keys to match the keys in the map */
  function normalizeMetaKeys(map, meta) {
    // Ensure meta has the correct structure
    const normalized = ensureMeta(meta);

    // Remove any keys from meta.lastUsed that do not exist in the map to prevent unbounded growth of meta
    const mapKeys = new Set(Object.keys(map || {}));
    Object.keys(normalized.lastUsed).forEach((key) => {
      if (!mapKeys.has(key)) {
        delete normalized.lastUsed[key];
      }
    });
    return normalized;
  }

  /** Touch the meta timestamps for the given keys */
  function touchMeta(meta, keys, now = Date.now()) {
    // Ensure meta has the correct structure
    const normalized = ensureMeta(meta);

    // If keys is not an array, do not modify meta and return as is
    if (!Array.isArray(keys)) return normalized;

    // Update the lastUsed timestamp for each key
    keys.forEach((key) => {
      if (key) normalized.lastUsed[key] = now;
    });

    return normalized;
  }

  /** Prune a map using LRU strategy based on the provided limits */
  function pruneLruMap(map, meta, limits) {
    // Determine the effective limits, using defaults if not provided
    const capped = limits || {};
    const maxEntries = Number.isFinite(capped.maxEntries) ? capped.maxEntries : Infinity;
    const maxBytes = Number.isFinite(capped.maxBytes) ? capped.maxBytes : Infinity;

    // Create a working copy of the map and meta to modify during pruning
    const workingMap = map && typeof map === 'object' ? { ...map } : {};
    let workingMeta = normalizeMetaKeys(workingMap, meta);

    // Get the keys and current byte size of the map
    const keys = Object.keys(workingMap);
    let currentBytes = estimateBytes(workingMap);

    // If the current map is already within limits, return as is without pruning
    if (keys.length <= maxEntries && currentBytes <= maxBytes) {
      return { map: workingMap, meta: workingMeta, prunedKeys: [] };
    }

    // Create a sortable array of keys based on their lastUsed timestamps for LRU pruning
    const lastUsed = workingMeta.lastUsed || {};
    const sortable = keys.map((key) => ({
      key,
      ts: typeof lastUsed[key] === 'number' ? lastUsed[key] : 0
    }));

    // Sort keys by lastUsed timestamp in ascending order (oldest first)
    sortable.sort((a, b) => a.ts - b.ts);

    // Iteratively remove the least recently used entries until within limits
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

  /** Prune savedPoints map using LRU strategy */
  function pruneSavedPoints(map, meta, limits) {
    return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.savedPoints);
  }

  /** Prune studentNames map using LRU strategy */
  function pruneStudentNames(map, meta, limits) {
    return pruneLruMap(map, meta, limits || DEFAULT_LIMITS.studentNames);
  }

  /** Save student names with pruning based on limits */
  function saveStudentNamesWithPrune(students, callback) {
    // If chrome.storage.local is not available, skip saving and pruning
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      if (typeof callback === 'function') callback();
      return;
    }

    // Read current studentNames and meta from storage
    chrome.storage.local.get({ studentNamesMeta: { lastUsed: {} } }, (data) => {
      // Touch the meta for the provided student keys to update their lastUsed timestamps
      const meta = touchMeta(data.studentNamesMeta || { lastUsed: {} }, Object.keys(students));
      const pruned = pruneStudentNames(students, meta);

      // Save pruned studentNames and meta back to storage
      chrome.storage.local.set({ studentNames: pruned.map, studentNamesMeta: pruned.meta }, () => {
        // Log warnings if there were issues during saving
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('CSH storage warning: failed saving studentNames.', chrome.runtime.lastError.message);
        }

        // Log a warning if any entries were pruned due to limits
        if (pruned.prunedKeys && pruned.prunedKeys.length) {
          console.warn('CSH storage warning: pruned studentNames entries.', pruned.prunedKeys.length);
        }

        // Invoke the callback after saving is complete
        if (typeof callback === 'function') callback();
      });
    });
  }

  // Expose utility functions globally for use in other scripts
  window.CSHStorageUtils = {
    DEFAULT_LIMITS: () => DEFAULT_LIMITS, // Function to get current limits
    initializeLimits,
    estimateBytes,
    ensureMeta,
    normalizeMetaKeys,
    touchMeta,
    pruneLruMap,
    pruneSavedPoints,
    pruneStudentNames,
    saveStudentNamesWithPrune
  };
})();
