import { Button, type ButtonProps } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { LuPlus } from "react-icons/lu";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { useToday } from "@jwcarman/roux-web/organization";
import type { User } from "@jwcarman/roux-web/users";
import { useMe } from "../routes/_signedIn";
import { choicesOf } from "./AssigneesField";
import { ItemFields } from "./ItemFields";
import { addItem, blankItem, itemSchema, teamQuery } from "./items";

function AddButton(props: ButtonProps) {
  return (
    <Button alignSelf="start" {...props}>
      <LuPlus aria-hidden />
      Add item
    </Button>
  );
}

/** "Add item": a dialog for a new item, today and all day, assigned to whoever adds it. It waits for the team. */
export function AddItem() {
  const team = useQuery(teamQuery).data;
  if (!team) {
    return <AddButton disabled />;
  }
  return <AddDialog team={team} />;
}

function AddDialog({ team }: Readonly<{ team: User[] }>) {
  const me = useMe();
  const today = useToday();
  const form = useSchemaForm({
    schema: itemSchema,
    defaultValues: blankItem(today, me.identityId),
    mutation: addItem,
    onSuccess: (item) => notify.success(`Added ${item.title}`),
    failure: "Could not add the item",
  });
  return (
    <FormDialog form={form} title="Add an item" trigger={<AddButton />} submitLabel="Add item">
      <ItemFields form={form} people={choicesOf(team)} editing={false} />
    </FormDialog>
  );
}
