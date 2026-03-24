## Helper for Canvas SpeedGrader

Small quality-of-life improvements for Canvas SpeedGrader. The extension runs only on SpeedGrader pages and focuses on faster rubric workflows, better comment reuse, and personalized student name handling.

## Features

- Student name placeholders in comments, with automatic replacement in the rubric comment editor and free-form comment textareas.
- Preferred student names per student_id, so you can use nicknames or chosen names in placeholders.
- Student name mismatch detection when coming from the PowerApps Grading Queue, alerting you if the wrong student is loaded in SpeedGrader.
- Group membership verification from the mismatch warning, so you can quickly confirm when two different names still belong to the same group submission.
- Rubric helpers for ungraded submissions, comment library follow-up, group comment mode, and point entry shortcuts.
- Structured-rubric auto-scroll after opening the rubric and after selecting a rating.
- Point memory for unstructured rubrics based on the comment you select or save.

## Options Page Overview

### Grading Queue Integration

This applies only to graders within BYU Pathway. At the time I started this project, that's where I was grading, hence this school-specific section.

- **Display a notification when the student name is mismatched between the Grading Queue and SpeedGrader**: When you click a grading button in the PowerApps Grading Queue, the extension remembers the student name. If SpeedGrader then loads a different student (indicating a potential navigation error), a warning notification appears at the top of the page to alert you before you begin grading.
- **Automatically proceed with automatic group check when applicable for a name mismatch**: When a mismatch warning appears and the current submission is a group assignment, the extension automatically opens the course Groups page in a temporary tab, searches using the Grading Queue name, and checks whether both names appear in the same group. If this option is off, you can still start the same check manually from the mismatch notification.
- **Automatically select "Already Graded" when a mismatched name check finds the names are in the same group**: After a group check confirms both names belong to the same group, the extension sets the Grading Queue status dropdown to "Already Graded" for that row only when the current SpeedGrader submission is already graded.
- **Automatically mark the assignment as complete when a mismatched name check finds the names are in the same group (and auto-close SpeedGrader when the assignment is graded)**: After a successful group match, the extension marks the queue item complete and closes the SpeedGrader tab only when the current submission is already graded. If the submission is ungraded, neither action runs.
- **Automatically open the next item in the queue after an assignment has been marked as complete**: When you mark an item complete in the PowerApps Grading Queue, the extension waits until that completion control is removed from the page, then clicks the first available `Grade` button to open the next submission.

When a group check confirms both names are in the same group, the mismatch warning in SpeedGrader changes to an informational state so it is clear the mismatch is expected for that submission.

### Rubric

- **Open rubric automatically for ungraded submissions**: Opens the rubric panel when there is no prior evaluation.
- **Open the Comment Library after submitting the assessment**: Opens the comment library after clicking Submit Assessment.
- **Automatically set comments to be sent to the whole group when available**: When the submit-comment controls load, automatically selects the group comment mode if Canvas provides it.
- **Automatically scroll to the submit comment button after selecting a comment from the comment library**: After you select a comment in the comment library, automatically scroll down to the submit comment button to save time if you are using the comment library frequently.

#### Structured Rubric Options

These options apply only to structured rubrics with preset point values:

- **Open comment box after selecting maximum rubric points**: Automatically opens the comment input box and focuses it when you select the maximum point option for a criterion. Mutually exclusive with "Clear criterion comment box when selecting maximum rubric points".
- **Clear criterion comment box when selecting maximum rubric points**: Automatically clears any existing comment and closes the comment box when you select the maximum point option for a criterion. Useful for enforcing a "no comment needed for perfect scores" workflow. Mutually exclusive with "Open comment box after selecting maximum rubric points".
- **Open comment box after selecting less-than-maximum rubric points**: Automatically opens the comment input box and focuses it when you select any less-than-maximum point option for a criterion.
- **Automatically scroll to the next criterion after selecting a rating**: Smoothly scrolls the grading panel to the next criterion row after a structured-rubric rating click. If the selected rating is configured to auto-open the criterion comment box, scrolling is skipped so focus stays on comment entry.
- **Automatically scroll to the first criterion after opening the rubric**: Repositions the grading panel at the first criterion when the rubric opens.

#### Unstructured Rubric Options

These options apply only to unstructured rubrics without preset point values:

