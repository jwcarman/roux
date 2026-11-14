// @vitest-environment jsdom
import { mutationOptions, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sendJson } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { Toaster, toaster } from "../feedback/toaster";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { text } from "./rules";
import { useSchemaForm } from "./schemaForm";

const appSchema = z.object({ appName: text() });

interface AppSettings {
  id: string;
  name: string;
  version: number;
}

function updateSettings(settings: AppSettings, settleMs?: number) {
  return mutationOptions({
    mutationFn: (request: z.output<typeof appSchema>) =>
      sendJson<AppSettings>("PUT", `/api/settings/${settings.id}`, { ...request, version: settings.version }),
    meta: { refreshes: [["settings"]] },
    // Settling late lets the refreshed record render before the save is answered.
    ...(settleMs === undefined ? {} : { onSettled: () => new Promise((resolve) => setTimeout(resolve, settleMs)) }),
  });
}

/**
 * Serves GET and PUT /api/settings/1, each PUT bumping the version, or answering 409 when it is not
 * at the current one; returns the PUTs' bodies, and `saveElsewhere` for someone else's save.
 */
function serveSettings() {
  let record: AppSettings = { id: "1", name: "Roux", version: 3 };
  const bodies: unknown[] = [];
  server.use(
    http.get("/api/settings/1", () => HttpResponse.json(record)),
    http.put("/api/settings/1", async ({ request }) => {
      const body = (await request.json()) as { appName: string; version: number };
      bodies.push(body);
      if (body.version !== record.version) {
        return HttpResponse.json(
          { type: "about:blank", title: "Conflict", status: 409, detail: "This record changed since you loaded it" },
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        );
      }
      record = { id: "1", name: body.appName, version: body.version + 1 };
      return HttpResponse.json(record);
    }),
  );
  const saveElsewhere = (name: string) => {
    record = { id: "1", name, version: record.version + 1 };
  };
  return { bodies, saveElsewhere };
}

/** A save that fails without asking the server, with an error that only looks like a 409. */
const failingSave = mutationOptions({
  mutationFn: (request: z.output<typeof appSchema>): Promise<AppSettings> =>
    Promise.reject(Object.assign(new Error(`Offline: ${request.appName} was not saved`), { status: 409 })),
  meta: { refreshes: [["settings"]] },
});

