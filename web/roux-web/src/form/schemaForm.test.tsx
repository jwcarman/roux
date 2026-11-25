// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { mutationOptions, QueryClient, useQuery } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { sendJson } from "../api/client";
import { createQueryClient } from "../api/queryClient";
import { Toaster, toaster } from "../feedback/toaster";
import { invalidFields, badRequest, stale } from "../testing/problems";
import { renderHookWithProviders, renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { FormDialog } from "./FormDialog";
import { email, text } from "./rules";
import { useSchemaForm, type SchemaForm, type SchemaFormOptions } from "./schemaForm";

const customerSchema = z.object({ name: text().max(5), email: email(), company: text().optional() });

type CustomerSchema = typeof customerSchema;
type CustomerRequest = z.output<CustomerSchema>;

interface Saved {
  id: string;
  name: string;
}

const EMPTY = { name: "", email: "", company: "" };

function createCustomer(version = 0) {
  return mutationOptions({
    mutationFn: (request: CustomerRequest) => sendJson<Saved>("POST", `customers?version=${version}`, request),
    meta: { refreshes: [["customers"]] },
  });
}

/** Answers POST /api/customers with `answer`, recording each request's body and version. */
function answerCreate(answer: () => Response | Promise<Response> = () => Response.json({ id: "7", name: "Ann" })) {
  const bodies: unknown[] = [];
  const versions: (string | null)[] = [];
  server.use(
    http.post("/api/customers", async ({ request }) => {
      bodies.push(await request.json());
      versions.push(new URL(request.url).searchParams.get("version"));
      return answer();
    }),
  );
  return { bodies, versions };
}

/** Holds an answer back until `release` is called. */
function held(response: () => Response) {
  let release: () => void = () => undefined;
  const answered = new Promise<void>((resolve) => (release = resolve));
  return { answer: async () => (await answered, response()), release: () => release() };
}

type Options = Partial<SchemaFormOptions<CustomerSchema, Saved>>;

let current: SchemaForm<CustomerSchema> | undefined;

function Harness({ options = {} }: { options?: Options }) {
  const form = useSchemaForm({ schema: customerSchema, defaultValues: EMPTY, mutation: createCustomer(), ...options });
  current = form;
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
        <form.AppField name="email">{(f) => <f.InputField label="Email" />}</form.AppField>
        <form.AppField name="company">{(f) => <f.InputField label="Company" />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
        <form.ResetButton />
      </form.Form>
    </form.AppForm>
  );
}

function show(options: Options = {}, client: QueryClient = createQueryClient()) {
  renderWithProviders(
    <>
      <Harness options={options} />
      <Toaster />
    </>,
    client,
  );
  return userEvent.setup();
}

const field = (label: string) => screen.getByRole("textbox", { name: label });
const save = () => screen.getByRole("button", { name: "Save" });

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  values: { name?: string; email?: string; company?: string },
) {
  for (const [label, value] of [
    ["Name", values.name],
    ["Email", values.email],
    ["Company", values.company],
  ] as const) {
    if (value !== undefined && value !== "") {
      await user.type(field(label), value);
    }
  }
}

