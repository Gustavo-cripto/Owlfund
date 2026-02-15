import { useAppTheme } from '@/context/ThemeContext';

export function useColorScheme() {
  return useAppTheme().mode;
}
