// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { mutationOptions, useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { sendJson } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { Toaster, toaster } from "../feedback/toaster";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { useAppForm } from "./form";
import { FormDialog } from "./FormDialog";
import { text } from "./rules";
import { useSchemaForm } from "./schemaForm";

function Harness({ onSave }: { onSave: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      if (await onSave(value.name)) {
        setOpen(false);
      }
    },
  });
  return (
    <>
      <Button onClick={() => form.setFieldValue("name", "Draft")}>Prefill</Button>
      <FormDialog
        form={form}
        title="Name something"
        trigger={<Button>Open</Button>}
        submitLabel="Save"
        open={open}
        onOpenChange={setOpen}
      >
        <form.AppField name="name">{(field) => <field.InputField label="Name" />}</form.AppField>
      </FormDialog>
    </>
  );
}

async function openDialog(onSave: (name: string) => Promise<boolean> = () => Promise.resolve(true)) {
  const save = vi.fn(onSave);
  renderWithProviders(<Harness onSave={save} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Name something" });
  return { save, user, dialog };
}

describe("FormDialog", () => {
  it("opens a dialog named by its title, holding the form", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toContainElement(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("submits the form from the footer and closes when the caller says it saved", async () => {
    const { save, user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("Ada"));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("saves again when opened again after a save", async () => {
    const { save, user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));

    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "open"),
    );
    await user.type(screen.getByLabelText("Name"), "Grace");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith("Grace");
  });

  it("stays open when the save fails", async () => {
    const { user, dialog } = await openDialog(() => Promise.resolve(false));
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "open"));
  });

  it("closes on Escape and on Cancel, and starts empty when opened again", async () => {
    const { user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));

    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "open"),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("does not empty the form as it opens, only once it has closed", async () => {
    renderWithProviders(<Harness onSave={() => Promise.resolve(true)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Prefill" }));

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByLabelText("Name")).toHaveValue("Draft");
  });
});

const nameSchema = z.object({ name: text() });

interface Person {
  id: string;
  name: string;
  version: number;
}

const createPerson = mutationOptions({
  mutationFn: (request: z.output<typeof nameSchema>) => sendJson<Person>("POST", "/api/people", request),
  meta: { refreshes: [["people"]] },
});

function updatePerson(person: Person) {
  return mutationOptions({
    mutationFn: (request: z.output<typeof nameSchema>) =>
      sendJson<Person>("PUT", `/api/people/${person.id}`, { ...request, version: person.version }),
    meta: { refreshes: [["people", person.id]] },
  });
}

/** Answers POST /api/people with `answer`, recording each request's body. */
function answerCreate(answer: () => Response = () => Response.json({ id: "7", name: "Ann", version: 0 })) {
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/people", async ({ request }) => {
      bodies.push(await request.json());
      return answer();
    }),
  );
  return { bodies };
}

const nameField = () => screen.getByRole("textbox", { name: "Name" });
const dialogNamed = (title: string) => screen.getByRole("dialog", { name: title });

async function openIt(user: ReturnType<typeof userEvent.setup>, trigger: string, title: string) {
  await user.click(screen.getByRole("button", { name: trigger }));
  await waitFor(() => expect(dialogNamed(title)).toHaveAttribute("data-state", "open"));
}

/** Whether the dialog named `title` is open: in the page and in its open state. */
function isOpen(title: string) {
  return screen.queryByRole("dialog", { name: title })?.getAttribute("data-state") === "open";
}

function closed(title: string) {
  return waitFor(() => expect(isOpen(title)).toBe(false));
}

function CreateDialog({ onSuccess, submitLabel }: { onSuccess?: () => void; submitLabel?: string }) {
  const form = useSchemaForm({ schema: nameSchema, defaultValues: { name: "" }, mutation: createPerson, onSuccess });
  return (
    <FormDialog form={form} title="New person" trigger={<Button>New</Button>} submitLabel={submitLabel}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
    </FormDialog>
  );
}

function showCreate(props: { onSuccess?: () => void; submitLabel?: string } = {}) {
  renderWithProviders(
    <>
      <CreateDialog {...props} />
      <Toaster />
    </>,
    createQueryClient(),
  );
  return userEvent.setup();
}

