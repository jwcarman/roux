// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mutationOptions } from "@tanstack/react-query";
import { text, useSchemaForm } from "@jwcarman/roux-web/form";
import { renderWithProviders } from "@jwcarman/roux-web/testing";

const schema = z.object({ name: text().max(40) });

function NameForm() {
  const form = useSchemaForm({
    schema,
    defaultValues: { name: "" },
    mutation: mutationOptions({
      mutationFn: async (values: z.output<typeof schema>) => values,
    }),
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">
          {(f) => <f.InputField label="Name" />}
        </form.AppField>
      </form.Form>
    </form.AppForm>
  );
}

/**
 * roux-web is linked from roux's source (file:), with its own node_modules beside it. A form built
 * from its hooks renders here only if it shares this app's React: a second copy would throw
 * "Invalid hook call".
 */
describe("roux-web, linked from source", () => {
  it("renders a roux form with the app's React", () => {
    renderWithProviders(<NameForm />);

    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument();
  });
});
