import { Box, Field } from "@chakra-ui/react";
import { useStore } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { errorMessages } from "../errors";
import { useFieldContext } from "../formContext";

export interface FormFieldProps {
  label: ReactNode;
  /** A hint under the field, replaced by its errors when it has any. */
  helperText?: ReactNode;
  required?: boolean;
  /**
   * The control names itself with `label` (a radio group's own group label), so the frame shows no
   * `<label>` of its own.
   */
  controlLabelled?: boolean;
  children: ReactNode;
}

/**
 * A field's frame: its label, its control (the children, wired by Chakra's Field to the label and
 * the messages, so screen readers announce them), and its errors. Errors show once the field has
 * been left or the form submitted, never while a first entry is still being typed, and a server's
 * error for the field shows at once (TanStack Form clears it when the field changes).
 */
export function FormField({ label, helperText, required, controlLabelled = false, children }: FormFieldProps) {
  const field = useFieldContext<unknown>();
  const submitted = useStore(field.form.store, (state) => state.submissionAttempts > 0);
  const meta = field.state.meta;
  const messages = meta.isBlurred || submitted || meta.errorMap.onServer ? errorMessages(meta.errors) : [];

  return (
    <Field.Root invalid={messages.length > 0} required={required}>
      {!controlLabelled && (
        <Field.Label>
          {label}
          {required && <Field.RequiredIndicator />}
        </Field.Label>
      )}
      {children}
      {/* The message line is always there: an error appearing as a field is left (often by a press
          on the submit button) must not move the button out from under the pointer. */}
      {/* A column, so the line is exactly the message's height (a 12px error, 16px tall) and not the
          page's 24px line box around an inline one. */}
      <Box display="flex" flexDirection="column" minH="4">
        {messages.length > 0 ? (
          <Field.ErrorText>{messages.join(" ")}</Field.ErrorText>
        ) : (
          helperText && <Field.HelperText>{helperText}</Field.HelperText>
        )}
      </Box>
    </Field.Root>
  );
}
