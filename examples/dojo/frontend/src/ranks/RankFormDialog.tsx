import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { BELT_COLOURS, createRank, rankRequestSchema, updateRank, type Rank } from "./ranks";

/** "New rank", or "Edit" for the rank given (at the version shown), in a dialog. */
export function RankFormDialog({ rank, trigger }: { rank?: Rank; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: rankRequestSchema,
    defaultValues: rank ? { name: rank.name, colour: rank.colour } : { name: "", colour: "" },
    mutation: rank ? updateRank(rank.id, rank.version) : createRank,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog form={form} title={rank ? `Edit ${rank.name}` : "New rank"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="colour">
        {(f) => <f.SelectField label="Colour" options={BELT_COLOURS} placeholder="Choose a colour" />}
      </form.AppField>
    </FormDialog>
  );
}
