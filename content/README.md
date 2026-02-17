# Content Scripts

This directory contains scripts that run in the **content script context**. These scripts have access to Chrome extension APIs (like `chrome.storage`) and can communicate with the extension background/popup, but they **cannot** directly modify the page DOM beyond inserting scripts (due to security sandboxing).

## Script Files

### `loader-speedgrader.js` (Primary Content Script)
The main content script for the SpeedGrader context:
- Initializes storage limits via `shared/storage-utils.js`
- Injects `page/speedgrader.js` into the page context with settings via data attribute
- Listens for messages from the page script and handles storage operations:
  - `CSH_SAVE_POINTS` - Save point values to sync storage
  - `CSH_TOUCH_POINTS` - Update point metadata (last used)
  - `CSH_TOUCH_STUDENT_NAME` - Update student name metadata (last used)
  - `CSH_CLEAR_QUEUED_STUDENT` - Clear cached student name
- Listens for Chrome storage changes and notifies the page when settings update

### `grading-queue.js`
Runs on PowerApps Grading Queue pages to:
- Capture the current student name from the queue
- Store it in local storage so the SpeedGrader page can reference it

Runs with `all_frames: true` to reach nested iframes within PowerApps.

### `powerapps-domain-monitor.js`
Security monitoring for PowerApps domains to:
- Validate that iframe content loads from expected PowerApps domains
- Log warnings if unexpected domains are detected

## Manifest Configuration

The manifest defines three content script contexts:

1. **SpeedGrader Pages** (`https://*.instructure.com/courses/*/gradebook/speed_grader*`)
   - Loads: `shared/message-types.js`, `shared/settings.js`, `shared/storage-utils.js`, `content/loader-speedgrader.js`
   - Runs at: `document_idle`

2. **PowerApps Runtime** (`https://runtime-app.powerapps.com/*`, `https://runtime-app.powerplatform.com/*`)
   - Loads: `shared/storage-utils.js`, `content/grading-queue.js`
   - Runs at: `document_end`
   - `all_frames: true` to capture queue in iframes

3. **PowerApps Domains** (`https://apps.powerapps.com/*`)
   - Loads: `powerapps-domain-monitor.js`
   - Runs at: `document_end`

## Dependencies

- Content scripts depend on `shared/message-types.js` and `shared/settings.js`
- Both content scripts and extension UI use `shared/storage-utils.js` for storage quota management

## Cross-Context Communication

Content scripts bridge the extension and page contexts:
- **Receive** messages from page via `window.postMessage()` (CSH_SAVE_POINTS, CSH_TOUCH_*, CSH_CLEAR_*)
- **Send** messages to page via `window.postMessage()` (CSH_UPDATE_SETTINGS)
- **Communicate** with extension UI via `chrome.storage` API
