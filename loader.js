(() => {
  const storageUtils = (typeof CSHStorageUtils !== 'undefined') ? CSHStorageUtils : null;

  // Initialize storage limits based on browser quota
  if (storageUtils && typeof storageUtils.initializeLimits === 'function') {
    storageUtils.initializeLimits().catch((e) => {
      // Silently ignore initialization errors; fallback limits will be used
    });
  }

  function logStorageWarning(message, detail) {
    try {
      if (detail) {
        console.warn(message, detail);
      } else {
        console.warn(message);
      }
    } catch (e) {
      // ignore
    }
  }

  // Inject the page script with settings via a data attribute.
  function inject(settings) {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page.js');
    script.type = 'text/javascript';
    try {
      script.dataset.settings = JSON.stringify(settings);
    } catch (e) {
      // ignore
    }
    script.onload = () => script.remove();
    document.documentElement.appendChild(script);
  }

  // Helper to read synced settings.
  function getSync(cb) {
    if (chrome.storage.sync && chrome.storage.sync.get) {
      chrome.storage.sync.get(SYNCED_SETTINGS, cb);
    } else {
      cb(SYNCED_SETTINGS);
    }
  }

  // Helper to read local (non-synced) settings.
  function getLocal(cb) {
    if (chrome.storage.local && chrome.storage.local.get) {
      chrome.storage.local.get(LOCAL_SETTINGS, cb);
    } else {
      cb(LOCAL_SETTINGS);
    }
  }

  function mergeWithDefaults(defaults, data) {
    const merged = {};
    Object.keys(defaults).forEach((key) => {
      if (data && Object.prototype.hasOwnProperty.call(data, key)) {
        merged[key] = data[key];
      } else {
        merged[key] = defaults[key];
      }
    });
    return merged;
  }

  // Helper to get all settings as a merged object.
  function getAllSettings(cb) {
    getSync((syncData) => {
      getLocal((localData) => {
        const syncedSettings = mergeWithDefaults(SYNCED_SETTINGS, syncData);
        const localSettings = mergeWithDefaults(LOCAL_SETTINGS, localData);
        const settings = {
          ...syncedSettings,
          ...localSettings,
        };
        cb(settings);
      });
    });
  }

  if (typeof chrome !== 'undefined' && chrome.storage) {
    // Read synced settings first, then local (non-synced) student name map, then merge.
    getAllSettings((settings) => {
      inject(settings);
    });
  } else {
    inject({
      ...SYNCED_SETTINGS,
      ...LOCAL_SETTINGS,
    });
  }

  // Listen for messages from page script to save points data
  window.addEventListener('message', (event) => {
    try {
      // Validate message origin
      if (!event || event.source !== window) return;

      // Validate message type
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === 'CSH_SAVE_POINTS') {
        // Get points to save
        const pointsToSave = msg.pointsToSave || {};
        if (Object.keys(pointsToSave).length === 0) return;

        // Read current savedPoints from storage
        if (chrome.storage && chrome.storage.sync) {
          chrome.storage.sync.get({ savedPoints: {}, savedPointsMeta: { lastUsed: {} } }, (data) => {
            const currentPoints = data.savedPoints || {};
            const currentMeta = data.savedPointsMeta || { lastUsed: {} };

            // Merge new points with existing points
            const mergedPoints = {
              ...currentPoints,
              ...pointsToSave
            };

            if (storageUtils) {
              const touchedMeta = storageUtils.touchMeta(currentMeta, Object.keys(pointsToSave));
              const pruned = storageUtils.pruneSavedPoints(mergedPoints, touchedMeta);

              chrome.storage.sync.set({
                savedPoints: pruned.map,
                savedPointsMeta: pruned.meta
              }, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  logStorageWarning('CSH storage warning: failed saving savedPoints.', chrome.runtime.lastError.message);
                }
                if (pruned.prunedKeys && pruned.prunedKeys.length) {
                  logStorageWarning('CSH storage warning: pruned savedPoints entries.', pruned.prunedKeys.length);
                }
              });
            } else {
              // Save back to storage without pruning
              chrome.storage.sync.set({ savedPoints: mergedPoints }, () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                  logStorageWarning('CSH storage warning: failed saving savedPoints.', chrome.runtime.lastError.message);
                }
              });
            }
          });
        }
        return;
      }

      if (msg.type === 'CSH_TOUCH_POINTS') {
        if (!storageUtils || !chrome.storage || !chrome.storage.sync) return;
        const keys = Array.isArray(msg.keys) ? msg.keys : [];
        if (keys.length === 0) return;

        chrome.storage.sync.get({ savedPoints: {}, savedPointsMeta: { lastUsed: {} } }, (data) => {
          const currentPoints = data.savedPoints || {};
          const currentMeta = data.savedPointsMeta || { lastUsed: {} };
          const touched = storageUtils.touchMeta(currentMeta, keys);
          const normalized = storageUtils.normalizeMetaKeys(currentPoints, touched);
          chrome.storage.sync.set({ savedPointsMeta: normalized }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              logStorageWarning('CSH storage warning: failed touching savedPoints.', chrome.runtime.lastError.message);
            }
          });
        });
        return;
      }

      if (msg.type === 'CSH_TOUCH_STUDENT_NAME') {
        if (!storageUtils || !chrome.storage || !chrome.storage.local) return;
        const key = msg.key;
        if (!key) return;

        chrome.storage.local.get({ studentNames: {}, studentNamesMeta: { lastUsed: {} } }, (data) => {
          const currentNames = data.studentNames || {};
          const currentMeta = data.studentNamesMeta || { lastUsed: {} };
          const touched = storageUtils.touchMeta(currentMeta, [key]);
          const normalized = storageUtils.normalizeMetaKeys(currentNames, touched);
          chrome.storage.local.set({ studentNamesMeta: normalized }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              logStorageWarning('CSH storage warning: failed touching studentNames.', chrome.runtime.lastError.message);
            }
          });
        });
      }
      return;
    } catch (e) {
      // ignore errors
    }
  });

  // Listen for storage changes and propagate updates to the page script.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      const changeKeys = Object.keys(changes || {});
      const nonMetaKeys = changeKeys.filter((key) => key !== 'savedPointsMeta' && key !== 'studentNamesMeta');
      if (nonMetaKeys.length === 0) return;

      // Build a compact diff for studentNames if present so the page can update in-place.
      let studentNameChanges = null;
      if (changes.studentNames) {
        const oldMap = changes.studentNames.oldValue || {};
        const newMap = changes.studentNames.newValue || {};
        const keys = new Set([...Object.keys(oldMap), ...Object.keys(newMap)]);
        studentNameChanges = {};
        keys.forEach((k) => {
          const oldV = oldMap[k];
          const newV = newMap[k];
          if (oldV !== newV) {
            studentNameChanges[k] = { old: oldV, new: newV };
          }
        });
      }

      // Read current settings and postMessage to the page.
      getAllSettings((settings) => {
        try {
          window.postMessage({ type: 'CSH_UPDATE_SETTINGS', settings, studentNameChanges }, '*');
        } catch (e) {
          // ignore
        }
      });
    });
  }
})();
