import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { Category, Asset, portfolio as seedPortfolio } from '@/data/portfolio';
import { useAuth } from '@/context/AuthContext';
import { pullCloudPortfolio } from '@/lib/cloudPortfolio';

type PortfolioState = {
  currency: string;
  categories: Category[];
};

type PortfolioContextValue = {
  portfolio: PortfolioState;
  isLoading: boolean;
  /** 'cloud' = a mostrar o portfólio da conta do site; 'local' = dados do dispositivo. */
  source: 'local' | 'cloud';
  /** Recarrega o portfólio do site (se houver sessão). Devolve erro legível ou null. */
  refreshCloud: () => Promise<string | null>;
  addAsset: (categoryId: string, asset: Omit<Asset, 'id'>) => void;
  updateAsset: (categoryId: string, assetId: string, updates: Partial<Asset>) => void;
  removeAsset: (categoryId: string, assetId: string) => void;
};

const STORAGE_KEY = 'portfolio_data_v1';
const CLOUD_KEY = 'cloud_portfolio_v1';

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

const createId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

const storageGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
};

const storageSet = async (key: string, value: string | null) => {
  if (Platform.OS === 'web') {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  try {
    if (value == null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    // ignore
  }
};

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [localPortfolio, setLocalPortfolio] = useState<PortfolioState>({
    currency: seedPortfolio.currency,
    categories: seedPortfolio.categories,
  });
  const [cloudCategories, setCloudCategories] = useState<Category[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Carrega dados locais (CRUD offline) + cópia cloud persistida.
  useEffect(() => {
    const isElectron =
      typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 1500);

    if (isElectron) {
      setIsLoading(false);
      clearTimeout(fallbackTimer);
      return () => {
        isMounted = false;
        clearTimeout(fallbackTimer);
      };
    }

    (async () => {
      try {
        const stored = await storageGet(STORAGE_KEY);
        if (stored && isMounted) {
          const parsed = JSON.parse(stored) as PortfolioState;
          setLocalPortfolio({ ...parsed, currency: 'EUR' });
        }
        const cloud = await storageGet(CLOUD_KEY);
        if (cloud && isMounted) {
          setCloudCategories(JSON.parse(cloud) as Category[]);
        }
      } catch (error) {
        console.warn('Failed to load portfolio data', error);
      } finally {
        if (isMounted) setIsLoading(false);
        clearTimeout(fallbackTimer);
      }
    })();

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  // Persiste os dados LOCAIS (CRUD) — a cópia cloud é persistida no refresh.
  useEffect(() => {
    if (isLoading) return;
    const isElectron =
      typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    if (isElectron) return;
    storageSet(STORAGE_KEY, JSON.stringify(localPortfolio));
  }, [localPortfolio, isLoading]);

  // Com sessão: puxa o portfólio do site. Sem sessão: volta ao local.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setCloudCategories(null);
      storageSet(CLOUD_KEY, null);
      return;
    }
    (async () => {
      const res = await pullCloudPortfolio();
      if (cancelled || !res.ok) return;
      setCloudCategories(res.categories);
      storageSet(CLOUD_KEY, JSON.stringify(res.categories));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const refreshCloud = async (): Promise<string | null> => {
    if (!userId) return 'Sem sessão — entra primeiro.';
    const res = await pullCloudPortfolio();
    if (!res.ok) return res.error;
    setCloudCategories(res.categories);
    storageSet(CLOUD_KEY, JSON.stringify(res.categories));
    return null;
  };

  const addAsset = (categoryId: string, asset: Omit<Asset, 'id'>) => {
    setLocalPortfolio((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              assets: [...category.assets, { ...asset, id: createId() }],
            }
          : category
      ),
    }));
  };

  const updateAsset = (categoryId: string, assetId: string, updates: Partial<Asset>) => {
    setLocalPortfolio((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              assets: category.assets.map((asset) =>
                asset.id === assetId ? { ...asset, ...updates } : asset
              ),
            }
          : category
      ),
    }));
  };

  const removeAsset = (categoryId: string, assetId: string) => {
    setLocalPortfolio((prev) => ({
      ...prev,
      categories: prev.categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              assets: category.assets.filter((asset) => asset.id !== assetId),
            }
          : category
      ),
    }));
  };

  // Logado (e com dados cloud) → mostra o portfólio do site; senão o local.
  const usingCloud = userId != null && cloudCategories != null;
  const portfolio: PortfolioState = usingCloud
    ? { currency: 'EUR', categories: cloudCategories }
    : localPortfolio;

  const value = useMemo(
    () => ({
      portfolio,
      isLoading,
      source: (usingCloud ? 'cloud' : 'local') as 'cloud' | 'local',
      refreshCloud,
      addAsset,
      updateAsset,
      removeAsset,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio, isLoading, usingCloud, userId]
  );

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio() {
  const context = useContext(PortfolioContext);
  if (!context) {
    throw new Error('usePortfolio must be used within a PortfolioProvider');
  }
  return context;
}
