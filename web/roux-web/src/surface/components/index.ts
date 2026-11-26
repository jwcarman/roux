// The roux A2UI catalog's implementations: A2UI component names → Chakra components.
import type { ReactCatalogComponent } from "@a2ui/react";
import { Catalog } from "@a2ui/web_core";
import { V10_VALIDATION_FUNCTION_IMPLEMENTATIONS } from "@a2ui/web_core/v1_0";
import { CATALOG_ID } from "../../a2ui";
import { dataComponents } from "./data";
import { formComponents } from "./form";
import { layoutComponents } from "./layout";

export const surfaceComponents = new Catalog<ReactCatalogComponent>(
  CATALOG_ID,
  "1.0",
  [...layoutComponents, ...dataComponents, ...formComponents],
  V10_VALIDATION_FUNCTION_IMPLEMENTATIONS,
);
