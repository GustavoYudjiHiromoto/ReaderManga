import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function createBuildMetadata() {
  const pkgPath = path.resolve(import.meta.dirname, 'package.json');
  let appVersion = '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg?.version) appVersion = String(pkg.version);
  } catch {
    // fallback cleanly
  }

  const now = new Date();
  const buildTime = now.toISOString();
  const compactStamp = `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}.${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
  const buildId = `${appVersion}+${compactStamp}`;

  return { appVersion, buildId, buildTime };
}

export default defineConfig(({ command }) => {
  const { appVersion, buildId, buildTime } = createBuildMetadata();

  // Share active build metadata with dev server process
  process.env.MANGAREADER_APP_VERSION = appVersion;
  process.env.MANGAREADER_BUILD_ID = buildId;
  process.env.MANGAREADER_BUILD_TIME = buildTime;

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_BUILD_ID__: JSON.stringify(buildId),
      __APP_BUILD_TIME__: JSON.stringify(buildTime),
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        devOptions: {
          enabled: true
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest}'],
          globIgnores: ['assets/aistudio/**', 'version.json'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365
                }
              }
            }
          ]
        },
        manifest: false // Use existing public/manifest.json
      }),
      {
        name: 'emit-version-manifest',
        closeBundle() {
          if (command !== 'build') return;
          const distDir = path.resolve(import.meta.dirname, 'dist');
          if (!fs.existsSync(distDir)) return;
          fs.writeFileSync(
            path.join(distDir, 'version.json'),
            JSON.stringify({ version: appVersion, buildId, buildTime }, null, 2),
            'utf8'
          );
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

