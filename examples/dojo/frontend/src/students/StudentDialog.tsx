import type { ReactElement } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, inputOf, useSchemaForm } from "@jwcarman/roux-web/form";
import { todayIso } from "../shell/dates";
import { createStudent, studentRequestSchema, updateStudent, type Student } from "./students";

/** "New student", or "Edit" for the student given (at the version shown), in a dialog. */
export function StudentDialog({ student, trigger }: { student?: Student; trigger: ReactElement }) {
  const form = useSchemaForm({
    schema: studentRequestSchema,
    defaultValues: student
      ? {
          firstName: student.firstName,
          lastName: student.lastName,
          email: inputOf(student.email),
          phone: inputOf(student.phone),
          birthDate: inputOf(student.birthDate),
          startDate: student.startDate,
        }
      : { firstName: "", lastName: "", email: "", phone: "", birthDate: "", startDate: todayIso() },
    mutation: student ? updateStudent(student.id, student.version) : createStudent,
    onSuccess: (saved) => notify.success(`${saved.firstName} ${saved.lastName} was saved`),
    failure: "Could not save the student",
  });

  return (
    <FormDialog
      form={form}
      title={student ? `Edit ${student.firstName} ${student.lastName}` : "New student"}
      trigger={trigger}
    >
      <form.AppField name="firstName">{(f) => <f.InputField label="First name" autoComplete="off" />}</form.AppField>
      <form.AppField name="lastName">{(f) => <f.InputField label="Last name" autoComplete="off" />}</form.AppField>
      <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" autoComplete="off" />}</form.AppField>
      <form.AppField name="phone">{(f) => <f.InputField label="Phone" type="tel" autoComplete="off" />}</form.AppField>
      <form.AppField name="birthDate">{(f) => <f.InputField label="Date of birth" type="date" />}</form.AppField>
      <form.AppField name="startDate">{(f) => <f.InputField label="Start date" type="date" />}</form.AppField>
    </FormDialog>
  );
}
