import { Alert } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface ErrorMessageProps {
  title?: string;
  children: ReactNode;
}

/** An error alert (`role="alert"`), announced when it appears. */
export function ErrorMessage({ title, children }: Readonly<ErrorMessageProps>) {
  return (
    <Alert.Root status="error" role="alert">
      <Alert.Indicator />
      <Alert.Content>
        {title && <Alert.Title>{title}</Alert.Title>}
        <Alert.Description>{children}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
