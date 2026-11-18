// @vitest-environment jsdom
import { mutationOptions } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import { Toaster, toaster } from "../feedback/toaster";
import { ApiError } from "./client";
import { createQueryClient } from "./queryClient";
import { optimisticMutation, useOptimisticToggle, useOptimisticValue, type OptimisticMutation } from "./optimistic";
import { renderHookWithProviders, renderWithProviders } from "../testing/render";

/** A save the test answers by hand: what was asked, in the order it reached the "server". */
function fakeSave<V>() {
  const reached: V[] = [];
  const answers: ((outcome: "ok" | Error) => void)[] = [];
  const save = (value: V) =>
    new Promise<string>((resolve, reject) => {
      reached.push(value);
      answers.push((outcome) => (outcome === "ok" ? resolve("saved") : reject(outcome)));
    });
  return { reached, answers, save };
}

const KEY = ["marks", "ada"] as const;
const REFRESHES = { refreshes: [["marks"]] } as const;

describe("optimisticMutation", () => {
  it("names the mutation by the key, and scopes its saves by it", () => {
    const options = optimisticMutation(["marks", { student: 1 }], {
      mutationFn: (present: boolean) => Promise.resolve(present),
      meta: REFRESHES,
    });

    expect(options.mutationKey).toEqual(["marks", { student: 1 }]);
    expect(options.scope).toEqual({ id: '["marks",{"student":1}]' });
    expect(options.meta).toEqual(REFRESHES);
  });

  it("marks what it makes, which the hooks check at run time too", () => {
    const made = optimisticMutation(KEY, { mutationFn: () => Promise.resolve(1), meta: REFRESHES });

    expect(Object.getOwnPropertySymbols(made).map((symbol): unknown => Reflect.get(made, symbol))).toEqual([true]);
    const plain = { mutationFn: () => Promise.resolve(true), mutationKey: KEY, scope: { id: "x" } };
    expect(() =>
      // @ts-expect-error a plain mutation has no mark
      renderHookWithProviders(() => useOptimisticToggle(plain, false), createQueryClient()),
    ).toThrow("take the options optimisticMutation(key, options) makes");
  });

  it("keeps the options it is given", () => {
    const onError = () => undefined;
    const options = optimisticMutation(KEY, { mutationFn: () => Promise.resolve(1), onError, meta: REFRESHES });

    expect(options.onError).toBe(onError);
  });

  it("is the only kind of options the hooks take", () => {
    const plain = mutationOptions({ mutationFn: (present: boolean) => Promise.resolve(present) });
    expectTypeOf(plain).not.toExtend<OptimisticMutation<boolean, boolean>>();
    // @ts-expect-error `meta.refreshes` is required, so the control shows what the server holds
    optimisticMutation(KEY, { mutationFn: (present: boolean) => Promise.resolve(present) });
    // @ts-expect-error `meta.refreshes` names at least one query
    optimisticMutation(KEY, { mutationFn: (present: boolean) => Promise.resolve(present), meta: { refreshes: [] } });
    const made = optimisticMutation(KEY, {
      mutationFn: (present: boolean) => Promise.resolve(present),
      meta: REFRESHES,
    });
    expectTypeOf(made).toExtend<OptimisticMutation<boolean, boolean>>();
  });
});

