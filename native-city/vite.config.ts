import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';

export default defineConfig({
  base: './',
  // Runtime models/data already live at this repository's root. Do not
  // duplicate gigabytes of them into each compilation output.
  build: {copyPublicDir: false},
  server: {
    host: '127.0.0.1',
    hmr: false,
    fs: {
      allow: [fileURLToPath(new URL('..', import.meta.url))],
      deny: ['**/.env', '**/.env.*', '**/*.{crt,pem}', '**/.git/**', '**/.cache/**'],
    },
    watch: {ignored: ['**/public/**', '**/dist/**', '**/*.glb', '**/*.bin']},
  },
});