describe("FormDialog managing itself", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
  });

  afterEach(() => act(() => toaster.remove()));

  it("opens from its trigger and closes after a save, once onSuccess has run", async () => {
    const { bodies } = answerCreate();
    const calls: string[] = [];
    const onSuccess = vi.fn(() => {
      calls.push(isOpen("New person") ? "open" : "closed");
    });
    const user = showCreate({ onSuccess });

    await openIt(user, "New", "New person");
    await user.type(nameField(), "Ann");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await closed("New person");
    expect(bodies).toEqual([{ name: "Ann" }]);
    expect(calls).toEqual(["open"]);
  });

  it("stays open on a refusal, with the refusal toasted", async () => {
    answerCreate(
      () =>
        new Response(JSON.stringify({ type: "about:blank", title: "Conflict", status: 409, detail: "Ann is taken" }), {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        }),
    );
    const user = showCreate();

    await openIt(user, "New", "New person");
    await user.type(nameField(), "Ann");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ann is taken");
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(dialogNamed("New person")).toHaveAttribute("data-state", "open");
    expect(nameField()).toHaveValue("Ann");
  });

  it("shows the empty defaults when a create dialog is opened again after a save", async () => {
    answerCreate();
    const user = showCreate();

    await openIt(user, "New", "New person");
    await user.type(nameField(), "Ann");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await closed("New person");

    await openIt(user, "New", "New person");
    expect(nameField()).toHaveValue("");
  });

  it("shows the saved record when an edit dialog is opened again after a save", async () => {
    let record: Person = { id: "7", name: "Ann", version: 1 };
    const bodies: unknown[] = [];
    server.use(
      http.get("/api/people/7", () => HttpResponse.json(record)),
      http.put("/api/people/7", async ({ request }) => {
        const body = (await request.json()) as { name: string; version: number };
        bodies.push(body);
        record = { id: "7", name: body.name, version: body.version + 1 };
        return HttpResponse.json(record);
      }),
    );
    function EditDialog({ person }: { person: Person }) {
      const form = useSchemaForm({
        schema: nameSchema,
        defaultValues: { name: person.name },
        mutation: updatePerson(person),
      });
      return (
        <FormDialog form={form} title="Edit person" trigger={<Button>Edit</Button>}>
          <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
        </FormDialog>
      );
    }
    function Page() {
      const query = useQuery({
        queryKey: ["people", "7"],
        queryFn: () => fetch("/api/people/7").then((r) => r.json() as Promise<Person>),
      });
      return query.data ? <EditDialog person={query.data} /> : null;
    }
    renderWithProviders(<Page />, createQueryClient());
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Edit" });

    await openIt(user, "Edit", "Edit person");
    expect(nameField()).toHaveValue("Ann");
    await user.clear(nameField());
    await user.type(nameField(), "Bea");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await closed("Edit person");

    await openIt(user, "Edit", "Edit person");
    expect(nameField()).toHaveValue("Bea");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies).toEqual([
      { name: "Bea", version: 1 },
      { name: "Bea", version: 2 },
    ]);
  });

  it("empties it when cancelled, so it opens again at its defaults", async () => {
    const user = showCreate();

    await openIt(user, "New", "New person");
    await user.type(nameField(), "Ann");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await closed("New person");

    await openIt(user, "New", "New person");
    expect(nameField()).toHaveValue("");
  });

  it("labels its submit button Save unless told otherwise", async () => {
    const user = showCreate();
    await openIt(user, "New", "New person");
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("type", "submit");
  });

  it("labels its submit button as told", async () => {
    const user = showCreate({ submitLabel: "Create" });
    await openIt(user, "New", "New person");
    expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("type", "submit");
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("tells a controlling page each change, and asks it to close after a save", async () => {
    answerCreate();
    const changes: boolean[] = [];
    function Controlled() {
      const [open, setOpen] = useState(false);
      const form = useSchemaForm({ schema: nameSchema, defaultValues: { name: "" }, mutation: createPerson });
      return (
        <>
          <p>{open ? "Page says open" : "Page says closed"}</p>
          <FormDialog
            form={form}
            title="New person"
            trigger={<Button>New</Button>}
            open={open}
            onOpenChange={(next) => {
              changes.push(next);
              setOpen(next);
            }}
          >
            <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
          </FormDialog>
        </>
      );
    }
    renderWithProviders(<Controlled />, createQueryClient());
    const user = userEvent.setup();

    await openIt(user, "New", "New person");
    expect(changes).toEqual([true]);
    await user.type(nameField(), "Ann");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await closed("New person");
    expect(changes).toEqual([true, false]);
    expect(screen.getByText("Page says closed")).toBeInTheDocument();
  });

  it("tells an uncontrolled caller's onOpenChange each change too", async () => {
    const changes: boolean[] = [];
    function Watched() {
      const form = useSchemaForm({ schema: nameSchema, defaultValues: { name: "" }, mutation: createPerson });
      return (
        <FormDialog
          form={form}
          title="New person"
          trigger={<Button>New</Button>}
          onOpenChange={(next) => changes.push(next)}
        >
          <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
        </FormDialog>
      );
    }
    renderWithProviders(<Watched />, createQueryClient());
    const user = userEvent.setup();

    await openIt(user, "New", "New person");
    await user.keyboard("{Escape}");
    await closed("New person");
    expect(changes).toEqual([true, false]);
  });

  it("stops listening for saves once it is gone", () => {
    const unsubscribe = vi.fn();
    const form = stubForm({ onSaved: () => unsubscribe });
    const { unmount } = renderWithProviders(
      <FormDialog form={form} title="Stub" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </FormDialog>,
    );
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("restarts a form that can, rather than resetting it, once closed", () => {
    const form = stubForm({ restart: vi.fn() });
    renderWithProviders(
      <FormDialog form={form} title="Stub" trigger={<Button>Open</Button>}>
        <p>Body</p>
      </FormDialog>,
    );
    expect(form.restart).toHaveBeenCalledTimes(1);
    expect(form.reset).not.toHaveBeenCalled();
  });
});

/** A stand-in form, to see which of its members FormDialog calls. */
function stubForm<Extra extends object>(extra: Extra) {
  return {
    AppForm: ({ children }: { children?: ReactNode }) => <>{children}</>,
    Form: ({ children }: { children: ReactNode }) => <form>{children}</form>,
    SubmitButton: ({ children }: { children?: ReactNode }) => <button type="submit">{children}</button>,
    reset: vi.fn(),
    ...extra,
  };
}
