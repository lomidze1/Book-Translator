import { useState, useCallback, useEffect } from 'react';
import { type ReaderSettings, DEFAULT_READER_SETTINGS } from '../types';

const STORAGE_KEY = 'reader-settings';

function loadSettings(): ReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_READER_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(stored) };
  } catch {}
  return DEFAULT_READER_SETTINGS;
}

export function useReaderSettings() {
  const [settings, setSettingsState] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);

  useEffect(() => {
    setSettingsState(loadSettings());
  }, []);

  const setSettings = useCallback((update: Partial<ReaderSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...update };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  return { settings, setSettings };
}
