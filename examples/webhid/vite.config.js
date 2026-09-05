import { defineConfig } from 'vite';

// `kontrol-z1-hid` is a `file:../..` dependency, so it resolves to the built
// library in the repo root (`dist/`, per the package's `exports`). Build the
// library there first (`npm run build`) if `dist/` is missing.
export default defineConfig({
  server: {
    host: '127.0.0.1',
  },
  build: {
    target: 'esnext',
  },
});
