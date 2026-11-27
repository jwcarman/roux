// A surface drawn from its A2UI JSON and made live by its binding: queries fill its paths, its events run commands.
// Nothing in here knows any one surface.
import { A2uiSurface } from "@a2ui/react";
import { DataModel, MessageProcessor, type ActionPayload } from "@a2ui/web_core";
import { Button, Skeleton, Stack } from "@chakra-ui/react";
import { keepPreviousData, useQueries, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG_ID, type SurfaceJson } from "../a2ui";
import { ApiError, getJson, isSessionLost, sendJson } from "../api/client";
import { refusalToast } from "../api/serverAction";
import { useWidePage } from "../navigation/AppShell";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { notify } from "../feedback/notify";
import { wiringOf, type Arg, type Binding, type EventWiring, type Port, type Wiring } from "./bind";
import { surfaceComponents } from "./components";

type Write = (path: string, value: unknown) => void;

/** A surface's model (what A2uiSurface renders), reads and writes of its data, and its first values. */
function start(surface: SurfaceJson, wiring: Wiring) {
  const processor = new MessageProcessor([surfaceComponents]);
  processor.processMessages([
    { version: "1.0", createSurface: { surfaceId: surface.id, catalogId: CATALOG_ID } },
    { version: "1.0", updateComponents: { surfaceId: surface.id, components: surface.components } },
    { version: "1.0", updateDataModel: { surfaceId: surface.id, value: wiring.initial } },
  ]);
  // createSurface above made it: processMessages throws rather than leave it out.
  const surfaces = processor.model.surfacesMap;
  const model = surfaces.get(surface.id) as NonNullable<ReturnType<typeof surfaces.get>>;
  const write: Write = (path, value) =>
    processor.processMessages([{ version: "1.0", updateDataModel: { surfaceId: surface.id, path, value } }]);
  return {
    model,
    read: (path: string): unknown => model.dataModel.get(path),
    write,
    first: new DataModel(wiring.initial),
  };
}

const isPath = (arg: Arg): arg is { path: string } => "path" in arg;
const argsOf = (port: Port, read: (path: string) => unknown) =>
  Object.fromEntries(Object.entries(port.args).map(([name, arg]) => [name, isPath(arg) ? read(arg.path) : arg.value]));
const argPaths = (port: Port): string[] =>
  Object.values(port.args)
    .filter(isPath)
    .map((arg) => arg.path);

/** The queries that depend on what `command` emits: marked stale, and those on screen refetched and waited for. */
async function refetchAfter(command: string, wiring: Wiring, client: QueryClient): Promise<void> {
  const emitted = wiring.contract.commands[command].emits;
  const stale = Object.entries(wiring.contract.queries)
    .filter(([, query]) => query.dependsOn.some((event) => emitted.includes(event)))
    .map(([name]) => name);
  await Promise.all(stale.map((name) => client.invalidateQueries({ queryKey: ["queries", name] })));
}

/** Writes a query's answer to its path once it comes; a path keeps its last answer while the next loads or fails. */
function Answer({ data, path, write }: Readonly<{ data: unknown; path: string; write: Write }>) {
  useEffect(() => {
    if (data !== undefined) write(path, data);
  }, [data, path, write]);
  return null;
}

/**
 * Renders `surface` (its JSON, as drawn) live: `binding` (from `bind`) fills its paths from queries and runs a command
 * for each event. A skeleton shows until every query's first answer; a failed query shows an inline error with Retry.
 */
