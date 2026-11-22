import {
  Box,
  Button,
  Center,
  Collapsible,
  Field,
  Flex,
  Heading,
  HStack,
  Input,
  Separator,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-form";
import { useEffect, useState, type ReactNode } from "react";
import { LuChevronDown } from "react-icons/lu";
import { useServerAction } from "../api/serverAction";
import { notify } from "../feedback/notify";
import { useSchemaForm } from "../form/schemaForm";
import { brandPalette } from "./brandPalette";
import { FONT_FAMILY, loadFont } from "./fonts";
import { LOOKS, type Look } from "./looks";
import { FONTS, PALETTES, RADII, SHAPES, type Font, type Shape, type ShellTheme } from "./theme";
import { useShellTheme } from "./ThemeProvider";
import { restoreTheme, saveTheme, themeQuery, themeSchema, type SavedTheme } from "./themeApi";

/** The shapes offered before More options is opened; the default (medium) is one of them. */
const SIMPLE_SHAPES: readonly Shape[] = ["square", "medium", "round"];

const SHAPE_LABEL: Record<Shape, string> = {
  square: "Square",
  slight: "Slightly rounded",
  medium: "Rounded",
  round: "Very rounded",
  "extra-round": "Extra rounded",
};

const FONT_LABEL: Record<Font, string> = {
  standard: "Plain",
  modern: "Modern",
  friendly: "Friendly",
  classic: "Classic",
};

/** How a chosen option looks: a pressed button is filled with the palette's color. */
const PRESSED = { bg: "colorPalette.solid", color: "colorPalette.contrast" };

/** The look in use is ringed in the palette's color: its border and one more pixel, so nothing moves. */
const LOOK_PRESSED = { borderColor: "colorPalette.solid", outline: "1px solid", outlineColor: "colorPalette.solid" };

/** A chosen color swatch is ringed in its own color. */
const SWATCH_PRESSED = { outline: "2px solid", outlineColor: "colorPalette.solid" };

const HEX = /^#[0-9a-fA-F]{6}$/;

function settingsOf(theme: SavedTheme): ShellTheme {
  const { appName, palette, brandColor, shape, headingFont, bodyFont } = theme;
  return { appName, palette, brandColor, shape, headingFont, bodyFont };
}

function capitalized(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * The form where the owner changes how the app looks: a ready-made look, then color, shape and
 * lettering, with the app's name. The owner's own screen previews the draft (through
 * `useShellTheme`) until it is saved, and a save can be undone; it saves through roux-theme's
 * `PUT /api/theme` at the version it read, so a change someone else made first is a conflict the
 * form starts over from. Place it on the app's own page (with the page's heading), behind the
 * route guard for `theme.manage`; the server enforces that permission too.
 */
export function AppearanceSettings() {
  const theme = useQuery(themeQuery);
  const { commit } = useShellTheme();
  // The look the server has now is the saved one, though another tab or owner saved it since this
  // page loaded: the preview and Cancel go back to it.
  useEffect(() => {
    if (theme.data !== undefined) {
      commit(settingsOf(theme.data));
    }
  }, [theme.data, commit]);
  if (theme.isPending) {
    return (
      <Center py="12">
        <Spinner aria-label="Loading" />
      </Center>
    );
  }
  if (theme.isError) {
    return <Text>The app's look could not be loaded. Try again in a moment.</Text>;
  }
  return <AppearanceEditor saved={theme.data} />;
}

function AppearanceEditor({ saved }: { saved: SavedTheme }) {
  const { preview } = useShellTheme();
  // Open from the start when the look in use needs it to be seen: the owner's own color.
  const [moreOpen, setMoreOpen] = useState(saved.palette === "brand");
  const undo = useServerAction(restoreTheme, { failure: "Could not put the look back" });

  // A save, an Undo or a conflict (409) refreshes the theme query, so `saved` is the latest version.
  // A draft is saved at the version it started from: if someone else saved meanwhile, the server
  // answers 409 and the form starts over from their look (or, when their change leaves the form's
  // values as they were, keeps the draft and saves it next at the new version).
  const form = useSchemaForm({
    schema: themeSchema,
    defaultValues: settingsOf(saved),
    mutation: saveTheme(saved.version),
    onSuccess: (next) => {
      const before = settingsOf(saved);
      notify.success("The new look is saved", {
        label: "Undo",
        onClick: () => void undo.run({ ...before, version: next.version }),
      });
    },
    failure: "Could not save the look",
  });

  const values = useStore(form.store, (state) => state.values);
  // The color code as typed; it follows the color whenever the form changes it (a look, Cancel, Undo).
  const [code, setCode] = useState(saved.brandColor);
  const [codeOf, setCodeOf] = useState(values.brandColor);
  if (codeOf !== values.brandColor) {
    setCodeOf(values.brandColor);
    if (code.toLowerCase() !== values.brandColor) {
      setCode(values.brandColor);
    }
  }
  // The owner sees the draft on their own screen, until it is saved or the page is left.
  useEffect(() => {
    preview(values);
    return () => preview(null);
  }, [values, preview]);
  // The look cards and lettering samples show every font (loading one twice costs nothing).
  FONTS.forEach((font) => void loadFont(font));

  const chooseLook = (look: Look) => {
    form.setFieldValue("palette", look.settings.palette);
    form.setFieldValue("shape", look.settings.shape);
    form.setFieldValue("headingFont", look.settings.headingFont);
    form.setFieldValue("bodyFont", look.settings.bodyFont);
  };
  const adjusted = values.palette === "brand" ? brandPalette(values.brandColor).adjusted : null;

  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="8" maxW="3xl">
          <Section title="Name" description="What people see in the header, the browser tab and emails.">
            <form.AppField name="appName">
              {(f) => <f.InputField label="What should the app be called?" />}
            </form.AppField>
          </Section>

          <Separator />

          <Section title="Look" description="Start from a ready-made look, then adjust the color and shape.">
            <SimpleGrid columns={{ base: 3, md: 5 }} gap="3">
              {LOOKS.map((look) => (
                <Button
                  key={look.name}
                  aria-label={look.name}
                  aria-pressed={
                    values.palette === look.settings.palette &&
                    values.shape === look.settings.shape &&
                    values.headingFont === look.settings.headingFont &&
                    values.bodyFont === look.settings.bodyFont
                  }
                  variant="outline"
                  _pressed={LOOK_PRESSED}
                  height="auto"
                  py="3"
                  flexDirection="column"
                  gap="2"
                  onClick={() => chooseLook(look)}
                >
                  <Box
                    colorPalette={look.settings.palette}
                    bg="colorPalette.solid"
                    color="colorPalette.contrast"
                    borderRadius={RADII[look.settings.shape][1]}
                    px="3"
                    py="1"
                    fontFamily={FONT_FAMILY[look.settings.headingFont]}
                  >
                    Aa
                  </Box>
                  <Text fontFamily={FONT_FAMILY[look.settings.bodyFont]}>{look.name}</Text>
                </Button>
              ))}
            </SimpleGrid>

            <Part title="Color">
              <HStack wrap="wrap" gap="2">
                {PALETTES.filter((palette) => palette !== "brand").map((palette) => (
                  <Button
                    key={palette}
                    aria-label={capitalized(palette)}
                    aria-pressed={values.palette === palette}
                    colorPalette={palette}
                    bg="colorPalette.solid"
                    borderRadius="full"
                    boxSize="9"
                    minW="9"
                    outlineOffset="2px"
                    _pressed={SWATCH_PRESSED}
                    onClick={() => form.setFieldValue("palette", palette)}
                  />
                ))}
              </HStack>
            </Part>

            <Part title="Shape">
              <HStack wrap="wrap" gap="2">
                {(moreOpen || !SIMPLE_SHAPES.includes(values.shape) ? SHAPES : SIMPLE_SHAPES).map((shape) => (
                  <Button
                    key={shape}
                    aria-pressed={values.shape === shape}
                    variant="outline"
                    _pressed={PRESSED}
                    borderRadius={RADII[shape][1]}
                    onClick={() => form.setFieldValue("shape", shape)}
                  >
                    {SHAPE_LABEL[shape]}
                  </Button>
                ))}
              </HStack>
            </Part>

            <Collapsible.Root
              open={moreOpen}
              onOpenChange={(details) => setMoreOpen(details.open)}
              lazyMount
              unmountOnExit
            >
              <Collapsible.Trigger asChild>
                <Button variant="subtle" size="sm">
                  More options
                  <Collapsible.Indicator transition="transform 0.2s" _open={{ transform: "rotate(180deg)" }}>
                    <LuChevronDown aria-hidden />
                  </Collapsible.Indicator>
                </Button>
              </Collapsible.Trigger>
              <Collapsible.Content>
                <Stack gap="8" pt="5">
                  <Part title="Your own color">
                    <Flex gap="3" align="end" wrap="wrap">
                      <Input
                        type="color"
                        aria-label="Your own color"
                        value={values.brandColor}
                        width="16"
                        p="1"
                        onChange={(event) => {
                          form.setFieldValue("brandColor", event.target.value);
                          form.setFieldValue("palette", "brand");
                        }}
                      />
                      <Field.Root width="auto">
                        <Field.Label>Color code</Field.Label>
                        <Input
                          value={code}
                          maxLength={7}
                          width="32"
                          onChange={(event) => {
                            setCode(event.target.value);
                            if (HEX.test(event.target.value)) {
                              form.setFieldValue("brandColor", event.target.value.toLowerCase());
                              form.setFieldValue("palette", "brand");
                            }
                          }}
                        />
                      </Field.Root>
                    </Flex>
                    {adjusted?.light && (
                      <Text>In light mode, buttons use a slightly darker shade so they stand out.</Text>
                    )}
                    {adjusted?.dark && (
                      <Text>In dark mode, buttons use a slightly lighter shade so they stand out.</Text>
                    )}
                  </Part>

                  <Part title="Heading lettering">
                    <FontChoices
                      current={values.headingFont}
                      sample={values.appName}
                      suffix="headings"
                      onChoose={(font) => form.setFieldValue("headingFont", font)}
                    />
                  </Part>

                  <Part title="Text lettering">
                    <FontChoices
                      current={values.bodyFont}
                      sample={values.appName}
                      suffix="text"
                      onChoose={(font) => form.setFieldValue("bodyFont", font)}
                    />
                  </Part>
                </Stack>
              </Collapsible.Content>
            </Collapsible.Root>
          </Section>

          <HStack gap="3">
            <form.SubmitButton>Save</form.SubmitButton>
            <form.ResetButton>Cancel</form.ResetButton>
          </HStack>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}

/** One part of the page: its title, a line on what it is for, and its contents. */
function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Stack gap="5" as="section" aria-label={title}>
      <Stack gap="1">
        <Heading as="h3" size="md">
          {title}
        </Heading>
        <Text textStyle="sm" color="fg.muted">
          {description}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

/** A group of choices within a section, under its own small heading. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="3" as="section" aria-label={title}>
      <Heading as="h4" size="sm">
        {title}
      </Heading>
      {children}
    </Stack>
  );
}

interface FontChoicesProps {
  current: Font;
  sample: string;
  suffix: string;
  onChoose: (font: Font) => void;
}

/** One button per lettering, each showing the app's name in it. */
function FontChoices({ current, sample, suffix, onChoose }: FontChoicesProps) {
  return (
    <SimpleGrid minChildWidth="48" gap="2">
      {FONTS.map((font) => (
        <Button
          key={font}
          aria-label={`${FONT_LABEL[font]} ${suffix}`}
          aria-pressed={current === font}
          variant="outline"
          _pressed={PRESSED}
          fontFamily={FONT_FAMILY[font]}
          justifyContent="start"
          onClick={() => onChoose(font)}
        >
          {sample.trim() === "" ? FONT_LABEL[font] : sample}
        </Button>
      ))}
    </SimpleGrid>
  );
}
