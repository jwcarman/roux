import { Button, CloseButton, Dialog, Portal, Stack } from "@chakra-ui/react";
import { useEffect, useEffectEvent, useState, type ComponentType, type ReactElement, type ReactNode } from "react";

/**
 * What FormDialog needs of a form: a `useAppForm` form, or (better) a `useSchemaForm` one, whose
 * `restart` and `onSaved` let the dialog start afresh and close itself after a save.
 */
export interface DialogForm {
  AppForm: ComponentType<{ children?: ReactNode }>;
  Form: ComponentType<{ children: ReactNode }>;
  SubmitButton: ComponentType<{ children?: ReactNode }>;
  /** Puts the form back to its defaults; called once the dialog has closed, if it has no `restart`. */
  reset: () => void;
  /** Puts the form back to the caller's latest defaults; called once the dialog has closed. */
  restart?: () => void;
  /** Calls `listener` after each successful save, which closes the dialog; returns the unsubscribe. */
  onSaved?: (listener: () => void) => () => void;
}

export interface FormDialogProps {
  /** The form, usually `useSchemaForm`'s: the dialog closes after it saves. */
  form: DialogForm;
  title: string;
  /** The button that opens the dialog; focus returns to it when the dialog closes. */
  trigger: ReactElement;
  /** The submit button's label. Defaults to `Save`. */
  submitLabel?: string;
  /** Whether it is open, for a page that opens it from code; without it, the dialog keeps its own. */
  open?: boolean;
  /** Told each time it opens or closes; after a save it is told `false`, so a controlling page closes it. */
  onOpenChange?: (open: boolean) => void;
  /** The form's fields. */
  children: ReactNode;
}

/**
 * A form in a dialog: create or edit something without leaving the page.
 *
 *   const form = useSchemaForm({ schema, defaultValues, mutation });
 *   <FormDialog form={form} title="New customer" trigger={<Button>New customer</Button>}>
 *     <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
 *   </FormDialog>
 *
 * Its trigger opens it; a save (the form's `onSaved`, after `onSuccess`) closes it, and so do
 * Escape, Cancel and the close button. Refusals keep it open; a conflict (409) starts the form over
 * from the refreshed record, when the refresh brings a changed one. Once closed the form goes back to its
 * defaults (`restart`, or `reset`): a create opens empty, an edit opens at the latest record. Pass
 * `open` and `onOpenChange` to open it from code instead.
 */
export function FormDialog({
  form,
  title,
  trigger,
  submitLabel = "Save",
  open: controlledOpen,
  onOpenChange,
  children,
}: FormDialogProps) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;

  function changeOpen(next: boolean): void {
    setOwnOpen(next);
    onOpenChange?.(next);
  }

  const closeAfterSave = useEffectEvent(() => changeOpen(false));
  useEffect(() => form.onSaved?.(closeAfterSave), [form]);

  // Start afresh once it has closed, however it closed (a save, Cancel, Escape): doing it as it
  // opens could wipe what someone types the moment it appears.
  useEffect(() => {
    if (!open) {
      (form.restart ?? form.reset)();
    }
  }, [open, form]);

  return (
    <Dialog.Root open={open} onOpenChange={(event) => changeOpen(event.open)}>
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
