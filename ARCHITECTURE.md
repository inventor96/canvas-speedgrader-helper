# Canvas SpeedGrader Helper - Architecture & Organization

This document explains the folder structure and how different parts of the extension are organized.

## Folder Structure

```
.
├── extension/            # Extension UI (popup, options pages)
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
│   ├── options.html
│   ├── options.js
│   ├── options.css
│   ├── README.md
│   └── [extension-specific files]
│
├── content/              # Content scripts (run on Canvas pages)
│   ├── loader-speedgrader.js # Main content script (injects speedgrader.js)
│   ├── grading-queue.js  # PowerApps queue integration
│   ├── powerapps-domain-monitor.js
│   ├── README.md
│   └── [content script files]
│
├── page/                 # Page context scripts (injected into Canvas)
│   ├── speedgrader.js    # Main page script (single entry point)
│   ├── README.md
│   └── [page script modules - future]
│
├── shared/               # Shared constants & utilities
│   ├── message-types.js  # Inter-context message type constants
│   ├── settings.js       # Settings schema (used by extension UI & content scripts)
│   ├── storage-utils.js  # Storage quota management (used by extension UI & content scripts)
│   └── README.md
│
├── manifest.json         # Extension manifest (MV3)
├── base.css              # Shared stylesheet
├── icon.png
├── ARCHITECTURE.md       # This file
├── README.md             # Main project README
└── [other project files]
```

## Context Separation

The extension operates across **three JavaScript contexts**, each with different capabilities:

### 1. Extension Context (Extension UI)
**Files:** `extension/popup.js`, `extension/options.js`  
**Capabilities:**
- ✅ Full Chrome extension API (`chrome.storage`, `chrome.runtime`, etc.)
- ✅ No direct DOM access to Canvas pages
- ✅ Communicate with content scripts via `chrome.storage` and messaging

**Responsibility:**
- Render and manage extension UI (popup, options pages)
- Store user settings in browser storage

### 2. Content Script Context (Canvas Page Context)
**Files:** `content/loader-speedgrader.js`  
**Capabilities:**
- ✅ Full Chrome extension API (`chrome.storage`, `chrome.runtime`, etc.)
- ✅ Can inject scripts into page context
- ✅ Can listen to page messages via `window.postMessage()`
- ❌ Limited DOM access (sandboxed for security)

**Responsibility:**
- Initialize storage limits and settings
- Inject the page script (`page/speedgrader.js`)
- Bridge communication between extension UI and page context
- Handle storage operations from the page script

### 3. Page Context (Canvas SpeedGrader DOM)
**Files:** `page/speedgrader.js`  
**Capabilities:**
- ✅ Full DOM access and JavaScript API
- ✅ Can access TinyMCE editor
- ❌ NO Chrome extension API (security restriction)

**Responsibility:**
- Interact with Canvas SpeedGrader UI
- Replace text placeholders in comments
- Handle rubric interactions
- Manage comment library integration
- Send student grading data back to content script

## Data Flow

```
┌─────────────────┐
│  Extension UI   │
│  (popup/opts)   │
└────────┬────────┘
         │ chrome.storage.onChanged
         ↓
┌─────────────────┐
│ Content Script  │  ← Listens to storage changes
│(loader-speedg.js)│  ← Injects speedgrader.js
└────────┬────────┘
         │ window.postMessage
         │ (CSH_UPDATE_SETTINGS)
         ↓
┌─────────────────┐
│ Page Script     │
│  (speedgrader.js)│  ← Responds to user interactions
└────────┬────────┘
         │ window.postMessage
         │ (CSH_SAVE_POINTS, CSH_TOUCH_*)
         ↓
┌─────────────────┐
│ Content Script  │  ← Saves to chrome.storage
└────────┬────────┘
         │ chrome.storage.set
         ↓
┌─────────────────┐
│ Browser Storage │
└─────────────────┘
```

## Message Types

Cross-context communication uses `window.postMessage()` with type constants defined in `shared/message-types.js`:

| Message | Direction | Sender | Receiver | Purpose |
|---------|-----------|--------|----------|---------|
| `CSH_SAVE_POINTS` | Page → Content | speedgrader.js | loader-speedgrader.js | Save rubric point values |
| `CSH_TOUCH_POINTS` | Page → Content | speedgrader.js | loader-speedgrader.js | Update "last used" for points |
| `CSH_TOUCH_STUDENT_NAME` | Page → Content | speedgrader.js | loader-speedgrader.js | Update "last used" for names |
| `CSH_CLEAR_QUEUED_STUDENT` | Page → Content | speedgrader.js | loader-speedgrader.js | Clear cached student name |
| `CSH_UPDATE_SETTINGS` | Content → Page | loader-speedgrader.js | speedgrader.js | Notify of settings changes |

## Building and Development

### No Build Step Required
The extension uses vanilla JavaScript with no build process. All files are loaded directly:
- Content scripts are listed in `manifest.json`
- The page script is injected via `chrome.runtime.getURL()`
- Shared files are loaded as separate scripts in load order

### To Test Changes:
1. Edit files in their respective folders
2. Reload the extension in `chrome://extensions`
3. Reload the Canvas SpeedGrader page or test page

### Future: Adding a Build Step
If you add a bundler (webpack, esbuild, etc.) in the future:
- Keep context boundaries in separate output folders
- Generate multiple entry points (one per context)
- Update `manifest.json` to reference built files
- `page/speedgrader.js` could be split into modules, bundled into a single file

## Guidelines for Adding New Code

### Adding Extension UI Features
- Place files in `extension/`
- Import `shared/settings.js` and `shared/storage-utils.js`
- Communicate with content scripts via `chrome.storage` API

### Adding Content Script Features
- Place files in `content/`
- Load them in `manifest.json` in the correct order
- Use `shared/message-types.js` for any message type strings
- Use `storage-utils.js` for quota management

### Adding Page Script Features
- Add logic to `page/speedgrader.js` (or future submodules)
- Use `CSH_MESSAGE_TYPES` from `shared/message-types.js`
- Send messages to content script, don't directly use Chrome APIs

### Adding Shared Utilities
- Place in `shared/` folder
- Avoid context-specific APIs
- Export to `window` object for global access
- Document dependencies and usage

## See Also
- `extension/README.md` - Details on popup and options UI
- `content/README.md` - Details on content scripts
- `page/README.md` - Details on page scripts
- `shared/README.md` - Details on shared utilities
