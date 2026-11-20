import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import {
  FormDialog,
  moneyInputOf,
  useSchemaForm,
} from "@jwcarman/roux-web/form";
import {
  createPlan,
  PLAN_PERIODS,
  planSchema,
  updatePlan,
  type Plan,
} from "./plans";

/** "New plan", or "Edit" for the plan given (at the version shown), in a dialog. */
export function PlanFormDialog({
  plan,
  trigger,
}: {
  plan?: Plan;
  trigger: ReactElement;
}) {
  const form = useSchemaForm({
    schema: planSchema,
    defaultValues: plan
      ? {
          name: plan.name,
          price: moneyInputOf(plan.price),
          period: plan.period,
          active: plan.active,
        }
      : { name: "", price: "", period: "", active: true },
    mutation: plan ? updatePlan(plan.id, plan.version) : createPlan,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
  });

  return (
    <FormDialog
      form={form}
      title={plan ? `Edit ${plan.name}` : "New plan"}
      trigger={trigger}
    >
      <form.AppField name="name">
        {(f) => <f.InputField label="Name" />}
      </form.AppField>
      <form.AppField name="price">
        {(f) => <f.MoneyField label="Price" />}
      </form.AppField>
      <form.AppField name="period">
        {(f) => (
          <f.SelectField
            label="Period"
            options={PLAN_PERIODS}
            placeholder="Choose a period"
            helperText={
              plan?.inUse ? "A plan in use keeps its period" : undefined
            }
          />
        )}
      </form.AppField>
      <form.AppField name="active">
        {(f) => (
          <f.CheckboxField
            label="Active"
            helperText="Offered for new memberships"
          />
        )}
      </form.AppField>
    </FormDialog>
  );
}
