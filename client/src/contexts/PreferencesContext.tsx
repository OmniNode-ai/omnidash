import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface PreferencesContextType {
  hiddenRoutes: string[];
  isRouteHidden: (route: string) => boolean;
  toggleRouteVisibility: (route: string) => void;
}

const STORAGE_KEY = 'dashboard-preferences';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [hiddenRoutes, setHiddenRoutes] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed.hiddenRoutes)) {
            return parsed.hiddenRoutes;
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
    return [];
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ hiddenRoutes }));
  }, [hiddenRoutes]);

  const isRouteHidden = (route: string) => hiddenRoutes.includes(route);

  const toggleRouteVisibility = (route: string) => {
    setHiddenRoutes((prev) =>
      prev.includes(route) ? prev.filter((r) => r !== route) : [...prev, route]
    );
  };

  return (
    <PreferencesContext.Provider value={{ hiddenRoutes, isRouteHidden, toggleRouteVisibility }}>
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
