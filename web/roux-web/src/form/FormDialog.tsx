import { Button, CloseButton, Dialog, Portal, Stack } from "@chakra-ui/react";
import { useEffect, type ComponentType, type ReactElement, type ReactNode } from "react";

/** What FormDialog needs of a `useAppForm` form. */
interface DialogForm {
  AppForm: ComponentType<{ children?: ReactNode }>;
  Form: ComponentType<{ children: ReactNode }>;
  SubmitButton: ComponentType<{ children?: ReactNode }>;
  reset: () => void;
}

export interface FormDialogProps {
  /** The caller's `useAppForm` form; its `onSubmit` saves, and closes the dialog on success. */
  form: DialogForm;
  title: string;
  /** The button that opens the dialog; focus returns to it when the dialog closes. */
  trigger: ReactElement;
  submitLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The form's fields. */
  children: ReactNode;
}

/**
 * A form in a dialog: create or edit something without leaving the page. The submit button sits in
 * the footer beside Cancel; Escape, Cancel and the close button close it; it opens empty each time.
 * Errors stay in the open dialog; the caller closes it when the save succeeds, as the last step of
 * `onSubmit`: the form is still submitting (its button disabled) until `onSubmit` returns.
 */
export function FormDialog({ form, title, trigger, submitLabel, open, onOpenChange, children }: FormDialogProps) {
  // Empty it once it has closed, however it closed (a save, Cancel, Escape): resetting as it opens
  // could wipe what someone types the moment it appears.
  useEffect(() => {
    if (!open) {
      form.reset();
    }
  }, [open, form]);

  return (
    <Dialog.Root open={open} onOpenChange={(event) => onOpenChange(event.open)}>
      <Dialog.Trigger asChild>{trigger}</Dialog.Trigger>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <form.AppForm>
              <form.Form>
                <Dialog.Header>
                  <Dialog.Title>{title}</Dialog.Title>
                </Dialog.Header>
                <Dialog.Body>
                  <Stack gap="4">{children}</Stack>
                </Dialog.Body>
                <Dialog.Footer>
                  <Dialog.ActionTrigger asChild>
                    <Button variant="outline">Cancel</Button>
                  </Dialog.ActionTrigger>
                  <form.SubmitButton>{submitLabel}</form.SubmitButton>
                </Dialog.Footer>
              </form.Form>
            </form.AppForm>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" aria-label="Close" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
