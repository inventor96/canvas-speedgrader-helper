# Canvas SpeedGrader Helper — Agent Guide

## Build / dev

```sh
npm run build    # production build → dist/
npm run dev      # dev server with HMR (load dist/ as unpacked extension)
```

CRXJS + Vite (Manifest V3). ES modules throughout.

## Runtime contexts (three tiers)

1. **Extension context** (`src/extension/`) — popup, options, service worker. Chrome API access.
2. **Content script (isolated world)** (`src/content/`) — runs on Canvas/PowerApps pages. Chrome APIs + DOM.
3. **Content script (MAIN world)** (`src/page/`) — registered with `world: "MAIN"`. Direct Canvas DOM / TinyMCE access, no `chrome.*` APIs.

Cross-context: `window.postMessage()` with typed constants from `src/shared/message-types.js`. Content script is the bridge.

## Module structure

Each context directory is split into `entrypoints/` (files registered in manifest or referenced by HTML) and `modules/` (imported by entrypoints).

### `src/page/` — SpeedGrader MAIN-world scripts

Entry point: `entrypoints/speedgrader.js` — imports all modules, runs `tryInit()` → `initializeAllFeatures()`.

| Module | Responsibility |
|---|---|
| `modules/settings-store.js` | Reactive store (`settings.get(key)` / `settings.applyAll(obj)` / `settings.onChange(fn)`) |
| `modules/settings-bridge.js` | Reads `data-csh-settings` from DOM, applies to store, listens for runtime updates |
| `modules/student-name-service.js` | Resolves current student name from page/URL/preferred names |
| `modules/comment-mode-controller.js` | Group comment radio selection |
| `modules/placeholder-engine.js` | Replaces `[STUDENT_NAME]` in TinyMCE editors and textareas |
| `modules/rubric-controller.js` | Rubric auto-open, view-rubric delegation, submission history |
| `modules/comment-library-controller.js` | Point saving on submit, comment library auto-open |
| `modules/points-memory.js` | Auto-fill full points, remember/prepopulate from comment library |
| `modules/structured-rubric-ux.js` | Scroll-to-next criterion, clear comment on max, auto-open comment box |
| `modules/notification-ui.js` | Name mismatch banner, groups check orchestration |
| `modules/name-sanity-check.js` | All-uppercase/lowercase detection, save preferred name |
| `modules/highlight-class-selector.js` | Cycles through CSS highlight class names |
| `modules/helpers/dom-utils.js` | `attachEventListenerIdempotent`, `escapeHtml`, `normalizeName` |

### `src/content/` — Content scripts (isolated world)

| Entry | Submodules | Purpose |
|---|---|---|
| `entrypoints/speedgrader-loader.js` | `modules/settings-injector.js`, `modules/submit-comment-popup.js`, `modules/message-relay.js`, `modules/settings-watcher.js` | Settings bridge, postMessage relay, submit popup |
| `entrypoints/powerapps-grading-queue.js` | `modules/queue/grading-queue.js`, `modules/queue/queue-helpers.js`, `modules/queue/queue-complete-popup.js` | PowerApps Grading Queue automation |
| `entrypoints/groups-page.js` | — | Canvas Groups page operations |
| `entrypoints/iframe-content-loader.js` | — | Submission iframe adapter loader |
| `entrypoints/powerapps-domain-monitor.js` | — | PowerApps domain warnings |

### `src/extension/` — Extension context (popup, options, service worker)

| Entry | Submodules | Purpose |
|---|---|---|
| `entrypoints/service-worker.js` | `modules/message-router.js`, `modules/group-triplet-cache.js`, `modules/groups-check-state.js` | Background message routing |
| `options.html / entrypoints/options.js / options.css` | — | Settings UI |
| `popup.html / entrypoints/popup.js / popup.css` | — | Popup UI |

## Settings flow

`src/shared/settings.js` (defaults) → `src/extension/options.html + entrypoints/options.js` (UI) → `src/content/modules/settings-injector.js` (reads storage, sets `data-csh-settings` on DOM) → `src/page/modules/settings-bridge.js` (reads from DOM, applies to `modules/settings-store.js`) → `src/page/modules/*.js` (reads via `settings.get(key)`). Always add new settings to `src/shared/settings.js` first.

## Key code conventions

- Every file: `export const ...` or `export function ...` (ES modules, no IIFE)
- `WeakSet` on DOM elements for idempotent one-shot handlers
- `MutationObserver` + `setInterval`/`setTimeout` for DOM state detection
- `chrome.storage.local` for non-synced data (preferred names); `chrome.storage.sync` for settings

## Content script registration

New content scripts must be added as entries in `manifest.config.js` `content_scripts` array with correct `matches`, `run_at`, and `world`. Use `world: "MAIN"` for scripts that need page-level DOM/JS access. CRXJS auto-adds all chunks to `web_accessible_resources`.

## Submission adapters

`src/page/modules/submission-adapters/` follow an interface pattern per `adapter-interface.md`. Three adapter types: `iframe-submission-adapter.js`, `document-renderer-adapter.js`, `discussion-posts-adapter.js`. Referenced via `src/page/modules/submission-dispatcher.js`.

## Planned (not implemented)

`llm-highlight-feature-prompt.md` describes a future Ollama-based highlight feature. Not built yet.
