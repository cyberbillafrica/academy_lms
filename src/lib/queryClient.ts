import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // keep data fresh for 30s, avoid refetch spam
      retry: 1,
    },
  },
});