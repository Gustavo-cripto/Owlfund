import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import Colors from '@/constants/Colors';

export type ThemeMode = 'light' | 'dark';

type ThemeContextValue = {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = 'theme_mode_v1';
const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    const load = async () => {
      try {
        if (Platform.OS === 'web') {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored === 'light' || stored === 'dark') {
            setMode(stored);
          }
          return;
        }

        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
          setMode(stored);
        }
      } catch (error) {
        console.warn('Failed to load theme mode', error);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(STORAGE_KEY, mode);
        if (typeof document !== 'undefined') {
          const palette = Colors[mode];
          document.documentElement.dataset.theme = mode;
          document.documentElement.style.backgroundColor = palette.background;
          document.body.style.backgroundColor = palette.background;
        }
      } catch (error) {
        console.warn('Failed to persist theme mode (web)', error);
      }
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, mode).catch((error) => {
      console.warn('Failed to persist theme mode', error);
    });
  }, [mode]);

  const toggle = () => {
    setMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return context;
}
