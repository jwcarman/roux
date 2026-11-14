// @vitest-environment jsdom
import { mutationOptions, QueryClient, useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "../feedback/toaster";
import { ApiError, sendJson } from "./client";
import { createQueryClient } from "./queryClient";
import { assertRefreshesHonoured, refusalToast, useServerAction } from "./serverAction";
import { invariantViolation } from "../testing/problems";
import { renderHookWithProviders, renderWithProviders } from "../testing/render";
import { server } from "../testing/server";

interface Archived {
  id: string;
}

const archive = mutationOptions({
  mutationFn: (customer: { id: string; name: string }) =>
    sendJson<Archived>("POST", `/api/customers/${customer.id}/archive`),
  meta: { refreshes: [["customers"]] },
});

function answerArchive(response: () => Response) {
  server.use(http.post("/api/customers/:id/archive", () => response()));
}

describe("useServerAction", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
  });

  afterEach(() => act(() => toaster.remove()));

  it("answers true, refetches what the mutation's meta names, and gives onSuccess the data", async () => {
    let lists = 0;
    server.use(http.get("/api/customers", () => HttpResponse.json({ n: ++lists })));
    answerArchive(() => Response.json({ id: "7" }));
    const onSuccess = vi.fn();
    const client = createQueryClient();
    const hook = renderHookWithProviders(
      () => ({
        query: useQuery({
          queryKey: ["customers"],
          queryFn: async () => (await fetch("/api/customers")).json() as Promise<{ n: number }>,
        }),
        action: useServerAction(archive, { onSuccess }),
      }),
      client,
    );
    await waitFor(() => expect(hook.result.current.query.data).toEqual({ n: 1 }));

    let done: boolean | undefined;
    await act(async () => {
      done = await hook.result.current.action.run({ id: "7", name: "Acme" });
    });

    expect(done).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith({ id: "7" }, { id: "7", name: "Acme" });
    await waitFor(() => expect(hook.result.current.query.data).toEqual({ n: 2 }));
  });

  it("toasts the server's reason under the default title and answers false on a refusal", async () => {
    answerArchive(() => invariantViolation("Already archived"));
    renderWithProviders(<Toaster />);
    const { result } = renderHookWithProviders(() => useServerAction(archive), createQueryClient());

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run({ id: "7", name: "Acme" });
    });

    expect(done).toBe(false);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Already archived");
  });

  it("titles the toast with failure(variables)", async () => {
    answerArchive(() => invariantViolation("Already archived"));
    renderWithProviders(<Toaster />);
    const { result } = renderHookWithProviders(
      () => useServerAction(archive, { failure: (v) => `Could not archive ${v.name}` }),
      createQueryClient(),
    );

    await act(async () => {
      await result.current.run({ id: "7", name: "Acme" });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not archive Acme");
  });

  it("titles the toast with a fixed failure string", async () => {
    answerArchive(() => invariantViolation("Already archived"));
    renderWithProviders(<Toaster />);
    const { result } = renderHookWithProviders(
      () => useServerAction(archive, { failure: "Archive failed" }),
      createQueryClient(),
    );

    await act(async () => {
      await result.current.run({ id: "7", name: "Acme" });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Archive failed");
  });

  it("answers false without a toast when the session is lost (401)", async () => {
    answerArchive(() => new Response(null, { status: 401 }));
    renderWithProviders(<Toaster />);
    const { result } = renderHookWithProviders(() => useServerAction(archive), createQueryClient());

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run({ id: "7", name: "Acme" });
    });

    expect(done).toBe(false);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts the title alone when the request could not be sent", async () => {
    renderWithProviders(<Toaster />);
    const failing = mutationOptions({
      mutationFn: (): Promise<void> => Promise.reject(new TypeError("Failed to fetch")),
    });
    const { result } = renderHookWithProviders(() => useServerAction(failing), createQueryClient());

    await act(async () => {
      await result.current.run();
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(document.querySelector("[data-part=description]")).toBeNull();
  });

  it("still runs the mutation's own onSuccess and onError", async () => {
    const own = { onSuccess: vi.fn(), onError: vi.fn() };
    renderWithProviders(<Toaster />);
    const calls = vi.fn<(fail: boolean) => Promise<string>>();
    const mutation = mutationOptions({
      mutationFn: (fail: boolean) => calls(fail),
      onSuccess: own.onSuccess,
      onError: own.onError,
    });
    const hookOnSuccess = vi.fn();
    const { result } = renderHookWithProviders(
      () => useServerAction(mutation, { onSuccess: hookOnSuccess }),
      createQueryClient(),
    );

    calls.mockResolvedValueOnce("ok");
    await act(async () => {
      await result.current.run(false);
    });
    calls.mockRejectedValueOnce(new ApiError(500, { type: "about:blank", title: "Oops", status: 500 }));
    await act(async () => {
      await result.current.run(true);
    });

    expect(own.onSuccess).toHaveBeenCalledOnce();
    expect(hookOnSuccess).toHaveBeenCalledOnce();
    expect(own.onError).toHaveBeenCalledOnce();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  });

  it("is pending while the request is out", async () => {
    let answer: (value: string) => void = () => undefined;
    const slow = mutationOptions({ mutationFn: () => new Promise<string>((resolve) => (answer = resolve)) });
    const { result } = renderHookWithProviders(() => useServerAction(slow), createQueryClient());

    let running: Promise<boolean> | undefined;
    act(() => {
      running = result.current.run();
    });
    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      answer("done");
      await running;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

  it("answers true without an onSuccess", async () => {
    answerArchive(() => Response.json({ id: "7" }));
    renderWithProviders(<Toaster />);
    const { result } = renderHookWithProviders(() => useServerAction(archive), createQueryClient());

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run({ id: "7", name: "Acme" });
    });

    expect(done).toBe(true);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects, naming createQueryClient, when meta.refreshes meets a plain QueryClient", async () => {
    answerArchive(() => Response.json({ id: "7" }));
    const { result } = renderHookWithProviders(() => useServerAction(archive), new QueryClient());

    await expect(result.current.run({ id: "7", name: "Acme" })).rejects.toThrow(
      "meta.refreshes needs roux's query client: use createQueryClient() from @jwcarman/roux-web/api",
    );
  });
});

describe("assertRefreshesHonoured", () => {
  it("accepts a mutation without refreshes on any client", () => {
    expect(() => assertRefreshesHonoured(new QueryClient(), {})).not.toThrow();
    expect(() => assertRefreshesHonoured(new QueryClient(), { meta: {} })).not.toThrow();
  });

  it("accepts refreshes on roux's client", () => {
    expect(() => assertRefreshesHonoured(createQueryClient(), { meta: { refreshes: [["a"]] } })).not.toThrow();
  });
});

describe("refusalToast", () => {
  afterEach(() => act(() => toaster.remove()));

  it("says nothing for a lost session", () => {
    const create = vi.spyOn(toaster, "create");
    refusalToast(new ApiError(401), "Could not save");
    expect(create).not.toHaveBeenCalled();
    create.mockRestore();
  });
});
