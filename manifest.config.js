import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Helper for Canvas SpeedGrader',
  version: pkg.version,
  description: 'Little funcionality improvements for Canvas SpeedGrader.',
  icons: {
    48: 'icon.png',
    128: 'icon.png',
  },
  action: {
    default_icon: 'icon.png',
    default_popup: 'src/extension/popup.html',
  },
  permissions: [
    'storage',
    'activeTab',
  ],
  background: {
    service_worker: 'src/extension/service-worker.js',
  },
  host_permissions: [
    'https://*.instructure.com/*',
    'https://apps.powerapps.com/*',
    'https://runtime-app.powerapps.com/*',
    'https://runtime-app.powerplatform.com/*',
  ],
  content_scripts: [
    {
      matches: ['https://*.instructure.com/courses/*/gradebook/speed_grader*'],
      js: ['src/content/loader-speedgrader.js'],
      run_at: 'document_start',
    },
    {
      matches: ['https://*.instructure.com/courses/*/gradebook/speed_grader*'],
      js: ['src/page/speedgrader.js'],
      world: 'MAIN',
      run_at: 'document_idle',
    },
    {
      matches: ['https://runtime-app.powerapps.com/*', 'https://runtime-app.powerplatform.com/*'],
      js: ['src/content/grading-queue.js'],
      run_at: 'document_end',
      all_frames: true,
    },
    {
      matches: ['https://apps.powerapps.com/*'],
      js: ['src/content/powerapps-domain-monitor.js'],
      run_at: 'document_end',
    },
    {
      matches: ['https://*.instructure.com/courses/*/groups*'],
      js: ['src/content/groups-page.js'],
      run_at: 'document_idle',
    },
    {
      matches: [
        'https://canvasdocs.instructure.com/*',
        'https://canvadocs.instructure.com/*',
        'https://*.instructure.com/api/v1/canvadoc_session*',
        'https://*.instructure.com/courses/*/assignments/*/submissions/*',
      ],
      js: ['src/content/iframe-content-loader.js'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
  options_ui: {
    page: 'src/extension/options.html',
    open_in_tab: true,
  },
})
