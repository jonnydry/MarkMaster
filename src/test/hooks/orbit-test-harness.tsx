import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, type RenderHookOptions } from "@testing-library/react";
import type { ReactNode } from "react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function createOrbitHookWrapper(queryClient = createTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }

  return { Wrapper, queryClient };
}

export function renderOrbitHook<Result, Props>(
  hook: (props: Props) => Result,
  options?: RenderHookOptions<Props> & { queryClient?: QueryClient }
) {
  const queryClient = options?.queryClient ?? createTestQueryClient();
  const { Wrapper } = createOrbitHookWrapper(queryClient);

  return {
    ...renderHook(hook, {
      ...options,
      wrapper: options?.wrapper ?? Wrapper,
    }),
    queryClient,
  };
}
