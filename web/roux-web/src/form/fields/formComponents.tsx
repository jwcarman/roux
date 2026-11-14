import { Button, HStack, Spinner, Text, type ButtonProps } from "@chakra-ui/react";
import { useStore } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { useFormContext } from "../formContext";

/**
 * The `<form>`, submitting through the form once: a submit button inside it (or Enter in a field)
 * submits, and nothing else calls `handleSubmit`. The browser's own validation is off; the form's
 * validators speak for it, in the app's words.
 */
export function Form({ children }: { children: ReactNode }) {
  const form = useFormContext();
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        // TanStack submits nothing, and checks no more fields, once any field shows an error: check
        // them all first, so one press shows every problem, then submit (which stops if any remain).
        void form.validateAllFields("submit").then(() => form.handleSubmit());
      }}
    >
      {children}
    </form>
  );
}

/** Submits the form; busy and disabled while it submits, so a second click sends nothing. */
export function SubmitButton({ children, ...props }: Omit<ButtonProps, "type" | "onClick">) {
  const form = useFormContext();
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  return (
    // loadingText keeps the button's name (Chakra shows only a spinner otherwise).
    <Button
      type="submit"
      loading={submitting}
      loadingText={children}
      disabled={submitting}
      alignSelf="start"
      {...props}
    >
      {children}
    </Button>
  );
}

/** Puts every field back to its default value. */
export function ResetButton({ children = "Reset", ...props }: Omit<ButtonProps, "type" | "onClick">) {
  const form = useFormContext();
  return (
    <Button type="button" variant="outline" onClick={() => form.reset()} {...props}>
      {children}
    </Button>
  );
}

/** "Saving…" (or `children`), announced, while the form submits. */
export function SubmittingIndicator({ children = "Saving…" }: { children?: ReactNode }) {
  const form = useFormContext();
  const submitting = useStore(form.store, (state) => state.isSubmitting);
  if (!submitting) {
    return null;
  }
  return (
    <HStack role="status" gap="2" color="fg.muted">
      <Spinner size="sm" />
      <Text fontSize="sm">{children}</Text>
    </HStack>
  );
}
