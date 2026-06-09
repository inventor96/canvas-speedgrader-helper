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

  let closeSpeedgraderTabAfterSubmitCommentEnabled = false;
  let autoCompleteQueueItemAfterCommentSubmitEnabled = false;
  let autoOpenNextQueueItemAfterCompleteEnabled = false;
  let closeOnSubmitCommentListenerAttached = false;
  let closeOnSubmitCommentPending = false;

  function getPersistedCommentCount() {
    const commentElements = document.querySelectorAll('div[data-testid^="comment-"]');
    return Array.from(commentElements).filter((el) => {
      const testId = el.getAttribute('data-testid') || '';
      return /^comment-\d+$/.test(testId);
    }).length;
  }

  function waitForPersistedCommentCountIncrease(previousCount, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const hasIncreased = () => getPersistedCommentCount() > previousCount;

      if (hasIncreased()) {
        resolve(true);
        return;
      }

      let finished = false;

      const finish = (result) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(result);
      };

      const observer = new MutationObserver(() => {
        if (hasIncreased()) {
          finish(true);
        }
      });

      observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true,
      });

      const timeoutId = setTimeout(() => finish(false), timeoutMs);
    });
  }

  function attachCloseOnSubmitCommentListener() {
    if (closeOnSubmitCommentListenerAttached) return;
    closeOnSubmitCommentListenerAttached = true;

    // Delegate on document so behavior survives Canvas UI re-renders.
    document.addEventListener('click', async (event) => {
      const submitCommentButton = event.target.closest('button[data-testid="submit-comment-button"]');
      if (!submitCommentButton) return;
      // Only proceed if at least one relevant setting is enabled
      if (!closeSpeedgraderTabAfterSubmitCommentEnabled && !autoCompleteQueueItemAfterCommentSubmitEnabled) return;
      if (closeOnSubmitCommentPending) return;

      closeOnSubmitCommentPending = true;
      const previousCount = getPersistedCommentCount();

      const commentAppeared = await waitForPersistedCommentCountIncrease(previousCount);
      closeOnSubmitCommentPending = false;

      if (!commentAppeared) return;

      if (!chrome.runtime || !chrome.runtime.sendMessage) return;

      // Handle close tab setting
      if (closeSpeedgraderTabAfterSubmitCommentEnabled) {
        chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
          void chrome.runtime?.lastError;
        });
      }

      // Handle auto-complete queue item setting
      if (autoCompleteQueueItemAfterCommentSubmitEnabled) {
        const studentName = getCurrentCanvasStudentFullName();
        if (studentName) {
          chrome.runtime.sendMessage({
            type: CSH_MESSAGE_TYPES.CLICK_QUEUE_COMPLETE_AFTER_COMMENT,
            queuedName: studentName,
            autoOpenNextQueueItemAfterComplete: autoOpenNextQueueItemAfterCompleteEnabled,
          }, () => {
            void chrome.runtime?.lastError;
          });
        }
      }
    }, true);
  }

  const SubmitCommentPopup = (() => {
    let _el = null;
    let _hideTimer = null;
    const HIDE_DELAY_MS = 1500;

    function _isPopup(node) {
      if (!_el || !node) return false;
      return node === _el || (typeof _el.contains === 'function' && _el.contains(node));
    }

    function _isSubmitButton(node) {
      return !!(node && typeof node.closest === 'function' && node.closest('button[data-testid="submit-comment-button"]'));
    }

    function _cancelHideTimer() {
      if (_hideTimer !== null) {
        clearTimeout(_hideTimer);
        _hideTimer = null;
      }
    }

    function _startHideTimer() {
      _cancelHideTimer();
      _hideTimer = setTimeout(() => {
        if (_el) _el.style.display = 'none';
      }, HIDE_DELAY_MS);
    }

    function _show(buttonEl) {
      if (!_el) return;
      const rect = buttonEl.getBoundingClientRect();
      _el.style.left = 'auto';
      _el.style.right = (window.innerWidth - rect.right) + 'px';
      _el.style.top = rect.top + 'px';
      _el.style.display = 'block';
      // Sync checkboxes from current runtime vars
      const cbClose = document.getElementById('csh-close-tab-cb');
      const cbComplete = document.getElementById('csh-complete-queue-cb');
      const cbNext = document.getElementById('csh-open-next-cb');
      if (cbClose) cbClose.checked = closeSpeedgraderTabAfterSubmitCommentEnabled;
      if (cbComplete) cbComplete.checked = autoCompleteQueueItemAfterCommentSubmitEnabled;
      if (cbNext) cbNext.checked = autoOpenNextQueueItemAfterCompleteEnabled;
    }

    function _create() {
      const el = document.createElement('div');
      el.id = 'csh-submit-popup';
      el.style.cssText = [
        'position:fixed',
        'z-index:99999',
        'background:#fff',
        'border:1px solid #c7cdd1',
        'border-radius:4px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
        'padding:8px 12px',
        'display:none',
        'transform:translateY(calc(-100% - 8px))',
        'min-width:220px',
        'font-size:13px',
        'line-height:1.5',
        'color:#2d3b45',
        'font-family:Lato,LatoWeb,sans-serif',
        'user-select:none',
      ].join(';');

      function makeRow(id, labelText) {
        const label = document.createElement('label');
        label.style.cssText = 'display:flex;align-items:center;gap:7px;cursor:pointer;padding:2px 0;white-space:nowrap;';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = id;
        cb.style.cssText = 'margin:0;cursor:pointer;flex-shrink:0;';
        const span = document.createElement('span');
        span.textContent = labelText;
        label.appendChild(cb);
        label.appendChild(span);
        return label;
      }

      el.appendChild(makeRow('csh-close-tab-cb', 'Close tab on comment submission'));
      el.appendChild(makeRow('csh-complete-queue-cb', 'Click "Complete" in the queue'));
      el.appendChild(makeRow('csh-open-next-cb', 'Start next queue submission'));

      el.addEventListener('change', (event) => {
        const cb = event.target;
        if (!cb || cb.type !== 'checkbox') return;
        if (cb.id === 'csh-close-tab-cb') {
          closeSpeedgraderTabAfterSubmitCommentEnabled = cb.checked;
        } else if (cb.id === 'csh-complete-queue-cb') {
          autoCompleteQueueItemAfterCommentSubmitEnabled = cb.checked;
        } else if (cb.id === 'csh-open-next-cb') {
          autoOpenNextQueueItemAfterCompleteEnabled = cb.checked;
        }
      });

      document.body.appendChild(el);
      return el;
    }

    function init() {
      if (_el) return;
      _el = _create();

      document.addEventListener('mouseover', (event) => {
        if (_isSubmitButton(event.target)) {
          _cancelHideTimer();
          if (_el.style.display === 'none') {
            const btn = event.target.closest('button[data-testid="submit-comment-button"]');
            _show(btn);
          }
          return;
        }
        if (_isPopup(event.target)) {
          _cancelHideTimer();
        }
      });

      document.addEventListener('mouseout', (event) => {
        if (!_el || _el.style.display === 'none') return;
        const leaving = event.target;
        const entering = event.relatedTarget;
        if (!_isSubmitButton(leaving) && !_isPopup(leaving)) return;
        if (_isSubmitButton(entering) || _isPopup(entering)) return;
        _startHideTimer();
      });
    }

    return { init };
  })();

  function initializeCloseOnSubmitCommentSetting() {
    if (!chrome.storage || !chrome.storage.sync || !chrome.storage.sync.get) {
      attachCloseOnSubmitCommentListener();
      return;
    }

    chrome.storage.sync.get({
      closeSpeedgraderTabAfterSubmitComment: false,
      autoCompleteQueueItemAfterCommentSubmit: false,
      autoOpenNextQueueItemAfterComplete: false,
    }, (data) => {
      closeSpeedgraderTabAfterSubmitCommentEnabled = !!data.closeSpeedgraderTabAfterSubmitComment;
      autoCompleteQueueItemAfterCommentSubmitEnabled = !!data.autoCompleteQueueItemAfterCommentSubmit;
      autoOpenNextQueueItemAfterCompleteEnabled = !!data.autoOpenNextQueueItemAfterComplete;
      attachCloseOnSubmitCommentListener();
      SubmitCommentPopup.init();
    });
  }

  // Inject the page script with settings via a data attribute.
  function inject(settings) {
    // First inject the shared message types so speedgrader.js can access them
    const typeScript = document.createElement('script');
    typeScript.src = chrome.runtime.getURL('shared/message-types.js');
    typeScript.type = 'text/javascript';
    typeScript.onload = () => {
      // After message types are loaded, inject adapter and dispatcher
      const adapterScript = document.createElement('script');
      adapterScript.src = chrome.runtime.getURL('page/submission-adapters/iframe-submission-adapter.js');
      adapterScript.type = 'text/javascript';
      adapterScript.onload = () => {
        // After adapter is loaded, inject dispatcher
        const dispatcherScript = document.createElement('script');
        dispatcherScript.src = chrome.runtime.getURL('page/submission-dispatcher.js');
        dispatcherScript.type = 'text/javascript';
        dispatcherScript.onload = () => {
          // After dispatcher is loaded, inject the page script with settings
          const script = document.createElement('script');
          script.src = chrome.runtime.getURL('page/speedgrader.js');
          script.type = 'text/javascript';
          try {
            script.dataset.settings = JSON.stringify(settings);
          } catch (e) {
            // ignore
          }
          script.onload = () => script.remove();
          document.head.appendChild(script);
        };
        document.head.appendChild(dispatcherScript);
      };
      document.head.appendChild(adapterScript);
    };
    document.head.appendChild(typeScript);
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

  function getCurrentCanvasStudentFullName() {
    const selectedStudent = document.querySelector(
      'button[data-testid="student-select-trigger"] [data-testid="selected-student"]'
    );
    let fullName = selectedStudent?.textContent?.trim() || '';

    if (!fullName) {
      return '';
    }

    // Canvas can truncate long names with an ellipsis; use the name attribute fallback when present.
    if (fullName.endsWith('…')) {
      try {
        const truncatedName = fullName.slice(0, -1).trim();
        if (truncatedName) {
          const fullNameElement = document.querySelector(
            `button[data-testid="student-select-trigger"] [name^="${truncatedName}"]`
          );
          const attrName = fullNameElement?.getAttribute('name');
          if (attrName && attrName.trim()) {
            fullName = attrName.trim();
          }
        }
      } catch (e) {
        // Keep the visible value if the fallback query fails.
      }
    }

    return fullName;
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

  function handleSameGroupGradingStatus(queuedName, isGraded) {
    if (!chrome.runtime || !chrome.runtime.sendMessage) return;

    if (isGraded) {
      chrome.storage.sync.get(['autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded'], (data) => {
        if (data.autoCloseSpeedgraderTabWhenGroupMatchedAndUngraded) {
          chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
            void chrome.runtime?.lastError;
          });
        }
      });
    }

    chrome.runtime.sendMessage({
      type: CSH_MESSAGE_TYPES.GROUPS_CHECK_GRADING_STATUS,
      queuedName: queuedName || '',
      sameGroup: true,
      isGraded: !!isGraded,
    }, () => {
      void chrome.runtime?.lastError;
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

  initializeCloseOnSubmitCommentSetting();

  // Listen for messages from page script to save points data
  window.addEventListener('message', (event) => {
    try {
      // Validate message origin
      if (!event || event.source !== window) return;

      // Validate message type
      const msg = event.data;
      if (!msg || !msg.type) return;

      if (msg.type === CSH_MESSAGE_TYPES.SAVE_POINTS) {
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

      if (msg.type === CSH_MESSAGE_TYPES.TOUCH_POINTS) {
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

      if (msg.type === CSH_MESSAGE_TYPES.TOUCH_STUDENT_NAME) {
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
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.CLEAR_QUEUED_STUDENT) {
        if (!chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.remove('queuedStudentName', () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logStorageWarning('CSH storage warning: failed clearing queuedStudentName.', chrome.runtime.lastError.message);
          }
        });
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.SAVE_STUDENT_NAME) {
        const studentId = typeof msg.studentId === 'string' ? msg.studentId : '';
        const preferredName = typeof msg.preferredName === 'string' ? msg.preferredName : '';
        if (!studentId || !preferredName) return;
        if (!chrome.storage || !chrome.storage.local) return;

        chrome.storage.local.get({ studentNames: {}, studentNamesMeta: { lastUsed: {} } }, (data) => {
          const studentNames = data.studentNames || {};
          const currentMeta = data.studentNamesMeta || { lastUsed: {} };
          studentNames[studentId] = preferredName;
          const touched = storageUtils
            ? storageUtils.touchMeta(currentMeta, [studentId])
            : currentMeta;

          chrome.storage.local.set({ studentNames, studentNamesMeta: touched }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
              logStorageWarning('CSH storage warning: failed saving student name.', chrome.runtime.lastError.message);
            }
          });
        });
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.START_GROUPS_CHECK) {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;
        const queuedName = typeof msg.queuedName === 'string' ? msg.queuedName : '';
        const speedgraderName = typeof msg.speedgraderName === 'string' ? msg.speedgraderName : '';
        const noAutoClose = !!msg.noAutoClose;
        chrome.runtime.sendMessage({
          type: CSH_MESSAGE_TYPES.START_GROUPS_CHECK,
          queuedName,
          speedgraderName,
          noAutoClose,
        }, (response) => {
          if (chrome.runtime && chrome.runtime.lastError) {
            logStorageWarning('CSH groups check warning: failed starting groups check.', chrome.runtime.lastError.message);
            try {
              window.postMessage({
                type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
                queuedName,
                speedgraderName,
                sameGroup: false,
                groupsCount: 0,
                error: chrome.runtime.lastError.message,
              }, '*');
            } catch (e) {
              // ignore
            }
            return;
          }

          if (response && response.ok) return;

          try {
            window.postMessage({
              type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
              queuedName,
              speedgraderName,
              sameGroup: false,
              groupsCount: 0,
              error: (response && response.error) ? response.error : 'Failed to open groups page.',
            }, '*');
          } catch (e) {
            // ignore
          }
        });
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT) {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;

        chrome.runtime.sendMessage({
          type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_UPSERT,
          courseId: msg.courseId,
          assignmentId: msg.assignmentId,
          studentId: msg.studentId,
        }, () => {
          void chrome.runtime?.lastError;
        });
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP) {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;

        chrome.runtime.sendMessage({
          type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP,
          requestId: msg.requestId,
          courseId: msg.courseId,
          assignmentId: msg.assignmentId,
          studentId: msg.studentId,
        }, (response) => {
          const error = chrome.runtime?.lastError?.message || (response && response.error) || null;

          try {
            window.postMessage({
              type: CSH_MESSAGE_TYPES.GROUP_TRIPLET_CACHE_LOOKUP_RESULT,
              requestId: msg.requestId,
              courseId: msg.courseId || '',
              assignmentId: msg.assignmentId || '',
              studentId: msg.studentId || '',
              hit: !!response?.hit,
              createdAt: response?.createdAt || null,
              error,
            }, '*');
          } catch (e) {
            // ignore
          }
        });
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.TRIGGER_GROUP_MATCH_GRADING_STATUS) {
        handleSameGroupGradingStatus(msg.queuedName || '', !!msg.isGraded);
        return;
      }

      if (msg.type === CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB) {
        if (!chrome.runtime || !chrome.runtime.sendMessage) return;

        chrome.runtime.sendMessage({ type: CSH_MESSAGE_TYPES.CLOSE_SPEEDGRADER_TAB }, () => {
          void chrome.runtime?.lastError;
        });
      }
      return;
    } catch (e) {
      // ignore errors
    }
  });

  if (chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      try {
        if (msg && msg.type === CSH_MESSAGE_TYPES.POPUP_JUMP_TO_STUDENT_GROUPS) {
          const canvasFullName = getCurrentCanvasStudentFullName();
          if (!canvasFullName) {
            sendResponse({ ok: false, error: 'Could not determine the current Canvas student name.' });
            return;
          }

          if (!chrome.runtime || !chrome.runtime.sendMessage) {
            sendResponse({ ok: false, error: 'Runtime messaging is not available.' });
            return;
          }

          chrome.runtime.sendMessage({
            type: CSH_MESSAGE_TYPES.START_GROUPS_CHECK,
            queuedName: canvasFullName,
            speedgraderName: canvasFullName,
            noAutoClose: true,
          }, (response) => {
            if (chrome.runtime && chrome.runtime.lastError) {
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }

            if (!response || !response.ok) {
              sendResponse({
                ok: false,
                error: (response && response.error) ? response.error : 'Could not open groups page.',
              });
              return;
            }

            sendResponse({ ok: true, studentName: canvasFullName });
          });

          return true;
        }

        if (!msg || msg.type !== CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT) return;

        const sameGroup = !!msg.sameGroup;
        const isGraded = !!document.querySelector('[data-testid="graded-icon"]');

        if (sameGroup) {
          handleSameGroupGradingStatus(msg.queuedName || '', isGraded);
        }

        window.postMessage({
          type: CSH_MESSAGE_TYPES.GROUPS_CHECK_RESULT,
          queuedName: msg.queuedName || '',
          speedgraderName: msg.speedgraderName || '',
          sameGroup,
          isGraded,
          matchedGroupHeader: msg.matchedGroupHeader || '',
          groupsCount: Number.isFinite(msg.groupsCount) ? msg.groupsCount : 0,
          error: msg.error || null,
          checkedAt: msg.checkedAt || Date.now(),
        }, '*');
      } catch (e) {
        // ignore
      }
    });
  }

  // Listen for storage changes and propagate updates to the page script.
  if (chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.closeSpeedgraderTabAfterSubmitComment) {
        closeSpeedgraderTabAfterSubmitCommentEnabled = !!changes.closeSpeedgraderTabAfterSubmitComment.newValue;
      }

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
          window.postMessage({ type: CSH_MESSAGE_TYPES.UPDATE_SETTINGS, settings, studentNameChanges }, '*');
        } catch (e) {
          // ignore
        }
      });
    });
  }
})();
