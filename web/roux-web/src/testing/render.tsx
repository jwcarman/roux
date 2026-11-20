import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, renderHook, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { createQueryClient } from "../api/queryClient";
import { ThemeProvider } from "../theme/ThemeProvider";

/**
 * The app's query client (`createQueryClient`, so a mutation's `meta.refreshes` works) for one test,
 * with no retries, so a failure shows at once.
 */
export function testQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false } });
  return client;
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    );
  };
}

/** Renders `ui` inside roux's providers (the query client and the theme), with a fresh query client unless one is given. */
export function renderWithProviders(ui: ReactElement, client = testQueryClient(), options?: RenderOptions) {
  return { client, ...render(ui, { wrapper: providers(client), ...options }) };
}

/** Renders `hook` inside roux's providers (the query client and the theme), with a fresh query client unless one is given. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  client = testQueryClient(),
  initialProps?: Props,
) {
  return { client, ...renderHook(hook, { wrapper: providers(client), initialProps }) };
}
