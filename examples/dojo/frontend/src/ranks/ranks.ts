import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** The belt colours a rank can have: the server's BeltColour enum. */
export const BELT_COLOURS = ["WHITE", "YELLOW", "ORANGE", "GREEN", "BLUE", "PURPLE", "BROWN", "RED", "BLACK"] as const;
export type BeltColour = (typeof BELT_COLOURS)[number];

/** Each belt's own colour, for its swatch. Belts are data, not the app's theme. */
export const BELT_SWATCHES: Record<BeltColour, string> = {
  WHITE: "#f8fafc",
  YELLOW: "#facc15",
  ORANGE: "#f97316",
  GREEN: "#16a34a",
  BLUE: "#2563eb",
  PURPLE: "#7c3aed",
  BROWN: "#78350f",
  RED: "#dc2626",
  BLACK: "#111827",
};

/** A rank as `/api/ranks` answers it; `position` orders the ladder from 1 (the lowest). */
export interface Rank {
  id: string;
  name: string;
  colour: BeltColour;
  position: number;
  version: number;
}

/** RankRequest's rules (without the version), in the server's words. */
export const rankRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(BELT_COLOURS),
});

/** What a rank form sends: the name trimmed, the colour chosen. */
export type RankRequest = z.output<typeof rankRequestSchema>;

/** `/api/ranks`: one function per endpoint. */
export const ranksApi = {
  list: (signal?: AbortSignal) => getJson<Rank[]>("ranks", { signal }),
  create: (request: RankRequest) => sendJson<Rank>("POST", "ranks", request),
  update: (id: string, request: RankRequest & { version: number }) => sendJson<Rank>("PUT", path`ranks/${id}`, request),
  moveUp: (id: string) => sendJson<Rank[]>("POST", path`ranks/${id}/move-up`),
  moveDown: (id: string) => sendJson<Rank[]>("POST", path`ranks/${id}/move-down`),
  remove: (id: string) => sendJson<void>("DELETE", path`ranks/${id}`),
};

/** The ladder, lowest first, for the ranks page and the rank pickers. */
export const ranksQuery = queryOptions({
  queryKey: queryKeys.ranks.lists(),
  queryFn: ({ signal }) => ranksApi.list(signal),
});

const refreshesRanks = { refreshes: [queryKeys.ranks.lists()] };

/** Adds a rank at the top of the ladder. */
export const createRank = mutationOptions({
  mutationFn: (request: RankRequest) => ranksApi.create(request),
  meta: refreshesRanks,
});

/** Saves a rank at the `version` it was read at; a change made since answers 409. */
export const updateRank = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: RankRequest) => ranksApi.update(id, { ...request, version }),
    meta: refreshesRanks,
  });

/** Swaps a rank with the one above it. */
export const moveRankUp = mutationOptions({ mutationFn: (id: string) => ranksApi.moveUp(id), meta: refreshesRanks });

/** Swaps a rank with the one below it. */
export const moveRankDown = mutationOptions({ mutationFn: (id: string) => ranksApi.moveDown(id), meta: refreshesRanks });

/** Removes a rank; one students hold or have held is refused (409). */
export const removeRank = mutationOptions({ mutationFn: (id: string) => ranksApi.remove(id), meta: refreshesRanks });
