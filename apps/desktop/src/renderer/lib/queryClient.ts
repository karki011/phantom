/**
 * TanStack Query client -- shared instance for the app.
 * Used by both React (QueryClientProvider) and Jotai (queryClientAtom).
 *
 * @author Subash Karki
 */
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Localhost server = ~0ms latency, so stale-while-revalidate is ideal
      staleTime: 10_000, // Consider data fresh for 10s
      gcTime: 5 * 60_000, // Keep unused data in cache for 5 min
      refetchOnWindowFocus: true, // Refetch when user returns to app
      retry: 1, // One retry on failure
      structuralSharing: true, // Prevent re-renders when data hasn't changed
    },
  },
});
