// Layout and content components, plus what every catalog component shares: its id on its outer element.
import {
  createComponentImplementation,
  useSignalValue,
  type NodeViewProps,
  type ReactComponentImplementation,
} from "@a2ui/react";
import type { ComponentApi } from "@a2ui/web_core";
import { Box, Button, Card, Heading, HStack, Stat, Text, VStack } from "@chakra-ui/react";
import { createContext, useContext, useLayoutEffect, useState, type ComponentType, type ReactNode } from "react";
import { formatDate, formatTime } from "../../dates";
import { formatMoney, type Money } from "../../money";
import { rouxCatalog } from "../../a2ui";
import { MESSAGE_SPACE } from "../../form/fields/FormField";

const {
  Button: ButtonApi,
  Card: CardApi,
  Column: ColumnApi,
  Heading: HeadingApi,
  Row: RowApi,
  Stat: StatApi,
  Text: TextApi,
} = rouxCatalog.apis;

// ---- Shared by every component ----

const ComponentId = createContext<string | undefined>(undefined);

/** The rendering component's id from the payload; it goes on the outer element as data-component-id. */
export function useComponentId(): string {
  const id = useContext(ComponentId);
  if (id === undefined)
    throw new Error("useComponentId is for a catalog component's render: build it with defineComponent.");
  return id;
}

type Render<Api extends ComponentApi> = Parameters<typeof createComponentImplementation<Api>>[1];

/** A Row slot's setter for its child's weight; only the slot's own child sees it. */
const SlotWeight = createContext<((weight: number | undefined) => void) | undefined>(undefined);

/** A Row slot's setter for whether its child is a Button; only the slot's own child sees it. */
const SlotButton = createContext<((isButton: boolean) => void) | undefined>(undefined);

/** Tells (before the first paint, so the slot never jumps) the slot holding this component its weight (a prop every catalog component may carry) and whether it is a Button. */
function ReportToSlot({ node }: { node: NodeViewProps["node"] }) {
  const { weight } = useSignalValue(node.props) as { weight?: number };
  const setWeight = useContext(SlotWeight);
  const setButton = useContext(SlotButton);
  useLayoutEffect(() => setWeight?.(weight), [setWeight, weight]);
  // Setting the state it already has costs nothing, so this runs after every render rather than tracking when it changes.
  useLayoutEffect(() => setButton?.(node.type === "Button"));
  return null;
}

/** A catalog component whose render can read its own component id (useComponentId). */
export function defineComponent<Api extends ComponentApi>(api: Api, render: Render<Api>): ReactComponentImplementation {
  const impl = createComponentImplementation(api, render);
  // createComponentImplementation always makes a view; its type only allows for catalogs without one.
  const View = impl.view as ComponentType<NodeViewProps>;
  const WithId = ({ node, buildChild }: NodeViewProps) => (
    <ComponentId.Provider value={node.componentId}>
      <ReportToSlot node={node} />
      <SlotWeight.Provider value={undefined}>
        <SlotButton.Provider value={undefined}>
          <View node={node} buildChild={buildChild} />
        </SlotButton.Provider>
      </SlotWeight.Provider>
    </ComponentId.Provider>
  );
  return { ...impl, view: WithId };
}

type ChildRef = string | { id: string; basePath: string };

