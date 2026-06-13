// Vite config for building a CRXJS Chrome Extension (Manifest V3)
import path from 'node:path'
import { crx } from '@crxjs/vite-plugin'
import { defineConfig } from 'vite'
import zip from 'vite-plugin-zip-pack'
import manifest from './manifest.config.js'
import { name, version } from './package.json'

export default defineConfig({
  // Path alias @ -> src/ for cleaner imports
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`,
    },
  },
  // CRXJS plugin builds the extension; zip plugin packages a release artifact
  plugins: [
    crx({ manifest }),
    zip({
      outDir: 'release',
      outFileName: `${name}-${version}.zip`
    }),
  ],
  // Allow HMR connections from chrome-extension:// origins
  server: {
    cors: {
      origin: [
        /chrome-extension:\/\//,
      ],
    },
  },
})
