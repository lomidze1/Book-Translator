import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Expo's tsconfig sets "jsx": "react-native" (classic runtime, no React
  // import); tests that import .tsx components need the automatic runtime.
  esbuild: {
    jsx: 'automatic',
  },
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
