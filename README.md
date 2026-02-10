## Helper for Canvas SpeedGrader

Small quality-of-life improvements for Canvas SpeedGrader. The extension runs only on SpeedGrader pages and focuses on faster rubric workflows, better comment reuse, and personalized student name handling.

## Features

- Student name placeholders in comments, with automatic replacement in the rubric comment editor and free-form comment textareas.
- Preferred student names per student_id, so you can use nicknames or chosen names in placeholders.
- Rubric helpers for ungraded submissions, comment library follow-up, and point entry shortcuts.
- Optional point memory for unstructured rubrics based on the comment you select or save.

## Options Page Overview

### Rubric

- **Open rubric automatically for ungraded submissions**: Opens the rubric panel when there is no prior evaluation.
- **Open the Comment Library after submitting the assessment**: Opens the comment library after clicking Submit Assessment.
- **Prepopulate criterion scores with full points**: For unstructured rubrics, focusing a score input fills it with the max points if empty.
- **Remember and prepopulate points for saved comments**: Stores points for unstructured rubric comments and reuses them when you select the same comment later.
	- Notes in the options UI cover edge cases for long comments and edited comment text.

### Name Placeholders

- **Custom placeholder list**: Define one or more tokens (for example, `STUDENT_NAME`) that will be replaced with the current student name when you pick or type comments.

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
