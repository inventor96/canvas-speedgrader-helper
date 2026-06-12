# Canvas SpeedGrader Helper — Agent Guide

## Build / dev

```sh
npm run build    # production build → dist/
npm run dev      # dev server with HMR (load dist/ as unpacked extension)
```

CRXJS + Vite (Manifest V3). ES modules throughout. No IIFE/`window.*` pattern.

## Runtime contexts (three tiers)

1. **Extension context** (`src/extension/`) — popup, options, service worker. Chrome API access.
2. **Content script (isolated world)** (`src/content/`) — runs on Canvas/PowerApps pages. Chrome APIs + DOM, injects inline `<script>` for settings.
3. **Content script (MAIN world)** (`src/page/speedgrader.js`) — registered in `manifest.config.js` with `world: "MAIN"`. Direct Canvas DOM / TinyMCE access, no `chrome.*` APIs. Settings received via `window.__CSH_SETTINGS__` (set by `loader-speedgrader.js` inline script).

Cross-context: `window.postMessage()` with typed constants from `src/shared/message-types.js`. The content script (`src/content/loader-speedgrader.js`) is the bridge.

## Settings flow

`src/shared/settings.js` (defaults) → `src/extension/options.html+js` (UI) → `src/content/loader-speedgrader.js` (reads storage, sets `window.__CSH_SETTINGS__` via inline script) → `src/page/speedgrader.js` (applies). Always add new settings to `src/shared/settings.js` first.

## Key code conventions

- Every file: `export const ...` or `export function ...` (ES modules, no IIFE)
- `WeakSet` on DOM elements for idempotent one-shot handlers
- `MutationObserver` + `setInterval`/`setTimeout` for DOM state detection
- `chrome.storage.local` for non-synced data (preferred names); `chrome.storage.sync` for settings

## Content script registration

New content scripts must be added as entries in `manifest.config.js` `content_scripts` array with correct `matches`, `run_at`, and `world`. Use `world: "MAIN"` for scripts that need page-level DOM/JS access. CRXJS auto-adds all chunks to `web_accessible_resources`.

## Submission adapters

`src/page/submission-adapters/` follow an interface pattern per `adapter-interface.md`. Three adapter types: `iframe-submission-adapter.js`, `document-renderer-adapter.js`, `discussion-posts-adapter.js`. Referenced via `src/page/submission-dispatcher.js`.

## Planned (not implemented)

`llm-highlight-feature-prompt.md` describes a future Ollama-based highlight feature. Not built yet.
