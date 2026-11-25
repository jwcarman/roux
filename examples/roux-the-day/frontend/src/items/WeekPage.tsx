import { Badge, Button, Flex, Heading, Link, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { LuChevronLeft, LuChevronRight } from "react-icons/lu";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { useToday } from "@jwcarman/roux-web/organization";
import { FilterChips } from "@jwcarman/roux-web/table";
import type { ItemRow } from "../api";
import { WEEK_LIMIT, weekQuery } from "./items";
import { addDays, dayHeading, mondayOf, weekDays, weekRange } from "./week";

const route = getRouteApi("/_signedIn/week");

/** The week's URL: a day in the week shown (this week when absent), and whose items. */
export type WeekSearch = { week?: string; assignee?: "me" };

const WHOSE = [{ value: "me", label: "Mine" }] as const;

/** One item in its day: the time (or All day), the title as a link, and Done when it is. */
function WeekItem({ item }: Readonly<{ item: ItemRow }>) {
  return (
    <Flex as="li" gap="3" align="baseline">
      <Text textStyle="sm" color="fg.muted" w="16" flexShrink="0">
        {item.at ?? "All day"}
      </Text>
      <Link asChild textStyle="sm" fontWeight="medium">
        <RouterLink to="/items/$itemId" params={{ itemId: item.id }}>
          {item.title}
        </RouterLink>
      </Link>
      {item.done && (
        <Badge size="sm" colorPalette="green">
          Done
        </Badge>
      )}
    </Flex>
  );
}

/** One day's row: its name on the left, with a Today badge on today, and its items by time. */
function WeekDay({ day, items, isToday }: Readonly<{ day: string; items: ItemRow[]; isToday: boolean }>) {
  const heading = dayHeading(day);
  return (
    <Flex
      as="section"
      aria-label={heading.label}
      aria-current={isToday ? "date" : undefined}
      gap="4"
      py="3"
      borderTopWidth="1px"
    >
      <Stack gap="0" w="16" flexShrink="0" aria-hidden>
        <Text textStyle="xs" fontWeight="semibold" color="fg.muted" textTransform="uppercase">
          {heading.weekday}
        </Text>
        <Text textStyle="2xl" fontWeight="semibold" lineHeight="1.1">
          {heading.day}
        </Text>
        {isToday && (
          <Badge size="xs" colorPalette="blue" alignSelf="flex-start" mt="1">
            Today
          </Badge>
        )}
      </Stack>
      {items.length === 0 ? (
        <Text textStyle="sm" color="fg.subtle" pt="1">
          Nothing planned
        </Text>
      ) : (
        <Stack as="ul" gap="2" listStyleType="none" pt="1" flex="1" minW="0">
          {items.map((item) => (
            <WeekItem key={item.id} item={item} />
          ))}
        </Stack>
      )}
    </Flex>
  );
}

/** /week: the team's plans for one week, a row a day, Monday to Sunday. */
export function Week() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const today = useToday();
  const monday = mondayOf(search.week ?? today);
  const days = weekDays(monday);
  const week = useQuery(weekQuery(monday, days[6], search.assignee));
  const show = (first?: string) => navigate({ search: (previous) => ({ ...previous, week: first }) });
  const thisWeek = mondayOf(today);

  return (
    <Stack gap="6">
      <PageHeader title="Week" />
      <Flex gap="3" wrap="wrap" align="center" justify="space-between">
        <Flex gap="2" align="center" wrap="wrap">
          <Button size="sm" variant="outline" aria-label="Previous week" onClick={() => show(addDays(monday, -7))}>
            <LuChevronLeft aria-hidden />
          </Button>
          <Button size="sm" variant="outline" disabled={monday === thisWeek} onClick={() => show()}>
            This week
          </Button>
          <Button size="sm" variant="outline" aria-label="Next week" onClick={() => show(addDays(monday, 7))}>
            <LuChevronRight aria-hidden />
          </Button>
          <Heading as="h2" textStyle="lg" ms="2">
            {weekRange(monday)}
          </Heading>
        </Flex>
        <FilterChips
          label="Whose"
          options={WHOSE}
          value={search.assignee}
          allLabel="Everyone"
          onChange={(assignee) => navigate({ search: (previous) => ({ ...previous, assignee }) })}
        />
      </Flex>
      {week.isError && <Text color="fg.error">Could not load the week</Text>}
      {week.data?.pagination.hasNext && (
        <Text color="fg.muted" textStyle="sm">
          Showing the first {WEEK_LIMIT} of {week.data.pagination.totalElementCount} items: choose Mine, or see them all
          in Items.
        </Text>
      )}
      {week.data && (
        <Stack role="group" aria-label="Days of the week" gap="0" borderBottomWidth="1px">
          {days.map((day) => (
            <WeekDay
              key={day}
              day={day}
              isToday={day === today}
              items={week.data.data.filter((item) => item.day === day)}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