export function Surface({ surface, binding }: Readonly<{ surface: SurfaceJson; binding: Binding }>) {
  useWidePage();
  const wiring = wiringOf(binding);
  const client = useQueryClient();
  const live = useMemo(() => start(surface, wiring), [surface, wiring]);
  const { model, read, write, first } = live;

  // A query's args are read from the paths they name, and it refetches when one changes. When any of them other than
  // the page changes, the page goes back to 0: page 3 of the old filter is not a page of the new one.
  const [, changed] = useState({});
  useEffect(() => {
    const subscriptions = wiring.ports.flatMap((port) =>
      argPaths(port).map((path) =>
        live.model.dataModel.subscribe(path, () => {
          const page = port.args.pageIndex;
          if (page !== undefined && isPath(page) && page.path !== path) live.write(page.path, 0);
          changed({});
        }),
      ),
    );
    return () => subscriptions.forEach((subscription) => subscription.unsubscribe());
  }, [live, wiring]);

  const results = useQueries({
    queries: wiring.ports.map((port) => {
      const params = argsOf(port, read);
      return {
        queryKey: ["queries", port.query, params],
        queryFn: ({ signal }: { signal: AbortSignal }) => getJson<unknown>(`queries/${port.query}`, { params, signal }),
        placeholderData: keepPreviousData,
      };
    }),
  });

  // Events run commands: one in flight per event; one Idempotency-Key per attempt, reused on a retry, renewed after
  // a success.
  const keys = useRef(new Map<string, string>());
  const busy = useRef(new Set<string>());
  const onAction = (action: ActionPayload) => {
    const event = wiring.events[action.name];
    if (event === undefined) {
      notify.error(`"${action.name}" is not bound to a command yet`);
      return;
    }
    if (busy.current.has(action.name)) return;
    busy.current.add(action.name);
    void run(action, event).finally(() => busy.current.delete(action.name));
  };
  useEffect(() => {
    const subscription = model.onAction.subscribe(onAction);
    return () => subscription.unsubscribe();
  });

  async function run(action: ActionPayload, event: EventWiring) {
    const { errors } = event;
    if (errors !== undefined) write(errors, first.get(errors));
    const key = keys.current.get(action.name) ?? crypto.randomUUID();
    keys.current.set(action.name, key);
    try {
      await sendJson("POST", `commands/${event.command}`, event.build(action.context), {
        headers: { "Idempotency-Key": key },
      });
    } catch (error) {
      // A field problem goes under errors when the surface has a place for it; any other refusal, or a field problem
      // with no place, is roux's error toast, so nothing the server said goes unseen.
      const fields = error instanceof ApiError ? (error.problem.errors ?? []) : [];
      // A place is a path the errors local starts with; with no errors path there is none (no local is "undefined").
      const placed = fields
        .map((field) => ({ path: `${errors}/${field.field.replaceAll(".", "/")}`, message: field.message }))
        .filter(({ path }) => first.get(path) !== undefined);
      for (const { path, message } of placed) write(path, message);
      if (fields.length === 0 || placed.length < fields.length) refusalToast(error, "Could not save");
      return;
    }
    keys.current.delete(action.name);
    await refetchAfter(event.command, wiring, client);
    for (const step of event.onSuccess) {
      if ("reset" in step) write(step.reset, first.get(step.reset));
      else if ("set" in step) write(step.set, step.value);
      else notify.success(step.toast);
    }
  }

  const ready = results.every((result, i) => result.data !== undefined || read(wiring.ports[i].path) !== undefined);
  const failure = results
    .map((result) => result.error)
    .find((error): error is Error => error !== null && !isSessionLost(error));
  return (
    <Stack gap="4">
      {results.map((result, i) => (
        <Answer key={wiring.ports[i].path} data={result.data} path={wiring.ports[i].path} write={write} />
      ))}
      {failure && (
        <Stack gap="2" align="start">
          <ErrorMessage title="Could not load this">{failure.message}</ErrorMessage>
          <Button
            size="sm"
            onClick={() => results.filter((result) => result.isError).forEach((result) => void result.refetch())}
          >
            Retry
          </Button>
        </Stack>
      )}
      {ready ? <A2uiSurface surface={model} /> : !failure && <Loading />}
    </Stack>
  );
}

function Loading() {
  return (
    <Stack gap="3" role="status" aria-label="Loading">
      <Skeleton height="8" width="40%" />
      <Skeleton height="24" />
      <Skeleton height="24" />
    </Stack>
  );
}
