import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

/** A query client for one test: no retries, so a failure shows at once. */
export function testQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function providers(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}><ChakraProvider value={defaultSystem}>{children}</ChakraProvider></QueryClientProvider>;
  };
}

/** Renders `ui` inside the providers, with a fresh query client unless one is given. */
export function renderWithProviders(ui: ReactElement, client = testQueryClient(), options?: RenderOptions) {
  return { client, ...render(ui, { wrapper: providers(client), ...options }) };
}

/** Renders `hook` inside the providers, with a fresh query client unless one is given. */
export function renderHookWithProviders<Result, Props>(
  hook: (props: Props) => Result,
  client = testQueryClient(),
  initialProps?: Props,
) {
  return { client, ...renderHook(hook, { wrapper: providers(client), initialProps }) };
}
