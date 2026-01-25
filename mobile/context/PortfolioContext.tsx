import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

import { Category, Asset, portfolio as seedPortfolio } from '@/data/portfolio';

type PortfolioState = {
  currency: string;
  categories: Category[];
};

type PortfolioContextValue = {
  portfolio: PortfolioState;
  isLoading: boolean;
  addAsset: (categoryId: string, asset: Omit<Asset, 'id'>) => void;
  updateAsset: (categoryId: string, assetId: string, updates: Partial<Asset>) => void;
  removeAsset: (categoryId: string, assetId: string) => void;
};

const STORAGE_KEY = 'portfolio_data_v1';

const PortfolioContext = createContext<PortfolioContextValue | undefined>(undefined);

const createId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolio, setPortfolio] = useState<PortfolioState>({
    currency: seedPortfolio.currency,
    categories: seedPortfolio.categories,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const isElectron =
      typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);
    let isMounted = true;
    const fallbackTimer = setTimeout(() => {
      if (isMounted) {
        setIsLoading(false);
      }
    }, 1500);

    if (isElectron) {
      setIsLoading(false);
      clearTimeout(fallbackTimer);
      return () => {
        isMounted = false;
        clearTimeout(fallbackTimer);
      };
    }

    if (Platform.OS === 'web') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setPortfolio({ ...parsed, currency: 'EUR' });
        }
      } catch (error) {
        console.warn('Failed to load portfolio data (web)', error);
      } finally {
        setIsLoading(false);
        clearTimeout(fallbackTimer);
      }

      return () => {
        isMounted = false;
        clearTimeout(fallbackTimer);
      };
    }

    const loadPortfolio = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setPortfolio({ ...parsed, currency: 'EUR' });
        }
      } catch (error) {
        console.warn('Failed to load portfolio data', error);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
        clearTimeout(fallbackTimer);
      }
    };

    loadPortfolio();

    return () => {
      isMounted = false;
      clearTimeout(fallbackTimer);
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;

    const isElectron =
      typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent);

    if (isElectron) {
      return;
    }

    if (Platform.OS === 'web') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio));
      } catch (error) {
        console.warn('Failed to persist portfolio data (web)', error);
      }
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(portfolio)).catch((error) => {
      console.warn('Failed to persist portfolio data', error);
    });
  }, [portfolio, isLoading]);

  const addAsset = (categoryId: string, asset: Omit<Asset, 'id'>) => {
    setPortfolio((prev) => ({
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
    setPortfolio((prev) => ({
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
    setPortfolio((prev) => ({
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

  const value = useMemo(
    () => ({
      portfolio,
      isLoading,
      addAsset,
      updateAsset,
      removeAsset,
    }),
    [portfolio, isLoading]
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
