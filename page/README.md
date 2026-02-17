# Page Context Scripts

This directory contains scripts that run in the **page context** of Canvas SpeedGrader. These scripts have direct access to the DOM and TinyMCE editor but **cannot** use the Chrome extension APIs (like `chrome.storage` or `chrome.runtime`).

## Architecture

### Single Entry Point: `speedgrader.js`

Currently, `speedgrader.js` is a monolithic IIFE (Immediately Invoked Function Expression) containing all page-level functionality:

- **Student name detection & display** - Gets the current student name from the SpeedGrader UI
- **Placeholder replacement** - Replaces text placeholders in the editor
- **Comment library integration** - Handles the comment library dropdowns and saved comments
- **Rubric handling** - Manages structured and unstructured rubric interactions
- **Student name warnings** - Displays notifications for name mismatches
- **Point memory & auto-fill** - Remembers and auto-fills grading point values

### Cross-Context Communication

The page script communicates with the **content script** (`content/loader-speedgrader.js`) via `window.postMessage()`:

- **Page → Content Script** (via `window.postMessage`):
  - `CSH_SAVE_POINTS` - Save grading point values to storage
  - `CSH_TOUCH_POINTS` - Update the "last used" timestamp for point values
  - `CSH_TOUCH_STUDENT_NAME` - Update the "last used" timestamp for student names
  - `CSH_CLEAR_QUEUED_STUDENT` - Clear the cached student name from the PowerApps queue

- **Content Script → Page** (via `window.postMessage`):
  - `CSH_UPDATE_SETTINGS` - Notify page of setting changes from the options page

These message types are defined in `shared/message-types.js` to avoid hardcoding strings in multiple places.

### Settings Injection

Settings are injected by the content script into the page via a `<script>` element's `data-settings` attribute as a JSON string. This provides:
- Synced settings (placeholders, rubric options, etc.)
- Local settings (preferred student names)

## Future Modularization

If a build step (webpack, esbuild, etc.) is added in the future, `speedgrader.js` can be split into:

```
page/
  ├── speedgrader.js         (main entry point - combined bundle)
  ├── student-name.js        (student name detection & display)
  ├── placeholder-replace.js (placeholder replacement logic)
  ├── comment-library.js     (comment library integration)
  ├── rubric-handler.js      (rubric interactions)
  ├── notification.js        (warning notifications)
  └── point-memory.js        (point value memory & auto-fill)
```

Each module would export functions that the main entry point calls. This would improve testability and maintainability without changing the external interface.

## Notes

- Keep page context logic in `page/` folder
- Extension UI logic belongs in `extension/` folder
- Content script logic belongs in `content/` folder
- Shared constants and utilities (like `shared/message-types.js`) can be referenced by both content and page scripts
