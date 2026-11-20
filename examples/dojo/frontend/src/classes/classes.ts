import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { formatIsoDate, parseIsoDate } from "@jwcarman/roux-web/dates";
import { after, id, oneOf, text, time } from "@jwcarman/roux-web/form";
import { today as schoolToday } from "@jwcarman/roux-web/organization";
import { addDays, format, getDay, previousDay, type Day } from "date-fns";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** The days of the week, Monday first: java.time.DayOfWeek's names. */
export const WEEKDAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** A Monday, to count the weekdays from. */
const A_MONDAY = new Date(2024, 0, 1);

/** Each weekday as people write it ("Monday"). */
export const WEEKDAY_LABELS = Object.fromEntries(
  WEEKDAYS.map((weekday, index) => [weekday, format(addDays(A_MONDAY, index), "EEEE")]),
) as Record<Weekday, string>;

/** The weekdays as date-fns numbers them (Sunday is 0). */
const DAY_NUMBERS = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 0,
} as const satisfies Record<Weekday, Day>;

/**
 * The most recent day, up to and including `today` (the school's, by default), that falls on
 * `weekday`, as a date input holds it.
 */
export function latestOn(weekday: Weekday, today: string = schoolToday()): string {
  const day = parseIsoDate(today)!;
  const dayNumber = DAY_NUMBERS[weekday];
  return getDay(day) === dayNumber ? today : formatIsoDate(previousDay(day, dayNumber));
}

/** A class as `/api/classes` answers it: times are `HH:mm:ss` on the school's clock. */
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

/** ClassRequest's rules (without the version), in the server's words. */
export const classRequestSchema = after(
  z.object({
    name: text().max(60),
    weekday: oneOf(WEEKDAYS),
    startsAt: time(),
    endsAt: time(),
    instructorId: id().optional(),
  }),
  { field: "endsAt", other: "startsAt", otherLabel: "the start time" },
);

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
