import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { render, renderHook, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { ThemeProvider } from "@jwcarman/roux-web/theme";

/** The app's query client (so mutations' `meta.refreshes` work), for one test: no retries, so a failure shows at once. */
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

/** Renders `ui` inside the app's providers, with a fresh query client unless one is given. */
export function renderWithProviders(ui: ReactElement, client = testQueryClient(), options?: RenderOptions) {
  return { client, ...render(ui, { wrapper: providers(client), ...options }) };
}

/** Renders `hook` inside the app's providers, with a fresh query client unless one is given. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  client = testQueryClient(),
  initialProps?: Props,
) {
  return { client, ...renderHook(hook, { wrapper: providers(client), initialProps }) };
}
