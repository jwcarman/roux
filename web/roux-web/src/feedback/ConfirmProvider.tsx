import { Button, CloseButton, Dialog, Portal } from "@chakra-ui/react";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

const DANGER_PALETTE = "red";

export interface ConfirmOptions {
  title: string;
  message: string;
  /** The confirming button's label: the action, such as "Deactivate". */
  confirmLabel: string;
  /** Colors the confirming button as a destructive action. */
  destructive?: boolean;
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * Asks before an action with consequences: `if (await confirm({...})) deactivate()`. Resolves true
 * when confirmed, false on Cancel, Escape or closing. Cancel has focus first, so Enter alone never
 * confirms.
 */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (confirm === null) {
    throw new Error("useConfirm outside ConfirmProvider");
  }
  return confirm;
}

interface Pending {
  options: ConfirmOptions;
  resolve: (confirmed: boolean) => void;
}

/** The app's one confirmation dialog, for `useConfirm`. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);

  // Made once, so `useConfirm` hands every render the same function.
  const [confirm] = useState<Confirm>(
    () => (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
  );

  function answer(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      <Dialog.Root
        role="alertdialog"
        open={pending !== null}
        // Only ever asked to close: it opens when a question is pending, which `open` already says.
        onOpenChange={() => answer(false)}
        initialFocusEl={() => cancel.current}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content>
              <Dialog.Header>
                <Dialog.Title>{pending?.options.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>{pending?.options.message}</Dialog.Body>
              <Dialog.Footer>
                <Button ref={cancel} variant="outline" onClick={() => answer(false)}>
                  Cancel
                </Button>
                <Button
                  colorPalette={pending?.options.destructive ? DANGER_PALETTE : undefined}
                  onClick={() => answer(true)}
                >
                  {pending?.options.confirmLabel}
                </Button>
              </Dialog.Footer>
              <Dialog.CloseTrigger asChild>
                <CloseButton size="sm" aria-label="Close" />
              </Dialog.CloseTrigger>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </ConfirmContext>
  );
}
