import type { ReactElement } from "react";
import { Alert } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-form";
import { formatIsoDate } from "@jwcarman/roux-web/dates";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { activePlansQuery, pricePerPeriod } from "../plans/plans";
import { formatDate } from "../shell/format";
import type { StudentDetail } from "../students/students";
import { defaultStartDate, membershipRequestSchema, startMembership, type MembershipView } from "./memberships";

/** Put `student` on a plan from a date: by default when their paid time runs out. */
export function StartMembershipDialog({
  student,
  current,
  trigger,
}: {
  student: StudentDetail;
  current: MembershipView | null;
  trigger: ReactElement;
}) {
  const plans = useQuery(activePlansQuery);
  const name = `${student.firstName} ${student.lastName}`;
  const form = useSchemaForm({
    schema: membershipRequestSchema,
    defaultValues: { planId: "", startDate: defaultStartDate(current, formatIsoDate(new Date())) },
    mutation: startMembership(student.id),
    onSuccess: (membership) => notify.success(`${student.firstName} is on ${membership.plan.name}`),
    failure: `Could not start a membership for ${name}`,
  });
  const startDate = useStore(form.store, (state) => state.values.startDate);
  const options = (plans.data ?? []).map((plan) => ({
    value: plan.id,
    label: `${plan.name} (${pricePerPeriod(plan)})`,
  }));
  const givesUpPaidTime = current !== null && startDate !== "" && startDate <= current.paidThrough;

  return (
    <FormDialog form={form} title={`Start a membership for ${name}`} trigger={trigger} submitLabel="Start">
      <form.AppField name="planId">
        {(f) => <f.SelectField label="Plan" options={options} placeholder="Choose a plan" />}
      </form.AppField>
      <form.AppField name="startDate">{(f) => <f.InputField label="Start date" type="date" />}</form.AppField>
      {givesUpPaidTime && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Title>
            {`${student.firstName} is paid through ${formatDate(current.paidThrough)}; starting earlier gives up the paid time after that.`}
          </Alert.Title>
        </Alert.Root>
      )}
    </FormDialog>
  );
}
