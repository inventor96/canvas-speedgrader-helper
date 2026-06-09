# Canvas SpeedGrader Helper — Agent Guide

## No build / test / lint / CI

Plain JS Chrome Extension (Manifest V3). Zero dependencies, no package.json, no modules.
Edit a file → reload at `chrome://extensions` → refresh the target page.

## Runtime contexts (three tiers)

1. **Extension context** (`extension/`) — popup, options, service worker. Chrome API access.
2. **Content script** (`content/`) — runs on Canvas/PowerApps pages. Chrome APIs + DOM, injects page scripts.
3. **Page context** (`page/`) — injected via `<script>` inside SpeedGrader. Direct Canvas DOM / TinyMCE access, but no `chrome.*` APIs.

Cross-context: `window.postMessage()` with typed constants from `shared/message-types.js`. The content script (`content/loader-speedgrader.js`) is the bridge.

## Settings flow

`shared/settings.js` (defaults) → `extension/options.html+js` (UI) → `content/loader-speedgrader.js` (reads storage, passes via `script.dataset.settings`) → `page/speedgrader.js` (applies). Always add new settings to `shared/settings.js` first.

## Key code conventions

- Every file: `(() => { 'use strict'; ... })()` IIFE, exports to `window.*` (no ES modules)
- `WeakSet` on DOM elements for idempotent one-shot handlers
- `MutationObserver` + `setInterval`/`setTimeout` for DOM state detection
- `chrome.storage.local` for non-synced data (preferred names); `chrome.storage.sync` for settings

## Content script registration

New content scripts must be added to `manifest.json` `content_scripts` with correct `matches`, `run_at`, and `all_frames`. New page-context scripts must be added to `web_accessible_resources`.

## Submission adapters

`page/submission-adapters/` follow an interface pattern per `adapter-interface.md`. Three adapter types: `iframe-submission-adapter.js`, `document-renderer-adapter.js`, `discussion-posts-adapter.js`. Referenced via `page/submission-dispatcher.js`.

## Planned (not implemented)

`llm-highlight-feature-prompt.md` describes a future Ollama-based highlight feature. Not built yet.
