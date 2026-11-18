import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { ranksQuery } from "../ranks/ranks";
import { formatIsoDate } from "@jwcarman/roux-web/dates";
import { promoteStudent, promotionRequestSchema, type StudentDetail } from "./students";

/** Promote `student` to a rank on a date (today unless changed), in a dialog. */
export function PromoteDialog({ student, trigger }: { student: StudentDetail; trigger: ReactElement }) {
  const ranks = useQuery(ranksQuery);
  const name = `${student.firstName} ${student.lastName}`;
  const form = useSchemaForm({
    schema: promotionRequestSchema,
    defaultValues: { rankId: "", date: formatIsoDate(new Date()) },
    mutation: promoteStudent(student.id),
    onSuccess: () => notify.success(`${name} was promoted`),
    failure: `Could not promote ${name}`,
  });
  const options = (ranks.data ?? []).map((rank) => ({ value: rank.id, label: rank.name }));

  return (
    <FormDialog form={form} title={`Promote ${name}`} trigger={trigger} submitLabel="Promote">
      <form.AppField name="rankId">
        {(f) => <f.SelectField label="Rank" options={options} placeholder="Choose a rank" />}
      </form.AppField>
      <form.AppField name="date">{(f) => <f.InputField label="Date" type="date" />}</form.AppField>
    </FormDialog>
  );
}
