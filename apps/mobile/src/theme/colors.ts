export const colors = {
  light: {
    primary: '#2563eb',
    primaryDark: '#1d4ed8',
    background: '#ffffff',
    surface: '#f8f9fa',
    text: '#1a1a1a',
    textSecondary: '#64748b',
    border: '#e2e8f0',
    error: '#ef4444',
    success: '#22c55e',
  },
  dark: {
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    background: '#0a0a0a',
    surface: '#1a1a1a',
    text: '#ededed',
    textSecondary: '#94a3b8',
    border: '#2d2d2d',
    error: '#f87171',
    success: '#4ade80',
  },
};

export type ThemeColors = typeof colors.light;
