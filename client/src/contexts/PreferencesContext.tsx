import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PreferencesContextType {
  hiddenRoutes: string[];
  /** Routes the user has explicitly forced visible (overrides hideNoData). */
  shownRoutes: string[];
  hideNoData: boolean;
  isRouteHidden: (route: string) => boolean;
  /** Check if a route is explicitly shown by the user (overrides auto-hide). */
  isRouteForceShown: (route: string) => boolean;
  toggleRouteVisibility: (route: string) => void;
  toggleRouteForceShow: (route: string) => void;
  setHideNoData: (value: boolean) => void;
}

const STORAGE_KEY = 'dashboard-preferences';

interface StoredPreferences {
  hiddenRoutes?: string[];
  shownRoutes?: string[];
  hideNoData?: boolean;
}

function loadPreferences(): StoredPreferences {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // Ignore parse errors
    }
  }
  return {};
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [hiddenRoutes, setHiddenRoutes] = useState<string[]>(() => {
    const prefs = loadPreferences();
    return Array.isArray(prefs.hiddenRoutes) ? prefs.hiddenRoutes : [];
  });

  const [shownRoutes, setShownRoutes] = useState<string[]>(() => {
    const prefs = loadPreferences();
    return Array.isArray(prefs.shownRoutes) ? prefs.shownRoutes : [];
  });

  const [hideNoData, setHideNoData] = useState<boolean>(() => {
    const prefs = loadPreferences();
    return prefs.hideNoData !== false; // default true
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hiddenRoutes, shownRoutes, hideNoData }));
  }, [hiddenRoutes, shownRoutes, hideNoData]);

  const isRouteHidden = (route: string) => hiddenRoutes.includes(route);
  const isRouteForceShown = (route: string) => shownRoutes.includes(route);

  const toggleRouteVisibility = (route: string) => {
    setHiddenRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  const toggleRouteForceShow = (route: string) => {
    setShownRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  return (
    <PreferencesContext.Provider
      value={{
        hiddenRoutes,
        shownRoutes,
        hideNoData,
        isRouteHidden,
        isRouteForceShown,
        toggleRouteVisibility,
        toggleRouteForceShow,
        setHideNoData,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (context === undefined) {
    throw new Error('usePreferences must be used within a PreferencesProvider');
  }
  return context;
}
