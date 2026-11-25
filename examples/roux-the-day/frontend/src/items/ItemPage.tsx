import { Button, Link, Stack } from "@chakra-ui/react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { LuArrowLeft, LuTrash2 } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, useConfirm } from "@jwcarman/roux-web/feedback";
import { useSchemaForm } from "@jwcarman/roux-web/form";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import type { ItemDetail } from "../api";
import { ITEMS_WRITE } from "../permissions.gen";
import { useMe } from "../routes/_signedIn";
import { choicesOf } from "./AssigneesField";
import { ItemFields } from "./ItemFields";
import { deleteItem, itemQuery, itemSchema, teamQuery, updateItem, valuesOf } from "./items";

const route = getRouteApi("/_signedIn/items/$itemId");

/** /items/$itemId: the loader has fetched the item, so this renders with data at once. */
export function Item() {
  const { itemId } = route.useParams();
  const { data: item } = useSuspenseQuery(itemQuery(itemId));
  const team = useQuery(teamQuery).data;
  const me = useMe();
  return (
    <Stack gap="4">
      <Link asChild alignSelf="start" fontSize="sm">
        <RouterLink to="/items">
          <LuArrowLeft aria-hidden />
          All items
        </RouterLink>
      </Link>
      <PageHeader title={item.title}>{item.canDelete && <DeleteButton item={item} />}</PageHeader>
      {me.permissions.includes(ITEMS_WRITE) && team && (
        // Keyed by version: a save (or another's, after a 409) starts the form over from the item.
        <ItemForm key={item.version} item={item} people={choicesOf(team, item.assignees)} />
      )}
    </Stack>
  );
}

function ItemForm({ item, people }: Readonly<{ item: ItemDetail; people: ReturnType<typeof choicesOf> }>) {
  const form = useSchemaForm({
    schema: itemSchema,
    defaultValues: valuesOf(item),
    mutation: updateItem(item.id, item.version),
    onSuccess: () => notify.success("Item saved"),
    failure: "Could not save the item",
  });
  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="4" maxW="lg">
          <ItemFields form={form} people={people} editing />
          <form.SubmitButton>Save item</form.SubmitButton>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}

function DeleteButton({ item }: Readonly<{ item: ItemDetail }>) {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { run, pending } = useServerAction(deleteItem(item.id), {
    failure: () => `Could not delete ${item.title}`,
    onSuccess: async () => {
      notify.success(`Deleted ${item.title}`);
      await navigate({ to: "/items" });
    },
  });
  const remove = async () => {
    const confirmed = await confirm({
      title: `Delete ${item.title}?`,
      message: "It is gone for everyone on the team.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) {
      await run();
    }
  };
  return (
    <Button variant="outline" colorPalette="red" loading={pending} onClick={remove}>
      <LuTrash2 aria-hidden />
      Delete
    </Button>
  );
}
