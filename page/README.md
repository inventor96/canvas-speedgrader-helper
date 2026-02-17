# Page Context Scripts

This directory contains scripts that run in the **page context** of Canvas SpeedGrader. These scripts have direct access to the DOM and TinyMCE editor but **cannot** use the Chrome extension APIs (like `chrome.storage` or `chrome.runtime`).

## Architecture

### Single Entry Point: `speedgrader.js`

`speedgrader.js` is organized as a modular IIFE (Immediately Invoked Function Expression) containing all page-level functionality split into focused namespaces:

#### Core Namespaces

1. **SettingsBridge**
   - **Responsibility**: Initialize settings from script injection, parse JSON configuration
   - **Public Methods**:
     - `init()` - Load and parse settings from `data-settings`
     - `applySettings(settings)` - Apply parsed settings to global variables
     - `attachSettingsUpdateListener()` - Listen for live settings updates from content script
     - `handleStudentNameChange(changes)` - In-place replacement of student names in editors
   - **Dependencies**: None

2. **StudentNameService**
   - **Responsibility**: Resolve student names from URL mappings or SpeedGrader UI
   - **Public Methods**:
     - `getStudentName()` - Get student name from saved mapping or UI
     - `getCurrentStudentNameFromPage(forceFullName)` - Extract name from SpeedGrader DOM
   - **Used By**: PlaceholderEngine, NotificationUI
   - **Dependencies**: None

3. **PlaceholderEngine**
   - **Responsibility**: Replace text placeholders in editors and textareas with student names
   - **Public Methods**:
     - `waitForTinyMCE()` - Poll for TinyMCE availability and attach hooks
     - `attachEditorHook(editor)` - Hook into SetContent events
     - `replacePlaceholdersInEditor(editor)` - Replace placeholders in TinyMCE
     - `replacePlaceholdersInTextarea(textarea)` - Replace placeholders in textarea
     - `applySettingsToEditors()` - Apply to all existing editors
     - `applySettingsToTextareas()` - Apply to all textareas
     - `attachCommentLibraryTextareaListeners()` - Wire comment library inputs to textareas
   - **Used By**: RubricController, SettingsBridge
   - **Dependencies**: StudentNameService

4. **RubricController**
   - **Responsibility**: Manage rubric view/cancel lifecycle and initialization
   - **Public Methods**:
     - `handleRubricFunctionality()` - Main entry point for rubric handling
     - `attachViewRubricListener(rubricButton)` - Wire click handler to view button
     - `reattachViewRubricListener(retryCount, maxRetries)` - Re-attach listener after cancel
     - `attachCancelRubricListener()` - Wire cancel button to reattach view listener
     - `attachAllRubricHandlers()` - Coordinate all sub-handlers after rubric opens
   - **Used By**: Initialization, SettingsBridge
   - **Dependencies**: CommentLibraryController, PointsMemory, PlaceholderEngine, StructuredRubricUX

5. **CommentLibraryController**
   - **Responsibility**: Handle comment library submission and post-submit behavior
   - **Public Methods**:
     - `attachCommentLibraryHandler()` - Wire save button for point memory and library open
     - `handlePointsSaving()` - Save points associated with comments to storage
   - **Used By**: RubricController
   - **Dependencies**: PlaceholderEngine, RubricController

6. **PointsMemory**
   - **Responsibility**: Auto-fill points and prepopulate from saved comment history
   - **Public Methods**:
     - `attachAutoFillListeners()` - Auto-populate max points on focus
     - `attachCommentLibraryChangeListeners()` - Prepopulate points when comments selected
   - **Used By**: RubricController
   - **Dependencies**: None (uses global SAVED_POINTS, BLANK_DROPDOWN_VALUES)

7. **StructuredRubricUX**
   - **Responsibility**: Handle structured rubric comment box behavior
   - **Public Methods**:
     - `attachStructuredRubricListeners()` - Auto-open comment boxes on rating selection
     - `attachClearCommentOnMaxPointsListeners()` - Auto-clear comments on max rating
   - **Used By**: RubricController
   - **Dependencies**: None

8. **NotificationUI**
   - **Responsibility**: Display student name mismatch warnings
   - **Public Methods**:
     - `checkQueuedStudentName(retryCount, maxRetries)` - Check for queued name mismatch
     - `showStudentNameMismatchWarning(queuedName, speedgraderName)` - Display warning banner
     - `escapeHtml(text)` - Escape HTML for safe DOM insertion
   - **Used By**: Initialization
   - **Dependencies**: StudentNameService

#### Functional Organization

| Feature | Primary Namespace | Secondary | Input |
|---------|------------------|-----------|-------|
| Student names | StudentNameService | SettingsBridge | URL params, DOM UI |
| Placeholder replacement | PlaceholderEngine | StudentNameService | TinyMCE, textareas |
| Comment library | CommentLibraryController | PlaceholderEngine, RubricController | Save button |
| Rubric lifecycle | RubricController | All others | View/Cancel buttons |
| Structured rubric UX | StructuredRubricUX | None | Rating buttons |
| Point memory | PointsMemory | None | Score inputs, dropdowns |
| Notifications | NotificationUI | StudentNameService | postMessage from queue |
| Settings | SettingsBridge | PlaceholderEngine, RubricController | Injected data, postMessage |

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

If a build step (webpack, esbuild, etc.) is added in the future, `speedgrader.js` can be split into separate files, one per namespace:

```
page/
  ├── speedgrader.js                (main entry point - combined bundle)
  ├── settings-bridge.js            (SettingsBridge namespace)
  ├── student-name-service.js       (StudentNameService namespace)
  ├── placeholder-engine.js         (PlaceholderEngine namespace)
  ├── rubric-controller.js          (RubricController namespace)
  ├── comment-library-controller.js (CommentLibraryController namespace)
  ├── points-memory.js              (PointsMemory namespace)
  ├── structured-rubric-ux.js       (StructuredRubricUX namespace)
  └── notification-ui.js            (NotificationUI namespace)
```

Each namespace would become its own file exporting an object with the same public API. The main entry point would import and initialize them in order. This would improve testability, maintainability, and IDE support without changing the external interface.

## Current Code Organization

Within `speedgrader.js`, the file is organized as follows:

1. **Global State** - Extension settings and tracking variables
2. **SettingsBridge** namespace - Settings initialization and updates
3. **StudentNameService** namespace - Name resolution
4. **PlaceholderEngine** namespace - Editor placeholder replacement
5. **RubricController** namespace - Rubric lifecycle
6. **CommentLibraryController** namespace - Comment library handling
7. **PointsMemory** namespace - Point auto-fill and memory
8. **StructuredRubricUX** namespace - Structured rubric behavior
9. **NotificationUI** namespace - Warnings and notifications
10. **Initialization** - Bootstrap and entry point calls

## Notes

- Keep page context logic in `page/` folder
- Extension UI logic belongs in `extension/` folder
- Content script logic belongs in `content/` folder
- Shared constants and utilities (like `shared/message-types.js`) can be referenced by both content and page scripts
- Each namespace is self-contained with clear dependencies documented in comments
- Namespaces use object literals with methods rather than classes to avoid instance state complexity in page context
- All global state is declared at the top for visibility and to facilitate future extraction to parameters/closures
