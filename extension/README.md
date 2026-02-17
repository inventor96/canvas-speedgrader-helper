# Extension Context

This directory contains files that run in the **extension context**: the popup and options pages. These scripts have full access to Chrome extension APIs but cannot directly modify content pages.

## Files

### `popup.html` / `popup.js`
The extension popup (appears when clicking the extension icon):
- Shows the current student ID (if on a SpeedGrader page)
- Allows setting a custom "preferred name" for the current student
- Stores the preference in local storage (per device, not synced)
- Links to the options page

### `options.html` / `options.js`
The extension options page (detailed settings):
- **Placeholders** - Configure text to replace in comments
- **Rubric Options** - Auto-open rubric, open comment library, etc.
- **Structured Rubric** - Options specific to point-based rubrics
- **Comment Box** - Control when to auto-open the comment box
- **Grading Queue** - Show warnings for student name mismatches
- **Save/Export** - Import and export student name preferences

Loads settings from `chrome.storage.sync` and `chrome.storage.local`.

### `popup.css` / `options.css`
Styling specific to each page.

### `../base.css` (shared stylesheet)
Common styling used by both popup and options pages.

## Dependencies

Both `popup.js` and `options.js` include `storage-utils.js` and `settings.js` (from the `shared/` folder) to access `window.CSHStorageUtils` and settings schema for:
- Initializing storage quota limits
- Detecting available storage space
- Handling quota-related warnings

## Script Load Order

1. `../shared/storage-utils.js` - Initialize storage utilities (global `CSHStorageUtils`)
2. `../shared/settings.js` - Load settings schema (global `SYNCED_SETTINGS`, `LOCAL_SETTINGS`)
3. `popup.js` or `options.js` - Use the above globals

## Notes

- Extension context scripts have NO access to the page DOM
- To modify page content, use content scripts and `window.postMessage()`
- Settings are stored in:
  - `chrome.storage.sync` - Synced across devices
  - `chrome.storage.local` - Local to this device only
