import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  // Basic extension metadata
  name: 'Helper for Canvas SpeedGrader',
  version: pkg.version,
  description: 'Little funcionality improvements for Canvas SpeedGrader.',
  icons: {
    48: 'icon.png',
    128: 'icon.png',
  },
  // Toolbar action: popup UI
  action: {
    default_icon: 'icon.png',
    default_popup: 'src/extension/popup.html',
  },
  // Minimal Chrome API permissions
  permissions: [
    'storage',
    'activeTab',
  ],
  // Background service worker — message routing and state
  background: {
    service_worker: 'src/extension/entrypoints/service-worker.js',
  },
  // Hosts the extension may access (Canvas, PowerApps)
  host_permissions: [
    'http://localhost:*/*',
    'http://127.0.0.1:*/*',
    'https://*.instructure.com/*',
    'https://apps.powerapps.com/*',
    'https://runtime-app.powerapps.com/*',
    'https://runtime-app.powerplatform.com/*',
  ],
  // Content scripts injected into matching pages
  content_scripts: [
    // Isolated-world loader for SpeedGrader (runs first, bridges settings)
    {
      matches: ['https://*.instructure.com/courses/*/gradebook/speed_grader*'],
      js: ['src/content/entrypoints/speedgrader-loader.js'],
      run_at: 'document_start',
    },
    // MAIN-world script for direct SpeedGrader DOM/TinyMCE access
    {
      matches: ['https://*.instructure.com/courses/*/gradebook/speed_grader*'],
      js: ['src/page/entrypoints/speedgrader.js'],
      world: 'MAIN',
      run_at: 'document_idle',
    },
    // PowerApps runtime frames — grading queue automation
    {
      matches: ['https://runtime-app.powerapps.com/*', 'https://runtime-app.powerplatform.com/*'],
      js: ['src/content/entrypoints/powerapps-grading-queue.js'],
      run_at: 'document_end',
      all_frames: true,
    },
    // PowerApps domain monitoring — warns about unsupported domains
    {
      matches: ['https://apps.powerapps.com/*'],
      js: ['src/content/entrypoints/powerapps-domain-monitor.js'],
      run_at: 'document_end',
    },
    // Canvas Groups page operations
    {
      matches: ['https://*.instructure.com/courses/*/groups*'],
      js: ['src/content/entrypoints/groups-page.js'],
      run_at: 'document_idle',
    },
    // Submission iframes (Canvadocs, submission previews) — adapter loader
    {
      matches: [
        'https://canvasdocs.instructure.com/*',
        'https://canvadocs.instructure.com/*',
        'https://*.instructure.com/api/v1/canvadoc_session*',
        'https://*.instructure.com/courses/*/assignments/*/submissions/*',
      ],
      js: ['src/content/entrypoints/iframe-content-loader.js'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  // Full-page options UI (not a small popup)
  options_ui: {
    page: 'src/extension/options.html',
    open_in_tab: true,
  },
})