/** Builds a ChildList's children, keyed by id (and scope, for template children); `Wrap` may put each in its own box. */
export function buildChildren(
  refs: unknown,
  buildChild: (id: string, basePath?: string) => ReactNode,
  Wrap: (props: { children: ReactNode }) => ReactNode = Slot,
): ReactNode[] {
  return (refs as ChildRef[]).map((ref) =>
    typeof ref === "string" ? (
      <Wrap key={ref}>{buildChild(ref)}</Wrap>
    ) : (
      <Wrap key={`${ref.id}@${ref.basePath}`}>{buildChild(ref.id, ref.basePath)}</Wrap>
    ),
  );
}
function Slot({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export type Format = "text" | "number" | "money" | "date" | "time" | "badge" | "list";

/** A value as the owner reads it: money and dates follow the organization's locale and currency. */
export function formatValue(value: unknown, format?: Format): string {
  if (value == null) return "";
  if (format === "money" && typeof value === "object") return formatMoney(value as Money);
  if (format === "date" && typeof value === "string") return formatDate(value);
  if (format === "time" && typeof value === "string") return formatTime(value);
  if (format === "list" && Array.isArray(value)) return value.map((item) => formatValue(item)).join(", ");
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

export const TONES = { neutral: "gray", info: "blue", success: "green", warning: "orange", danger: "red" } as const;
export type Tone = keyof typeof TONES;

// ---- Layout and content ----

/** A2UI's justify and align words, as CSS. */
const FLEX = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  spaceBetween: "space-between",
  spaceAround: "space-around",
  spaceEvenly: "space-evenly",
} as const;

const Column = defineComponent(ColumnApi, ({ props, buildChild }) => (
  <VStack
    data-component-id={useComponentId()}
    align={FLEX[props.align ?? "stretch"]}
    justify={props.justify && FLEX[props.justify]}
    gap={props.gap ?? 4}
  >
    {buildChildren(props.children, buildChild)}
  </VStack>
));

/**
 * Row children share the width, but never squeeze below a readable minimum: below it (and on phones) they wrap to a
 * column. A child holding a table takes the larger share, and no child can be pushed wider than its slot.
 */
export const ROW_SLOT = {
  minW: { base: "100%", md: "16rem" },
  css: { "&:has(table)": { flexGrow: 2 } },
} as const;

/** Whether the Row places its children (justify set), so they take their own width instead of sharing it. */
const RowJustified = createContext<boolean | undefined>(undefined);

function RowSlot({ children }: { children: ReactNode }) {
  const justified = useContext(RowJustified);
  const [weight, setWeight] = useState<number | undefined>(undefined);
  const [isButton, setButton] = useState<boolean>();
  // A justified Row's child takes its own width, unless it has a weight: then it shares the width like the rest.
  // A Button always takes its own width and lines up with the bottom of the fields beside it.
  const sharing = (!justified || weight !== undefined) && !isButton;
  return (
    <Box
      data-row-slot=""
      display="flex"
      flexDirection="column"
      {...ROW_SLOT}
      flex={sharing ? "1 1 0" : isButton ? "0 0 auto" : undefined}
      flexGrow={isButton ? undefined : weight}
      alignSelf={isButton ? "flex-end" : undefined}
      data-row-button={isButton ? "" : undefined}
    >
      <SlotWeight.Provider value={setWeight}>
        <SlotButton.Provider value={setButton}>{children}</SlotButton.Provider>
      </SlotWeight.Provider>
    </Box>
  );
}

const Row = defineComponent(RowApi, ({ props, buildChild }) => (
  <HStack
    data-component-id={useComponentId()}
    align={FLEX[props.align ?? "stretch"]}
    justify={props.justify && FLEX[props.justify]}
    gap={props.gap ?? 4}
    wrap="wrap"
    css={{ "&:has([data-field-message]) > [data-row-button]": { marginBottom: MESSAGE_SPACE } }}
  >
    <RowJustified.Provider value={props.justify !== undefined}>
      {buildChildren(props.children, buildChild, RowSlot)}
    </RowJustified.Provider>
  </HStack>
));

const HeadingC = defineComponent(HeadingApi, ({ props }) => (
  <Heading data-component-id={useComponentId()} size={props.size ?? "xl"}>
    {props.text}
  </Heading>
));

const TextC = defineComponent(TextApi, ({ props }) => (
  <Text data-component-id={useComponentId()} color={props.muted ? "fg.muted" : undefined}>
    {props.text}
  </Text>
));

const BORDERS: { [tone in Tone]?: string } = { warning: "orange.300", danger: "red.300" };

const CardC = defineComponent(CardApi, ({ props, buildChild }) => (
  <Card.Root data-component-id={useComponentId()} flex="1" minW="0" borderColor={props.tone && BORDERS[props.tone]}>
    {props.title && (
      <Card.Header>
        <Card.Title>{props.title}</Card.Title>
      </Card.Header>
    )}
    {/* A table alone in the Card runs edge to edge: its cells (and footer) carry the padding. The catalog wraps each component in an element of its own, hence the extra level. */}
    <Card.Body css={{ "&:has(> * > :only-child > [data-data-table])": { padding: 0 } }}>
      <VStack align="stretch" gap="4">
        {buildChildren(props.children, buildChild)}
      </VStack>
    </Card.Body>
  </Card.Root>
));

const STAT_COLORS = { accent: "colorPalette.fg", danger: "red.fg" } as const;

/** Whether a Stat's value is worth a tone: not zero (a number, or money in no minor units), and not missing. */
function isSignificant(value: unknown): boolean {
  if (typeof value === "number") return value !== 0;
  if (typeof value === "object" && value !== null) return (value as Money).minorUnits !== 0;
  return false;
}

const StatC = defineComponent(StatApi, ({ props }) => (
  <Stat.Root data-component-id={useComponentId()}>
    <Stat.Label>{props.label}</Stat.Label>
    <Stat.ValueText color={props.tone && isSignificant(props.value) ? STAT_COLORS[props.tone] : undefined}>
      {formatValue(props.value, props.format)}
    </Stat.ValueText>
  </Stat.Root>
));

const ButtonC = defineComponent(ButtonApi, ({ props }) => (
  <Button
    data-component-id={useComponentId()}
    alignSelf="flex-start"
    variant={props.variant ?? "solid"}
    disabled={props.disabled === true}
    onClick={() => void props.action()}
  >
    {props.label}
  </Button>
));

export const layoutComponents = [Column, Row, HeadingC, TextC, CardC, StatC, ButtonC];
