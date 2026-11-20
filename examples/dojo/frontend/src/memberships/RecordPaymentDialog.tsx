import type { ReactElement } from "react";
import { Text } from "@chakra-ui/react";
import { useStore } from "@tanstack/react-form";
import { today } from "@jwcarman/roux-web/organization";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { formatMoney, timesMoney } from "@jwcarman/roux-web/money";
import type { StudentDetail } from "../students/students";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  paymentRequestSchema,
  recordPayment,
  type MembershipView,
} from "./memberships";

/** Record a payment from `student` on their current membership, showing its amount before saving. */
export function RecordPaymentDialog({
  student,
  current,
  trigger,
}: {
  student: StudentDetail;
  current: MembershipView;
  trigger: ReactElement;
}) {
  const name = `${student.firstName} ${student.lastName}`;
  const form = useSchemaForm({
    schema: paymentRequestSchema,
    defaultValues: { periods: 1, takenOn: today(), method: "", note: "" },
    mutation: recordPayment(student.id),
    onSuccess: () => notify.success("The payment was recorded"),
    failure: `Could not record the payment from ${name}`,
  });
  const periods = useStore(form.store, (state) => state.values.periods);
  const price = current.plan.price;
  const counted = typeof periods === "number" && Number.isInteger(periods) && periods >= 1 && periods <= 12;

  return (
    <FormDialog form={form} title={`Record a payment from ${name}`} trigger={trigger} submitLabel="Record">
      <form.AppField name="periods">
        {(f) => (
          <f.NumberField label={current.plan.period === "YEARLY" ? "Years" : "Months"} min={1} max={12} step={1} />
        )}
      </form.AppField>
      {counted && (
        <Text fontWeight="medium">{`${periods} × ${formatMoney(price)} = ${formatMoney(timesMoney(price, periods))}`}</Text>
      )}
      <form.AppField name="takenOn">{(f) => <f.InputField label="Taken on" type="date" />}</form.AppField>
      <form.AppField name="method">
        {(f) => (
          <f.SelectField
            label="Method"
            options={PAYMENT_METHODS}
            labels={PAYMENT_METHOD_LABELS}
            placeholder="Choose a method"
          />
        )}
      </form.AppField>
      <form.AppField name="note">{(f) => <f.TextAreaField label="Note" />}</form.AppField>
    </FormDialog>
  );
}
