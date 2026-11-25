import { Flex, Heading } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface PageHeaderProps {
  /** The page's title, its `h2` (the app's name is the shell's). */
  title: string;
  /** The page's actions, such as "Invite user", at the title's far side. */
  children?: ReactNode;
}

/**
 * A page's title, with its actions beside it. It stands as tall as a button whether or not it has
 * one, so the title sits in the same place on every page.
 */
export function PageHeader({ title, children }: Readonly<PageHeaderProps>) {
  return (
    <Flex justify="space-between" align="center" gap="3" wrap="wrap" minH="10">
      <Heading as="h2">{title}</Heading>
      {children}
    </Flex>
  );
}
