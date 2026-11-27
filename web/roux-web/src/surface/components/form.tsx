// The bridge between A2UI's data model and roux's TanStack Form fields. The A2UI data model owns the values; the
// TanStack form gives roux's fields their context, touched/blurred state and messages, and submits the Form as
// roux's forms submit: every field checked first, then the Form's solid Button's action (layout.tsx), only if all pass.
import { type AnyFieldApi } from "@tanstack/react-form";
import { Flex, Text, VStack } from "@chakra-ui/react";
import { FilterChips as RouxFilterChips } from "../../table";
import { InputField as RouxInputField, SelectField as RouxSelectField, useAppForm } from "../../form";
import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { rouxCatalog } from "../../a2ui";
import {
  buildChildren,
  defineComponent,
  FormSubmitContext,
  formatValue,
  newFormSubmit,
  useComponentId,
  type FormSubmit,
} from "./layout";

const {
  Form: FormApi,
  InputField: InputFieldApi,
  SelectField: SelectFieldApi,
  FilterChips: FilterChipsApi,
} = rouxCatalog.apis;

function useBridgeForm(formSubmit: FormSubmit) {
  return useAppForm({ onSubmit: () => formSubmit.submit() });
}
type BridgeForm = ReturnType<typeof useBridgeForm>;

const FormBridge = createContext<BridgeForm | null>(null);

// roux's own form.Form: Enter in a field or the solid Button submits it, through validateAllFields and handleSubmit.
function FormHost({ id, children }: { id: string; children: ReactNode }) {
  const [formSubmit] = useState(newFormSubmit);
  const form = useBridgeForm(formSubmit);
  return (
    <FormBridge.Provider value={form}>
      <FormSubmitContext.Provider value={formSubmit}>
        <form.AppForm>
          <form.Form>
            <VStack data-component-id={id} align="stretch" gap="1">
              {children}
            </VStack>
          </form.Form>
        </form.AppForm>
      </FormSubmitContext.Provider>
    </FormBridge.Provider>
  );
}

const Form = defineComponent(FormApi, ({ props, buildChild }) => (
  <FormHost id={useComponentId()}>{buildChildren(props.children, buildChild)}</FormHost>
));

type Sync = {
  value: string;
  setValue: (value: string) => void;
  checkErrors?: string[];
  serverError?: string;
};

/** The field's new value to the data model, unless the data model already holds it (it was written from there). */
export function writeBack(value: unknown, sync: Pick<Sync, "value" | "setValue">): void {
  const text = formatValue(value);
  if (text !== sync.value) sync.setValue(text);
}

/** What the bridge does to a TanStack field. */
export function opsOf(field: AnyFieldApi): FieldOps {
  return {
    value: (): unknown => field.state.value,
    // A value from the data model is not the person's edit: the field stays untouched and clean.
    fill: (value) => field.setValue(value, { dontUpdateMeta: true }),
    // The default is the data model's value by then, and the field starts fresh: not touched, not "left empty".
    restart: () => field.form.resetField(field.name),
    recheck: () => void field.validate("blur"),
    showServerError: (message) =>
      field.setMeta((meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: message } })),
  };
}

/** One field of the bridge form, named by its component id, kept in step with the data model. */
function BridgeField({ kind, sync, children }: { kind: string; sync: Sync; children: ReactNode }) {
  const form = useContext(FormBridge);
  const id = useComponentId();
  // The first failing A2UI check, which the field's own validator reports, so TanStack keeps its errors.
  const check = useRef<string | undefined>(undefined);
  if (!form) {
    return (
      <Text data-component-id={id} color="red.500">
        {kind} must be inside a Form
      </Text>
    );
  }
  return (
    <form.AppField
      name={id}
      defaultValue={sync.value}
      validators={{ onBlur: () => check.current }}
      listeners={{ onChange: ({ value }) => writeBack(value, sync) }}
    >
      {(field) => (
        <FieldSync sync={sync} check={check} field={opsOf(field)}>
          <div data-component-id={id}>{children}</div>
        </FieldSync>
      )}
    </form.AppField>
  );
}

