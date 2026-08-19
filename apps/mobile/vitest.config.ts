import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    // Expo injects __DEV__ at bundle time; tests run outside Metro.
    __DEV__: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    setupFiles: ['test/setup.ts'],
  },
});
