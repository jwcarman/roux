import { Box, Checkbox, Fieldset, Stack, Text } from "@chakra-ui/react";
import { errorMessages, useFieldContext } from "@jwcarman/roux-web/form";

/** Someone who may be chosen; `active: false` is a deactivated person kept from the saved item. */
export interface Choice {
  id: string;
  name: string;
  active: boolean;
}

/**
 * Who an item is assigned to: a checkbox per person, in a fieldset its legend names. roux-web has
 * no field for choosing several (FINDINGS.md), and its FormField frames one control: checkboxes in
 * it share the field's id, so each label would tick the first. The form validates on blur and on
 * submit, so an error shows once it is found. A deactivated person already on the item
 * is listed so they can be unticked; they cannot be kept, which the server refuses.
 */
export function AssigneesField({
  label,
  people,
}: Readonly<{ label: string; people: Choice[] }>) {
  const field = useFieldContext<string[]>();
  const messages = errorMessages(field.state.meta.errors);
  const chosen = field.state.value;
  const toggle = (id: string, checked: boolean) =>
    field.handleChange(
      checked ? [...chosen, id] : chosen.filter((other) => other !== id),
    );
  return (
    <Fieldset.Root invalid={messages.length > 0}>
      <Fieldset.Legend textStyle="sm" fontWeight="medium">
        {label}
        <Text as="span" color="fg.error" aria-hidden ms="1">
          *
        </Text>
      </Fieldset.Legend>
      <Stack gap="2">
        {people.map((person) => (
          <Checkbox.Root
            key={person.id}
            checked={chosen.includes(person.id)}
            onCheckedChange={({ checked }) =>
              toggle(person.id, checked === true)
            }
          >
            <Checkbox.HiddenInput onBlur={field.handleBlur} />
            <Checkbox.Control />
            <Checkbox.Label>
              {person.active ? person.name : `${person.name} (deactivated)`}
            </Checkbox.Label>
          </Checkbox.Root>
        ))}
      </Stack>
      <Box minH="4">
        <Fieldset.ErrorText>{messages[0]}</Fieldset.ErrorText>
      </Box>
    </Fieldset.Root>
  );
}

/** The team's active members, plus anyone on the item who has since been deactivated. */
export function choicesOf(
  team: { id: string; displayName: string }[],
  current: Choice[] = [],
): Choice[] {
  const active: Choice[] = team.map((member) => ({
    id: member.id,
    name: member.displayName,
    active: true,
  }));
  const gone = current.filter(
    (person) =>
      !person.active && !active.some((member) => member.id === person.id),
  );
  return [...active, ...gone];
}
