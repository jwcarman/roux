// The app's surface binder, made once from the generated contract: each surface's binding uses `bind`.
import { surfaces } from "@jwcarman/roux-web/surface";
import { contract, type Commands, type Queries } from "./contract.gen";

export const { bind } = surfaces<Queries, Commands>(contract);
