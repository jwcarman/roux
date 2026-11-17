import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { fieldRules, oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** The days of the week, Monday first: java.time.DayOfWeek's names. */
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Each weekday as people write it. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/** A class as `/api/classes` answers it: times are `HH:mm` on the school's clock. */
export interface SchoolClass {
  id: string;
  name: string;
  weekday: Weekday;
  startsAt: string;
  endsAt: string;
  instructorId: string | null;
  instructorName: string | null;
  version: number;
}

/** A member who may teach a class, for the instructor choice. */
export interface Instructor {
  id: string;
  name: string;
}

/** A required time of day, as a `type="time"` input holds it (`HH:mm`): `@NotNull LocalTime`. */
const time = z
  .string()
  .trim()
  .min(1, { error: "Must not be empty", abort: true })
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: "Is not in the expected format" })
  .register(fieldRules, { required: true });

/** An optional choice among ids loaded at run time: `""` (nothing chosen) is sent as null. */
const optionalId = z.string().transform((value) => (value === "" ? null : value));

/** ClassRequest's rules (without the version), in the server's words. */
export const classRequestSchema = z
  .object({
    name: text().max(60),
    weekday: oneOf(WEEKDAYS),
    startsAt: time,
    endsAt: time,
    instructorId: optionalId,
  })
  .refine((request) => request.endsAt > request.startsAt, {
    path: ["endsAt"],
    error: "Must be after the start time",
  });

/** What a class form sends: the name trimmed, no instructor as null. */
export type ClassRequest = z.output<typeof classRequestSchema>;

/** `/api/classes`: one function per endpoint. */
export const classesApi = {
  list: (signal?: AbortSignal) => getJson<SchoolClass[]>("classes", { signal }),
  get: (id: string, signal?: AbortSignal) => getJson<SchoolClass>(path`classes/${id}`, { signal }),
  instructors: (signal?: AbortSignal) => getJson<Instructor[]>("classes/instructors", { signal }),
  create: (request: ClassRequest) => sendJson<SchoolClass>("POST", "classes", request),
  update: (id: string, request: ClassRequest & { version: number }) =>
    sendJson<SchoolClass>("PUT", path`classes/${id}`, request),
  remove: (id: string) => sendJson<void>("DELETE", path`classes/${id}`),
};

/** The whole timetable, Monday's classes first, each day's by start time. */
export const classesQuery = queryOptions({
  queryKey: queryKeys.classes.lists(),
  queryFn: ({ signal }) => classesApi.list(signal),
});

/** A class, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function classQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.classes.detail(id),
    queryFn: ({ signal }) => classesApi.get(id, signal),
  });
}

/** The members who may teach a class: the owner and the instructors. */
export const instructorsQuery = queryOptions({
  queryKey: queryKeys.classes.instructors(),
  queryFn: ({ signal }) => classesApi.instructors(signal),
});

/** Adds a class; the timetable refreshes. */
export const createClass = mutationOptions({
  mutationFn: (request: ClassRequest) => classesApi.create(request),
  meta: { refreshes: [queryKeys.classes.lists()] },
});

/** Saves a class at the `version` it was read at; a change made since answers 409. */
export const updateClass = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: ClassRequest) => classesApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.classes.detail(id), queryKeys.classes.lists()] },
  });

/** Removes a class; one with attendance is refused (409). */
export const removeClass = mutationOptions({
  mutationFn: (id: string) => classesApi.remove(id),
  meta: { refreshes: [queryKeys.classes.lists()] },
});