function SettingsForm({
  settings,
  settleMs,
  offline,
}: {
  settings: AppSettings;
  settleMs?: number;
  offline?: boolean;
}) {
  const form = useSchemaForm({
    schema: appSchema,
    defaultValues: { appName: settings.name },
    mutation: offline ? failingSave : updateSettings(settings, settleMs),
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="appName">{(f) => <f.InputField label="App name" />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
        <form.ResetButton />
      </form.Form>
    </form.AppForm>
  );
}

function SettingsPage({ settleMs, offline }: { settleMs?: number; offline?: boolean }) {
  const query = useQuery({
    queryKey: ["settings", "1"],
    queryFn: () => fetch("/api/settings/1").then((response) => response.json() as Promise<AppSettings>),
  });
  return query.data ? <SettingsForm settings={query.data} settleMs={settleMs} offline={offline} /> : null;
}

const loadSettings = () => fetch("/api/settings/1").then((response) => response.json() as Promise<AppSettings>);

/**
 * The record kept in React state rather than in a query, and reloaded by the mutation itself after
 * every answer (as an app's session might keep the signed-in user's profile), with the toaster on.
 */
function StatePage() {
  const [settings, setSettings] = useState<AppSettings>();
  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);
  const reload = () => loadSettings().then(setSettings);
  return (
    <>
      {settings && <StateForm settings={settings} reload={reload} />}
      <Toaster />
    </>
  );
}

function StateForm({ settings, reload }: { settings: AppSettings; reload: () => Promise<void> }) {
  const form = useSchemaForm({
    schema: appSchema,
    defaultValues: { appName: settings.name },
    mutation: {
      mutationFn: (request: z.output<typeof appSchema>) =>
        sendJson<AppSettings>("PUT", "/api/settings/1", { ...request, version: settings.version }),
      onSettled: reload,
    },
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="appName">{(f) => <f.InputField label="App name" />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
        <form.ResetButton />
      </form.Form>
    </form.AppForm>
  );
}

async function showPage(settleMs?: number, offline?: boolean) {
  renderWithProviders(<SettingsPage settleMs={settleMs} offline={offline} />, createQueryClient());
  const user = userEvent.setup();
  await screen.findByRole("textbox", { name: "App name" });
  return user;
}

const appName = () => screen.getByRole("textbox", { name: "App name" });
const saveButton = () => screen.getByRole("button", { name: "Save" });
const resetButton = () => screen.getByRole("button", { name: "Reset" });

async function rename(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.clear(appName());
  await user.type(appName(), name);
}

describe("a form on a page", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("stays after a save, clean, with nothing to reset", async () => {
    const { bodies } = serveSettings();
    const user = await showPage();
    expect(resetButton()).toBeDisabled();

    await rename(user, "Noir");
    expect(resetButton()).toBeEnabled();
    await user.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(appName()).toHaveValue("Noir");
    expect(resetButton()).toBeDisabled();
  });

  it("resets an edit back to the saved values", async () => {
    const { bodies } = serveSettings();
    const user = await showPage();

    await rename(user, "Noir");
    await user.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(saveButton()).toBeEnabled());

    await rename(user, "Other");
    await user.click(resetButton());
    expect(appName()).toHaveValue("Noir");
    expect(resetButton()).toBeDisabled();
  });

  it("sends the refreshed record's version with the next save", async () => {
    const { bodies } = serveSettings();
    const user = await showPage();

    await rename(user, "Noir");
    await user.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(saveButton()).toBeEnabled());

    await rename(user, "Noir 2");
    await user.click(saveButton());

    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([
      { appName: "Noir", version: 3 },
      { appName: "Noir 2", version: 4 },
    ]);
  });

  it.each([
    ["renders after the refusal", undefined],
    ["renders before the refusal", 50],
  ])("starts over from the refreshed record after a conflict (the record %s)", async (_, settleMs) => {
    const { bodies, saveElsewhere } = serveSettings();
    const user = await showPage(settleMs);
    saveElsewhere("Theirs");

    await rename(user, "Mine");
    await user.click(saveButton());

    await waitFor(() => expect(appName()).toHaveValue("Theirs"));
    await waitFor(() => expect(saveButton()).toBeEnabled());
    expect(resetButton()).toBeDisabled();

    await user.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([
      { appName: "Mine", version: 3 },
      { appName: "Theirs", version: 4 },
    ]);
  });

  it("keeps the draft after any other refusal, though the refresh brings a changed record", async () => {
    let record: AppSettings = { id: "1", name: "Roux", version: 3 };
    server.use(
      http.get("/api/settings/1", () => HttpResponse.json(record)),
      http.put("/api/settings/1", () =>
        HttpResponse.json(
          { type: "about:blank", title: "Bad Request", status: 400, detail: "Too long" },
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );
    const user = await showPage();
    record = { id: "1", name: "Theirs", version: 4 };

    await rename(user, "Mine");
    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(appName()).toHaveValue("Mine");
    // The refresh did bring their record: it is what Reset goes back to.
    await user.click(resetButton());
    expect(appName()).toHaveValue("Theirs");
  });

  it("keeps the draft when a save fails with an error that is not the server's 409", async () => {
    let record: AppSettings = { id: "1", name: "Roux", version: 3 };
    server.use(http.get("/api/settings/1", () => HttpResponse.json(record)));
    const user = await showPage(undefined, true);
    record = { id: "1", name: "Theirs", version: 4 };

    await rename(user, "Mine");
    await user.click(saveButton());

    await waitFor(() => expect(saveButton()).toBeEnabled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(appName()).toHaveValue("Mine");
    // The refresh did bring their record: it is what Reset goes back to.
    await user.click(resetButton());
    expect(appName()).toHaveValue("Theirs");
  });

  it("starts over after a conflict when the mutation itself reloads a record kept in state", async () => {
    const { bodies, saveElsewhere } = serveSettings();
    renderWithProviders(<StatePage />, createQueryClient());
    const user = userEvent.setup();
    await screen.findByRole("textbox", { name: "App name" });
    saveElsewhere("Theirs");

    await rename(user, "Mine");
    await user.click(saveButton());

    expect(await screen.findByText("This record changed since you loaded it")).toBeInTheDocument();
    await waitFor(() => expect(appName()).toHaveValue("Theirs"));

    await user.click(saveButton());
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ appName: "Theirs", version: 4 });
  });
});
