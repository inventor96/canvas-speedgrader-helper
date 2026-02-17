# Shared Utilities

This directory contains files that are accessed by multiple contexts (content script and page script). These files should avoid context-specific APIs and focus on constants and utilities.

## Files

### `message-types.js`
Defines message type constants for inter-context communication via `window.postMessage()`.

Exports a global object `CSH_MESSAGE_TYPES` with keys:
- `SAVE_POINTS` → `'CSH_SAVE_POINTS'`
- `TOUCH_POINTS` → `'CSH_TOUCH_POINTS'`
- `TOUCH_STUDENT_NAME` → `'CSH_TOUCH_STUDENT_NAME'`
- `CLEAR_QUEUED_STUDENT` → `'CSH_CLEAR_QUEUED_STUDENT'`
- `UPDATE_SETTINGS` → `'CSH_UPDATE_SETTINGS'`

**Used by:**
- `content/loader-speedgrader.js` - Handles incoming messages and sends outgoing messages
- `page/speedgrader.js` - Sends messages to content script when user interacts with grading

**Why centralize?** Reduces hardcoding of string literals across files and makes message types easier to refactor or extend.

### `settings.js`
Defines the schema for synced and local settings used across extension UI and content scripts:
- **Synced settings** (across devices): placeholders, rubric options, saved points
- **Local settings** (device-specific): preferred student names, queued student name

Exports global objects `SYNCED_SETTINGS` and `LOCAL_SETTINGS`.

**Used by:**
- `content/loader-speedgrader.js` - To merge with defaults when reading from storage
- `extension/popup.js` - To initialize and work with settings
- `extension/options.js` - To read and write user preferences

**Why shared?** Settings schema is referenced by both extension UI and content scripts, making it a true cross-context utility.

### `storage-utils.js`
Utilities for managing browser storage quotas and LRU (Least Recently Used) pruning:
- Detects available quota from `chrome.storage.sync` and `chrome.storage.local`
- Calculates storage allocation percentages (80% for savedPoints, 60% for studentNames)
- Implements LRU pruning when storage limits exceeded
- Tracks metadata entries (like `lastUsed` timestamps) to determine which entries to remove

Exports global object `window.CSHStorageUtils` with methods:
- `initializeLimits()` - Query Chrome quota API and set allocation limits
- `pruneSavedPoints()` - Prune old point entries when over quota
- `pruneStudentNames()` - Prune old student name entries when over quota
- `touchMeta()` - Update "last used" timestamp for entry keys
- `normalizeMetaKeys()` - Clean up metadata for existing keys

**Used by:**
- `content/loader-speedgrader.js` - To initialize quota limits and handle storage operations
- `extension/popup.js` - To initialize quota limits before accessing storage
- `extension/options.js` - To initialize quota limits before reading/writing settings

**Why shared?** Used by both content scripts and extension UI for consistent storage quota management.

## Best Practices
- Keep files context-agnostic (no `chrome.*` or DOM-specific code)
- Export to the `window` object since these are loaded as plain scripts
- Avoid dependencies on other files in this directory
- Keep file sizes small and focused on a single concern
