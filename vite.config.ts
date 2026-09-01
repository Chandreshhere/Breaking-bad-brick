import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

/**
 * The version stamped into crash reports and analytics.
 *
 * Read from package.json at build time rather than typed into a constant,
 * because a release whose reported version has drifted from the one in the
 * store is worse than no version at all — every regression gets blamed on
 * the wrong build.
 */
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    // Sentry and any post-mortem of a minified stack are useless without
    // these. They are uploaded separately, never served next to the bundle.
    sourcemap: true,
  },
});
