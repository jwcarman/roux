import { Box, Flex } from "@chakra-ui/react";
import type { ReactNode } from "react";

export interface SignInFrameProps {
  /** What sits in the page's top corner, such as the light and dark mode switch. */
  tools?: ReactNode;
  /** The card's contents: `SignInCard`, or the app's own. */
  children: ReactNode;
}

/**
 * The signed-out page: a card no wider than 400px, centred on a tinted page from a small screen up.
 * On a phone the card is the page: no border, no shadow, the page's own background.
 */
export function SignInFrame({ tools, children }: SignInFrameProps) {
  return (
    <Box position="relative">
      <Flex position="absolute" top="3" right="4" zIndex="1">
        {tools}
      </Flex>
      <Flex
        as="main"
        minH="100dvh"
        justify="center"
        align={{ base: "flex-start", sm: "center" }}
        bg={{ base: "bg", sm: "bg.subtle" }}
        px="4"
        py={{ base: "16", sm: "8" }}
      >
        <Box
          w="100%"
          maxW="400px"
          bg="bg"
          borderWidth={{ base: "0", sm: "1px" }}
          rounded={{ base: "none", sm: "l3" }}
          shadow={{ base: "none", sm: "sm" }}
          p={{ base: "2", sm: "8" }}
        >
          {children}
        </Box>
      </Flex>
    </Box>
  );
}
