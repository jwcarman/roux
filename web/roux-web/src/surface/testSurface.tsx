// Test helper: a surface of the roux catalog's implementations, as a frame renders it.
import { A2uiSurface } from "@a2ui/react";
import { MessageProcessor } from "@a2ui/web_core";
import { act, render } from "@testing-library/react";
import { CATALOG_ID } from "../a2ui";
import { setOrganization, testOrganization } from "../organization";
import { ThemeProvider } from "../theme";
import { surfaceComponents } from "./components";

const SURFACE = "test";

/** The surface's element, to render in whatever the test needs around it (a router), and its data model's read and write. */
export function startSurface(
  components: Record<string, unknown>[],
  data: Record<string, unknown> = {},
  onAction?: (action: unknown) => void,
) {
  setOrganization(testOrganization());
  const processor = new MessageProcessor([surfaceComponents], onAction, { version: "v1.0" });
  processor.processMessages([
    { version: "1.0", createSurface: { surfaceId: SURFACE, catalogId: CATALOG_ID } },
    { version: "1.0", updateComponents: { surfaceId: SURFACE, components } },
    { version: "1.0", updateDataModel: { surfaceId: SURFACE, path: "/", value: data } },
  ]);
  const surface = processor.model.surfacesMap.get(SURFACE);
  if (!surface) throw new Error("surface not created");
  return {
    element: <A2uiSurface surface={surface} />,
    read: (path: string): unknown => surface.dataModel.get(path),
    /** Calls `onChange` with each later change to the data at `path`. */
    watch: (path: string, onChange: (value: unknown) => void) => {
      surface.dataModel.subscribe(path, onChange);
    },
    /** Replaces components, as the agent's next message would. */
    update: (changed: Record<string, unknown>[]) =>
      act(() => {
        processor.processMessages([{ version: "1.0", updateComponents: { surfaceId: SURFACE, components: changed } }]);
      }),
    write: (path: string, value: unknown) =>
      act(() => {
        processor.processMessages([{ version: "1.0", updateDataModel: { surfaceId: SURFACE, path, value } }]);
      }),
  };
}

export function renderSurface(
  components: Record<string, unknown>[],
  data: Record<string, unknown> = {},
  onAction?: (action: unknown) => void,
) {
  const { element, ...surface } = startSurface(components, data, onAction);
  return { view: render(<ThemeProvider>{element}</ThemeProvider>), ...surface };
}