- **Prepopulate criterion scores with full points**: Focusing a score input fills it with the max points if empty.
- **Remember and prepopulate points for saved comments**: Stores points for unstructured rubric comments and reuses them when you select the same comment later.
	- Notes in the options UI cover edge cases for long comments and edited comment text.

### Name Placeholders

- **Custom placeholder list**: Define one or more tokens (for example, `STUDENT_NAME`) that will be replaced with the current student name when you pick or type comments.
- **Use "Team" instead of the student's name when replacing name placeholders on a group submission (if applicable)**: If group comment mode is available, placeholders resolve to `Team` instead of an individual student name.

### Student Name Format

- **First name only** or **full name**: Controls how the extension derives a name when no preferred name is set.

### Student Preferred Names

- **Local-only storage**: Preferred names are stored on this device and are not synced.
- **Import/Export CSV**: Back up or migrate preferred names using CSV files.

## Popup (Quick Preferred Name)

The toolbar popup lets you set or clear a preferred name for the current student while you are on a SpeedGrader page. This is a quick shortcut to the preferred-name list in settings.

## Data and Privacy

- Synced settings use browser sync storage (if supported).
- Preferred student names are stored locally to avoid syncing sensitive data.
- You are responsible for handling exported CSV files securely.

## Permissions

- `storage`: Save settings and preferred names.
- `activeTab`: Read the active tab URL for quick preferred-name entry.
- `https://*.instructure.com/*`: Run only on Canvas domains.
- `https://apps.powerapps.com/*`: Run only on PowerApps (for the Grading Queue page).
- `https://runtime-app.powerapps.com/*`: Run only on PowerApps (for the Grading Queue iframe, if it loads from this domain).
- `https://runtime-app.powerplatform.com/*`: Run only on PowerApps (for the Grading Queue iframe, if it loads from this domain).

## Development

This section is the developer reference for the project. The rest of this README stays user-facing; the goal here is to help a new contributor get oriented quickly and know where to look next.

### Project shape

- `manifest.json`: Extension entry points, permissions, content-script registration, and web-accessible resources.
- `extension/`: Popup, options page, and service worker.
- `content/`: Content scripts that can use Chrome APIs and bridge into page context.
- `page/`: SpeedGrader page-context code with direct Canvas DOM access.
- `shared/`: Cross-context settings, message constants, storage helpers, other resources.

### Runtime contexts

The extension is split across three execution contexts because Canvas DOM access and Chrome extension APIs are not available in the same place.

1. **Extension context** (`extension/`)
	Owns the popup, options page, and service worker. Use this for UI, storage writes initiated from extension pages, and browser-level extension behavior.
2. **Content script context** (`content/`)
	Runs on matching Canvas and PowerApps pages. It can use Chrome APIs, read storage, inject page scripts, and relay messages between the extension and the page.
3. **Page context** (`page/`)
	Runs inside SpeedGrader itself. Use this for Canvas DOM interaction, TinyMCE access, rubric behavior, placeholder replacement, and other page-native logic.

When deciding where code belongs, start with the narrowest context that can do the job. DOM-heavy SpeedGrader behavior belongs in `page/speedgrader.js`; extension API work belongs in `content/` or `extension/`.

### Data flow

Most feature changes follow the same path:

1. Add or update a setting in `shared/settings.js` if the behavior is configurable.
2. Expose that setting in `extension/options.html` and `extension/options.js` if users need to control it.
3. Read or forward the setting in `content/loader-speedgrader.js`.
4. Implement the Canvas-facing behavior in `page/speedgrader.js`.

Cross-context communication uses `window.postMessage()` and the constants in `shared/message-types.js`. Keep message names centralized there instead of hardcoding strings in multiple files.

### Local development

There is no build step. The extension is plain JavaScript loaded directly by the browser.

1. Edit the relevant files.
2. Reload the unpacked extension in `chrome://extensions`.
3. Reload the target Canvas or PowerApps page.

For a fresh install, load the repository root as an unpacked extension.

### Practical guidelines

- Add new settings defaults in `shared/settings.js` first so every context has a consistent schema.
- Keep page-context code independent from `chrome.*`; use the content script as the bridge.
- Keep shared files context-agnostic unless a file is explicitly intended for extension/content use only.
- Update this README when a new feature changes the overall architecture, settings model, or developer workflow.
- Prefer extending existing pathways over creating a new script unless the runtime context genuinely changes.