describe("useSchemaForm", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
    current = undefined;
  });

  afterEach(() => act(() => toaster.remove()));

  it("submits the schema's parsed values and gives onSuccess the answer and the values", async () => {
    const { bodies } = answerCreate();
    const onSuccess = vi.fn();
    const user = show({ onSuccess });

    await fill(user, { name: "  Ann ", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const parsed = { name: "Ann", email: "ann@example.com", company: null };
    expect(bodies).toEqual([parsed]);
    expect(onSuccess).toHaveBeenCalledWith({ id: "7", name: "Ann" }, parsed);
  });

  it("shows the schema's error under a field once it is left, and sends nothing", async () => {
    const { bodies } = answerCreate();
    const user = show();

    await user.click(field("Name"));
    await user.tab();

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(field("Name")).toHaveAccessibleDescription("Must not be blank");
    await user.click(save());
    await waitFor(() => expect(field("Email")).toHaveAccessibleDescription("Must not be blank"));
    expect(bodies).toEqual([]);
  });

  it("puts a refine's message under the field its path names", async () => {
    const refined = customerSchema.refine((v) => v.name !== v.company, { path: ["company"], message: "Must differ" });
    const user = show({ schema: refined });

    await fill(user, { name: "Ann", email: "ann@example.com", company: "Ann" });
    await user.tab();

    await waitFor(() => expect(field("Company")).toHaveAccessibleDescription("Must differ"));
  });

  it("puts the server's field errors under their fields, and toasts one for a field it does not show", async () => {
    answerCreate(() =>
      invalidFields({ email: "Another customer has this email address", version: "Is not the latest version" }),
    );
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(field("Email")).toHaveAccessibleDescription("Another customer has this email address"));
    expect(field("Email")).toHaveAttribute("aria-invalid", "true");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Is not the latest version");
    expect(alert).not.toHaveTextContent("Another customer");
  });

  it("toasts nothing when every server field error has its field", async () => {
    answerCreate(() => invalidFields({ email: "Another customer has this email address" }));
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(field("Email")).toHaveAccessibleDescription("Another customer has this email address"));
    await waitFor(() => expect(save()).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts several messages it cannot place together, separated by a space", async () => {
    answerCreate(() => invalidFields({ first: "Pick a day", second: "Pick a time" }));
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a day Pick a time");
  });

  it("toasts another refusal's detail under the failure title", async () => {
    answerCreate(
      () =>
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Someone else changed this customer",
          }),
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
    );
    const user = show({ failure: "Could not save the customer" });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save the customer");
    expect(alert).toHaveTextContent("Someone else changed this customer");
  });

  it("toasts a 400 without field errors by its detail", async () => {
    answerCreate(() => badRequest("Already active"));
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Already active");
  });

  it("toasts a 400 whose field errors are empty (a class-level constraint) by its detail", async () => {
    answerCreate(
      () =>
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail: "The request has invalid fields",
            errors: [],
          }),
          { status: 400, headers: { "Content-Type": "application/problem+json" } },
        ),
    );
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("The request has invalid fields");
  });

  it("toasts a refusal that is not a 400 as a refusal, even when it names fields", async () => {
    answerCreate(
      () =>
        new Response(
          JSON.stringify({
            type: "about:blank",
            title: "Conflict",
            status: 409,
            detail: "Taken",
            errors: [{ field: "email", message: "Another customer has this email address" }],
          }),
          { status: 409, headers: { "Content-Type": "application/problem+json" } },
        ),
    );
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Taken");
    expect(field("Email")).not.toHaveAttribute("aria-invalid");
  });

  it("toasts the failure title alone when the answer is not a problem", async () => {
    answerCreate(() => new Response("", { status: 502 }));
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  });

  it("toasts the failure title when the request never reaches the server", async () => {
    answerCreate(() => Response.error());
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  });

  it("toasts nothing when the session is lost, and keeps what was typed", async () => {
    const { bodies } = answerCreate(() => new Response(null, { status: 401 }));
    const onSuccess = vi.fn();
    const user = show({ onSuccess });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(save()).toBeEnabled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(field("Name")).toHaveValue("Ann");
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("sends once when Enter is pressed twice while the first is out, and stays busy until it is answered", async () => {
    const answer = held(() => Response.json({ id: "7", name: "Ann" }));
    const { bodies } = answerCreate(answer.answer);
    const onSuccess = vi.fn();
    const user = show({ onSuccess });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    // Without a pause between the presses, as a quick double press: the second comes before the
    // first has marked the form as submitting.
    await userEvent.setup({ delay: null }).type(field("Name"), "{Enter}{Enter}");
    await waitFor(() => expect(bodies).toHaveLength(1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(save()).toBeDisabled();

    answer.release();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(save()).toBeEnabled());
    expect(bodies).toHaveLength(1);
  });

  it("after a save, is clean, and Reset goes back to the saved values", async () => {
    answerCreate();
    const onSuccess = vi.fn();
    const user = show({ onSuccess });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await waitFor(() => expect(save()).toBeEnabled());

    expect(current?.state.isDirty).toBe(false);
    expect(field("Name")).toHaveValue("Ann");
    await user.clear(field("Name"));
    await user.type(field("Name"), "Bob");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(field("Name")).toHaveValue("Ann");
    expect(field("Email")).toHaveValue("ann@example.com");
  });

  it("stays submitting until the queries the mutation refreshes have refetched", async () => {
    answerCreate();
    let lists = 0;
    const refetch = held(() => HttpResponse.json({ n: lists }));
    server.use(http.get("/api/customers", () => (++lists === 1 ? HttpResponse.json({ n: 1 }) : refetch.answer())));
    function List() {
      const query = useQuery({
        queryKey: ["customers"],
        queryFn: async () => (await fetch("/api/customers")).json() as Promise<{ n: number }>,
      });
      return <p>Lists: {query.data?.n}</p>;
    }
    const onSuccess = vi.fn();
    renderWithProviders(
      <>
        <List />
        <Harness options={{ onSuccess }} />
      </>,
      createQueryClient(),
    );
    const user = userEvent.setup();
    expect(await screen.findByText("Lists: 1")).toBeInTheDocument();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());
    await waitFor(() => expect(lists).toBe(2));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(save()).toBeDisabled();
    expect(onSuccess).not.toHaveBeenCalled();

    refetch.release();
    expect(await screen.findByText("Lists: 2")).toBeInTheDocument();
    await waitFor(() => expect(save()).toBeEnabled());
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("calls onSaved listeners after onSuccess on each save, until unsubscribed", async () => {
    answerCreate();
    const calls: string[] = [];
    const user = show({ onSuccess: () => void calls.push("onSuccess") });
    const unsubscribe = current?.onSaved(() => calls.push("saved"));

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());
    await waitFor(() => expect(calls).toEqual(["onSuccess", "saved"]));
    await waitFor(() => expect(save()).toBeEnabled());

    unsubscribe?.();
    await user.click(save());
    await waitFor(() => expect(calls).toEqual(["onSuccess", "saved", "onSuccess"]));
  });

  it("does not call onSaved listeners when the save is refused", async () => {
    answerCreate(() => badRequest("Already active"));
    const saved = vi.fn();
    const user = show();
    current?.onSaved(saved);

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(saved).not.toHaveBeenCalled();
  });

  it("saves without an onSuccess", async () => {
    const { bodies } = answerCreate();
    const user = show();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(bodies).toHaveLength(1));
    await waitFor(() => expect(current?.state.isDirty).toBe(false));
  });

  it("keeps the same form, with restart and onSaved, from render to render", async () => {
    const user = show();
    const first = current;
    await user.type(field("Name"), "A");
    expect(current).toBe(first);
    expect(current?.restart).toBe(first?.restart);
    expect(current?.onSaved).toBe(first?.onSaved);
  });

  it("restarts at the latest defaultValues, not at the saved values", async () => {
    answerCreate();
    const onSuccess = vi.fn();
    const user = show({ onSuccess });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    await waitFor(() => expect(save()).toBeEnabled());

    act(() => current?.restart());
    expect(field("Name")).toHaveValue("");
    await user.type(field("Email"), "x");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(field("Email")).toHaveValue("");
  });

  it("follows new defaultValues while untouched, and restarts at them", async () => {
    function Switching() {
      const [defaults, setDefaults] = useState(EMPTY);
      return (
        <>
          <Button onClick={() => setDefaults({ name: "Ada", email: "ada@example.com", company: "" })}>Load</Button>
          <Harness options={{ defaultValues: defaults }} />
        </>
      );
    }
    renderWithProviders(<Switching />, createQueryClient());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(field("Name")).toHaveValue("Ada"));

    await user.clear(field("Name"));
    act(() => current?.restart());
    expect(field("Name")).toHaveValue("Ada");
  });

  it("keeps the saved values after a save, though the defaults changed since it first rendered", async () => {
    answerCreate();
    function Switching() {
      const [defaults, setDefaults] = useState(EMPTY);
      return (
        <>
          <Button onClick={() => setDefaults({ name: "Ada", email: "ada@example.com", company: "" })}>Load</Button>
          <Harness options={{ defaultValues: defaults }} />
        </>
      );
    }
    renderWithProviders(<Switching />, createQueryClient());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(field("Name")).toHaveValue("Ada"));

    await user.clear(field("Name"));
    await user.type(field("Name"), "Bo");
    await user.click(save());
    await waitFor(() => expect(current?.state.isSubmitSuccessful).toBe(true));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));

    expect(field("Name")).toHaveValue("Bo");
    expect(current?.state.isDirty).toBe(false);
  });

  /** A form whose caller moves to `version` 2 (and, with `record`, to that record) on "Bump". */
  function Versioned({ record }: { record?: typeof EMPTY }) {
    const [version, setVersion] = useState(1);
    const defaults = version === 2 && record !== undefined ? record : EMPTY;
    return (
      <>
        <Button onClick={() => setVersion(2)}>Bump</Button>
        <Harness options={{ defaultValues: defaults, mutation: createCustomer(version) }} />
        <Toaster />
      </>
    );
  }

  it("sends a touched draft at the version it started from, and starts over at the caller's record after the 409", async () => {
    const { bodies, versions } = answerCreate(() =>
      versions.length === 1 ? stale() : Response.json({ id: "7", name: "Tess" }),
    );
    const theirs = { name: "Tess", email: "tess@example.com", company: "" };
    renderWithProviders(<Versioned record={theirs} />, createQueryClient());
    const user = userEvent.setup();

    await fill(user, { name: "Ann", email: "ann@example.com" });
    // Someone else saved: a refetch brings their record, at a new version, while the draft is edited.
    await user.click(screen.getByRole("button", { name: "Bump" }));
    expect(field("Name")).toHaveValue("Ann");
    await user.click(save());

    expect(await screen.findByRole("alert")).toHaveTextContent("This record changed since you loaded it");
    expect(versions).toEqual(["1"]);
    await waitFor(() => expect(field("Name")).toHaveValue("Tess"));
    await waitFor(() => expect(save()).toBeEnabled());
    await user.click(save());
    await waitFor(() => expect(versions).toEqual(["1", "2"]));
    expect(bodies[1]).toEqual({ name: "Tess", email: "tess@example.com", company: null });
  });

  it("sends an untouched form's save with the latest mutation given", async () => {
    const { versions } = answerCreate();
    renderWithProviders(<Versioned />, createQueryClient());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Bump" }));
    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(versions).toEqual(["2"]));
  });

  it("puts a server error for a nested field it shows under that field", async () => {
    server.use(http.post("/api/addresses", () => invalidFields({ "address.street": "Must not be blank" })));
    const addressSchema = z.object({ address: z.object({ street: text().optional() }) });
    const saveAddress = mutationOptions({
      mutationFn: (request: z.output<typeof addressSchema>) => sendJson<void>("POST", "addresses", request),
    });
    function Address() {
      const form = useSchemaForm({
        schema: addressSchema,
        defaultValues: { address: { street: "" } },
        mutation: saveAddress,
      });
      return (
        <form.AppForm>
          <form.Form>
            <form.AppField name="address.street">{(f) => <f.InputField label="Street" />}</form.AppField>
            <form.SubmitButton>Save</form.SubmitButton>
          </form.Form>
        </form.AppForm>
      );
    }
    renderWithProviders(
      <>
        <Address />
        <Toaster />
      </>,
      createQueryClient(),
    );

    await userEvent.setup().click(save());

    await waitFor(() => expect(field("Street")).toHaveAccessibleDescription("Must not be blank"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses to submit a mutation that names refreshes without roux's query client", async () => {
    const { bodies } = answerCreate();
    const { result } = renderHookWithProviders(
      () =>
        useSchemaForm({
          schema: customerSchema,
          defaultValues: { name: "Ann", email: "ann@example.com", company: "" },
          mutation: createCustomer(),
        }),
      new QueryClient({ defaultOptions: { queries: { retry: false } } }), // not roux's
    );

    await expect(act(() => result.current.handleSubmit())).rejects.toThrow("meta.refreshes needs roux's query client");
    expect(bodies).toEqual([]);
  });
});

describe("useSchemaForm in a FormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
  });

  it("saves from the dialog, which the caller closes once it has saved", async () => {
    const { bodies } = answerCreate();
    function Dialog() {
      const [open, setOpen] = useState(false);
      const form = useSchemaForm({
        schema: customerSchema,
        defaultValues: EMPTY,
        mutation: createCustomer(),
        onSuccess: () => setOpen(false),
      });
      return (
        <FormDialog
          form={form}
          title="New customer"
          trigger={<Button>New</Button>}
          submitLabel="Save"
          open={open}
          onOpenChange={setOpen}
        >
          <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
          <form.AppField name="email">{(f) => <f.InputField label="Email" />}</form.AppField>
        </FormDialog>
      );
    }
    renderWithProviders(<Dialog />, createQueryClient());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "New" }));
    const dialog = await screen.findByRole("dialog", { name: "New customer" });

    await fill(user, { name: "Ann", email: "ann@example.com" });
    await user.click(save());

    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(bodies).toEqual([{ name: "Ann", email: "ann@example.com", company: null }]);
  });
});
