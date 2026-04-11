/**
 * useRouter Hook
 * Simple hash-based router for PhantomOS cockpit navigation.
 * All hash routes are cockpit sub-routes. When navigated to,
 * the top-level tab auto-switches to cockpit.
 *
 * @author Subash Karki
 */
import { useCallback, useEffect, useState } from 'react';
import { useSetAtom } from 'jotai';

import { activeTopTabAtom } from '../atoms/system';

export type Route =
  | 'cockpit'
  | 'sessions'
  | 'session-viewer'
  | 'history'
  | 'tokens'
  | 'profile'
  | 'streak'
  | 'tasks'
  | 'achievements'
  | 'quests'
  | 'hunter-stats';

const VALID_ROUTES = new Set<Route>([
  'cockpit',
  'sessions',
  'session-viewer',
  'history',
  'tokens',
  'profile',
  'streak',
  'tasks',
  'achievements',
  'quests',
  'hunter-stats',
]);

const DEFAULT_ROUTE: Route = 'cockpit';

const parseHash = (): Route => {
  const hash = window.location.hash.replace('#', '');
  return VALID_ROUTES.has(hash as Route) ? (hash as Route) : DEFAULT_ROUTE;
};

/** Routes that are cockpit sub-views (not the dashboard itself) */
export const COCKPIT_SUB_ROUTES = new Set<Route>([
  'sessions',
  'session-viewer',
  'history',
  'tokens',
  'profile',
  'streak',
  'tasks',
  'achievements',
  'quests',
  'hunter-stats',
]);

interface UseRouterReturn {
  route: Route;
  navigate: (target: Route) => void;
  isHome: boolean;
  /** True when on a cockpit sub-route (sessions, tokens, etc.) */
  isCockpitSubRoute: boolean;
}

export const useRouter = (): UseRouterReturn => {
  const [route, setRoute] = useState<Route>(parseHash);
  const setActiveTab = useSetAtom(activeTopTabAtom);

  useEffect(() => {
    const handleHashChange = () => {
      const r = parseHash();
      setRoute(r);
      if (COCKPIT_SUB_ROUTES.has(r)) {
        setActiveTab('cockpit');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setActiveTab]);

  const navigate = useCallback((target: Route) => {
    window.location.hash = target;
  }, []);

  const isHome = route === 'cockpit';
  const isCockpitSubRoute = COCKPIT_SUB_ROUTES.has(route);

  return { route, navigate, isHome, isCockpitSubRoute };
};