describe("useOptimisticValue", () => {
  afterEach(() => act(() => toaster.remove()));

  function setup(serverValue: number) {
    const server = fakeSave<number>();
    const mutation = optimisticMutation(KEY, { mutationFn: server.save, meta: REFRESHES });
    const hook = renderHookWithProviders(
      (props: { server: number }) => useOptimisticValue(mutation, props.server),
      createQueryClient(),
      { server: serverValue },
    );
    return { ...server, hook };
  }

  it("shows the server's value until something is asked", () => {
    const { hook } = setup(3);

    expect(hook.result.current[0]).toBe(3);
  });

  it("shows a value at once, and the server's again once it has answered and the query holds it", async () => {
    const { hook, reached, answers } = setup(3);

    let saving: Promise<boolean> | undefined;
    act(() => {
      saving = hook.result.current[1](5);
    });

    await waitFor(() => expect(hook.result.current[0]).toBe(5));
    expect(reached).toEqual([5]);
    await act(async () => {
      answers[0]?.("ok");
      hook.rerender({ server: 5 });
      expect(await saving).toBe(true);
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(5));
  });

  it("queues saves in the order they were made, showing the latest while any is waiting", async () => {
    const { hook, reached, answers } = setup(1);

    const saving: Promise<boolean>[] = [];
    act(() => {
      saving.push(hook.result.current[1](2));
      saving.push(hook.result.current[1](3));
    });

    // Only the first has reached the server; the second waits its turn, but is already shown.
    await waitFor(() => expect(reached).toEqual([2]));
    await waitFor(() => expect(hook.result.current[0]).toBe(3));

    await act(async () => {
      answers[0]?.("ok");
      await saving[0];
    });
    await waitFor(() => expect(reached).toEqual([2, 3]));
    // The first has been answered, the second has not: still the latest, not the server's.
    expect(hook.result.current[0]).toBe(3);

    await act(async () => {
      answers[1]?.("ok");
      hook.rerender({ server: 3 });
      await saving[1];
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(3));
  });

  it("goes back to the server's value, and tells the user why, when a save is refused", async () => {
    renderWithProviders(<Toaster />);
    const { hook, answers } = setup(1);

    let saving: Promise<boolean> | undefined;
    act(() => {
      saving = hook.result.current[1](9);
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(9));

    await act(async () => {
      answers[0]?.(new ApiError(409, { type: "about:blank", title: "Conflict", status: 409, detail: "Already full" }));
      expect(await saving).toBe(false);
    });

    await waitFor(() => expect(hook.result.current[0]).toBe(1));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Already full");
  });

  it("titles the toast with the failure it is given", async () => {
    renderWithProviders(<Toaster />);
    const server = fakeSave<number>();
    const mutation = optimisticMutation(KEY, { mutationFn: server.save, meta: REFRESHES });
    const { result } = renderHookWithProviders(
      () => useOptimisticValue(mutation, 1, { failure: (value) => `Could not set ${value}` }),
      createQueryClient(),
    );

    let saving: Promise<boolean> | undefined;
    act(() => {
      saving = result.current[1](4);
    });
    await waitFor(() => expect(server.reached).toEqual([4]));
    await act(async () => {
      server.answers[0]?.(new Error("down"));
      await saving;
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not set 4");
  });

  it("keeps a control apart from one whose key only begins the same", async () => {
    const server = fakeSave<number>();
    const control = optimisticMutation(["marks", "ada"], { mutationFn: server.save, meta: REFRESHES });
    const detail = optimisticMutation(["marks", "ada", "late"], { mutationFn: server.save, meta: REFRESHES });
    const { result } = renderHookWithProviders(
      () => ({ control: useOptimisticValue(control, 1), detail: useOptimisticValue(detail, 1) }),
      createQueryClient(),
    );

    act(() => {
      void result.current.detail[1](6);
    });

    await waitFor(() => expect(result.current.detail[0]).toBe(6));
    expect(result.current.control[0]).toBe(1);
  });

  it("keeps the controls of other keys apart", async () => {
    const server = fakeSave<number>();
    const first = optimisticMutation(["marks", "ada"], { mutationFn: server.save, meta: REFRESHES });
    const second = optimisticMutation(["marks", "grace"], { mutationFn: server.save, meta: REFRESHES });
    const { result } = renderHookWithProviders(
      () => ({ ada: useOptimisticValue(first, 1), grace: useOptimisticValue(second, 1) }),
      createQueryClient(),
    );

    act(() => {
      void result.current.ada[1](7);
    });

    await waitFor(() => expect(result.current.ada[0]).toBe(7));
    expect(result.current.grace[0]).toBe(1);
    // Different scopes: both reach the server without waiting for each other.
    act(() => {
      void result.current.grace[1](8);
    });
    await waitFor(() => expect(server.reached).toEqual([7, 8]));
  });
});

describe("useOptimisticToggle", () => {
  function setup(serverValue: boolean) {
    const server = fakeSave<boolean>();
    const mutation = optimisticMutation(KEY, { mutationFn: server.save, meta: REFRESHES });
    const hook = renderHookWithProviders(
      (props: { server: boolean }) => useOptimisticToggle(mutation, props.server),
      createQueryClient(),
      { server: serverValue },
    );
    return { ...server, hook };
  }

  it("asks for the opposite and shows it at once", async () => {
    const { hook, reached, answers } = setup(false);

    let saving: Promise<boolean> | undefined;
    act(() => {
      saving = hook.result.current[1]();
    });

    await waitFor(() => expect(hook.result.current[0]).toBe(true));
    expect(reached).toEqual([true]);
    await act(async () => {
      answers[0]?.("ok");
      hook.rerender({ server: true });
      await saving;
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(true));
  });

  it("asks true then false for a double tap handled before React shows the first", async () => {
    const { hook, reached, answers } = setup(false);

    const saving: Promise<boolean>[] = [];
    act(() => {
      // Both taps run the handler of the same render, as a real double tap does.
      const [, toggle] = hook.result.current;
      saving.push(toggle());
      saving.push(toggle());
    });

    await waitFor(() => expect(reached).toEqual([true]));
    // The second tap asked for the opposite of the first, though the first was not shown yet.
    await waitFor(() => expect(hook.result.current[0]).toBe(false));
    await act(async () => {
      answers[0]?.("ok");
      await saving[0];
    });
    await waitFor(() => expect(reached).toEqual([true, false]));
    await act(async () => {
      answers[1]?.("ok");
      await saving[1];
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(false));

    // Nothing is waiting any more: the next tap reads what is shown.
    act(() => {
      void hook.result.current[1]();
    });
    await waitFor(() => expect(reached).toEqual([true, false, true]));
  });

  it("keeps asking for the opposite of the last tap while earlier taps are still being answered", async () => {
    const { hook, reached, answers } = setup(false);

    const saving: Promise<boolean>[] = [];
    // Every tap runs the handler of the first render, as quick taps do: none of them can read `shown`.
    const [, toggle] = hook.result.current;
    act(() => {
      saving.push(toggle(), toggle(), toggle());
    });
    await waitFor(() => expect(reached).toEqual([true]));
    await act(async () => {
      answers[0]?.("ok");
      await saving[0];
    });
    act(() => {
      saving.push(toggle());
    });

    // true, false, true were asked; the fourth is false.
    await waitFor(() => expect(reached).toEqual([true, false]));
    await act(async () => {
      answers[1]?.("ok");
      await saving[1];
    });
    await waitFor(() => expect(reached).toEqual([true, false, true]));
    await act(async () => {
      answers[2]?.("ok");
      await saving[2];
    });
    await waitFor(() => expect(reached).toEqual([true, false, true, false]));
    await act(async () => {
      answers[3]?.("ok");
      await saving[3];
    });
  });

  it("reads the shown value again once every tap has been answered, even a refused one", async () => {
    renderWithProviders(<Toaster />);
    const { hook, reached, answers } = setup(false);

    let saving: Promise<boolean> | undefined;
    act(() => {
      saving = hook.result.current[1]();
    });
    await waitFor(() => expect(reached).toEqual([true]));
    await act(async () => {
      answers[0]?.(new Error("down"));
      await saving;
    });
    await waitFor(() => expect(hook.result.current[0]).toBe(false));
    act(() => {
      void hook.result.current[1]();
    });

    await waitFor(() => expect(reached).toEqual([true, true]));
    act(() => toaster.remove());
  });
});
