import { Toaster as ChakraToaster, createToaster, Portal, Stack, Toast } from "@chakra-ui/react";

/** The app's one toaster; show toasts through `notify`, not this directly. */
export const toaster = createToaster({ placement: "bottom-end", pauseOnPageIdle: true });

/**
 * Where toasts appear, mounted once beside the app. A failure is an alert, announced at once; any
 * other toast is a status, announced when the reader is idle.
 */
export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }} role={toast.type === "error" ? "alert" : "status"}>
            <Toast.Indicator />
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && <Toast.Description>{toast.description}</Toast.Description>}
            </Stack>
            {toast.action && <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>}
            <Toast.CloseTrigger />
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}
