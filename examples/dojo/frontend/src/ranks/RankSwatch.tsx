import { Box } from "@chakra-ui/react";
import { BELT_SWATCHES, type BeltColour } from "./ranks";

/** A small square in a belt's own colour. Belts are data, not the app's theme. */
export function RankSwatch({ colour }: { colour: BeltColour }) {
  return (
    <Box
      aria-hidden
      width="4"
      height="4"
      flexShrink="0"
      borderRadius="l1"
      borderWidth="1px"
      borderColor="border.emphasized"
      style={{ background: BELT_SWATCHES[colour] }}
    />
  );
}
