// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "../feedback/toaster";
import { useServerAction } from "./serverAction";
import { invariantViolation } from "../testing/problems";
import { renderHookWithProviders, renderWithProviders } from "../testing/render";

function setup(request: (id: string) => Promise<Response>) {
  const onSuccess = vi.fn();
  const hook = renderHookWithProviders(() =>
    useServerAction({
      request,
      failure: (id: string) => `Could not archive ${id}`,
      refreshes: (id: string) => [["things"], ["things", id]],
      onSuccess,
    }),
  );
  const invalidate = vi.spyOn(hook.client, "invalidateQueries");
  renderWithProviders(<Toaster />);
  return { ...hook, onSuccess, invalidate };
}

describe("useServerAction", () => {
  afterEach(() => act(() => toaster.remove()));

  it("refreshes what it names and answers true when the request succeeds", async () => {
    const ok = new Response(null, { status: 204 });
    const { result, onSuccess, invalidate } = setup(() => Promise.resolve(ok));

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run("kata");
    });

    expect(done).toBe(true);
    expect(onSuccess).toHaveBeenCalledWith(ok, "kata");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["things"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["things", "kata"] });
  });

  it("tells the user the server's reason and answers false when it refuses", async () => {
    const { result, onSuccess } = setup(() => Promise.resolve(invariantViolation("Already archived")));

    let done: boolean | undefined;
    await act(async () => {
      done = await result.current.run("kata");
    });

    expect(done).toBe(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("Already archived");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("refreshes after a refusal too, since the page may be out of date", async () => {
    const { result, invalidate } = setup(() => Promise.resolve(invariantViolation("Already archived")));

    await act(async () => {
      await result.current.run("kata");
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["things"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["things", "kata"] });
  });

  it("falls back to its own message when the request cannot be sent", async () => {
    const { result } = setup(() => {
      return Promise.reject(new TypeError("Failed to fetch"));
    });

    await act(async () => {
      await result.current.run("kata");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not archive kata");
  });

  it("succeeds without refreshing when it names nothing to refresh", async () => {
    const hook = renderHookWithProviders(() =>
      useServerAction({
        request: () => Promise.resolve(new Response(null, { status: 204 })),
        failure: () => "Could not archive",
      }),
    );
    const invalidate = vi.spyOn(hook.client, "invalidateQueries");

    let done: boolean | undefined;
    await act(async () => {
      done = await hook.result.current.run();
    });

    expect(done).toBe(true);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("is pending while the request is out", async () => {
    let answer: (response: Response) => void = () => undefined;
    const { result } = setup(() => new Promise<Response>((resolve) => (answer = resolve)));

    let running: Promise<boolean> | undefined;
    act(() => {
      running = result.current.run("kata");
    });
    await waitFor(() => expect(result.current.pending).toBe(true));

    await act(async () => {
      answer(new Response(null, { status: 204 }));
      await running;
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
  });
});
