/**
 * useRouter Hook
 * Simple hash-based router for PhantomOS cockpit navigation
 *
 * @author Subash Karki
 */
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | 'cockpit'
  | 'sessions'
  | 'history'
  | 'tokens'
  | 'profile'
  | 'streak'
  | 'tasks'
  | 'achievements'
  | 'quests';

const VALID_ROUTES = new Set<Route>([
  'cockpit',
  'sessions',
  'history',
  'tokens',
  'profile',
  'streak',
  'tasks',
  'achievements',
  'quests',
]);

const DEFAULT_ROUTE: Route = 'cockpit';

const parseHash = (): Route => {
  const hash = window.location.hash.replace('#', '');
  return VALID_ROUTES.has(hash as Route) ? (hash as Route) : DEFAULT_ROUTE;
};

interface UseRouterReturn {
  route: Route;
  navigate: (target: Route) => void;
  isHome: boolean;
}

export const useRouter = (): UseRouterReturn => {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash());
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const navigate = useCallback((target: Route) => {
    window.location.hash = target;
  }, []);

  const isHome = route === 'cockpit';

  return { route, navigate, isHome };
};
