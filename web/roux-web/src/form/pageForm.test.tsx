// @vitest-environment jsdom
import { mutationOptions, useQuery } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sendJson } from "../api/client";
import { createQueryClient } from "../api/queryClient";
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

function updateSettings(settings: AppSettings) {
  return mutationOptions({
    mutationFn: (request: z.output<typeof appSchema>) =>
      sendJson<AppSettings>("PUT", `/api/settings/${settings.id}`, { ...request, version: settings.version }),
    meta: { refreshes: [["settings"]] },
  });
}

/** Serves GET and PUT /api/settings/1, each PUT bumping the version; returns the PUTs' bodies. */
function serveSettings() {
  let record: AppSettings = { id: "1", name: "Roux", version: 3 };
  const bodies: unknown[] = [];
  server.use(
    http.get("/api/settings/1", () => HttpResponse.json(record)),
    http.put("/api/settings/1", async ({ request }) => {
      const body = (await request.json()) as { appName: string; version: number };
      bodies.push(body);
      record = { id: "1", name: body.appName, version: body.version + 1 };
      return HttpResponse.json(record);
    }),
  );
  return { bodies };
}

function SettingsForm({ settings }: { settings: AppSettings }) {
  const form = useSchemaForm({
    schema: appSchema,
    defaultValues: { appName: settings.name },
    mutation: updateSettings(settings),
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

function SettingsPage() {
  const query = useQuery({
    queryKey: ["settings", "1"],
    queryFn: () => fetch("/api/settings/1").then((response) => response.json() as Promise<AppSettings>),
  });
  return query.data ? <SettingsForm settings={query.data} /> : null;
}

async function showPage() {
  renderWithProviders(<SettingsPage />, createQueryClient());
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
});