/** What FieldSync does to the TanStack field. */
type FieldOps = {
  value: () => unknown;
  fill: (value: string) => void;
  restart: () => void;
  recheck: () => void;
  showServerError: (message: string | undefined) => void;
};

function FieldSync({
  field,
  sync,
  check,
  children,
}: {
  field: FieldOps;
  sync: Sync;
  check: RefObject<string | undefined>;
  children: ReactNode;
}) {
  const { value, serverError } = sync;
  // Only the first failing check shows, as roux shows one message per field.
  const checkMessage = sync.checkErrors?.[0];
  // Effect events read the field as of the render that ran the effect, so the effects key on values only: the
  // field object changes on every render, so depending on it loops.
  const fillWith = useEffectEvent((next: string) => {
    // Typing wrote the data model, which already holds what the field does.
    if (field.value() === next) return;
    // Emptied from outside (a reset after a save): the field starts fresh, not "left empty".
    if (next === "") field.restart();
    else field.fill(next);
  });
  const checkWith = useEffectEvent((message: string | undefined) => {
    check.current = message;
    field.recheck();
  });
  const showServerError = useEffectEvent((message: string | undefined) => field.showServerError(message));

  // Data model → field: the data model is the truth.
  useEffect(() => fillWith(value), [value]);

  // The A2UI checks → the field's message, shown after blur the way roux does it.
  useEffect(() => checkWith(checkMessage), [checkMessage]);

  // The server's message for the field shows at once (TanStack clears it when the field changes).
  useEffect(() => showServerError(serverError), [serverError]);

  return <>{children}</>;
}

/** A bound text as the component reads it: the binder resolves it to a string, or leaves it out. */
const textOf = (value: unknown): string => (typeof value === "string" ? value : "");

const InputField = defineComponent(InputFieldApi, ({ props }) => (
  <BridgeField
    kind="An input field"
    sync={{
      value: textOf(props.value),
      setValue: props.setValue,
      checkErrors: props.validationErrors,
      serverError: textOf(props.serverError) || undefined,
    }}
  >
    <RouxInputField
      label={textOf(props.label)}
      type={props.type ?? "text"}
      required={props.required}
      helperText={textOf(props.helperText) || undefined}
    />
  </BridgeField>
));

type Choices = readonly string[] | readonly { value: string; label: string }[];

/** The options as the drop-down takes them: plain strings or {value, label}; none until the list is there. */
const optionsOf = (options: unknown): Choices => (Array.isArray(options) ? (options as Choices) : []);

const SelectField = defineComponent(SelectFieldApi, ({ props }) => (
  <BridgeField
    kind="A drop-down"
    sync={{
      value: textOf(props.value),
      setValue: props.setValue,
      checkErrors: props.validationErrors,
      serverError: textOf(props.serverError) || undefined,
    }}
  >
    <RouxSelectField
      label={textOf(props.label)}
      options={optionsOf(props.options)}
      placeholder={props.placeholder}
      required={props.required}
      helperText={textOf(props.helperText) || undefined}
    />
  </BridgeField>
));

/**
 * One filter: the chosen chip's value is written to the data model; no Form is involved. Its label shows above the
 * chips as a field's does, and the chips centre in the height of an input, so a Row lines it up with the fields beside it.
 */
const FilterChips = defineComponent(FilterChipsApi, ({ props }) => (
  <Flex data-component-id={useComponentId()} direction="column" gap="1.5">
    <Text as="span" aria-hidden fontWeight="medium" fontSize="sm">
      {textOf(props.label)}
    </Text>
    <Flex minH="10" align="center">
      <RouxFilterChips
        label={textOf(props.label)}
        options={optionsOf(props.options) as readonly { value: string; label: string }[]}
        value={props.value as string | undefined}
        onChange={props.setValue}
      />
    </Flex>
  </Flex>
));

export const formComponents = [Form, InputField, SelectField, FilterChips];
