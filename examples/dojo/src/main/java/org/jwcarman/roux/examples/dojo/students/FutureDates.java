package org.jwcarman.roux.examples.dojo.students;

import java.time.Clock;
import java.time.LocalDate;

import org.jwcarman.roux.problems.InvalidFieldException;

/**
 * Refuses a date that is in the future wherever the person is. The server cannot know the browser's
 * time zone, so a date up to one day after the server's today is accepted: UTC+14, the furthest
 * zone ahead, is at most that far ahead of UTC (the app's clock is UTC). Bean Validation's
 * {@code @PastOrPresent} would use the server's own zone and refuse a person's "today".
 */
final class FutureDates {

  private FutureDates() {}

  /**
   * Requires that {@code date}, if given, is no later than tomorrow by {@code clock}.
   *
   * @param field the request field the date came from
   * @throws InvalidFieldException on {@code field} if it is later
   */
  static void requireNotInTheFuture(Clock clock, String field, LocalDate date) {
    if (date != null && date.isAfter(LocalDate.now(clock).plusDays(1))) {
      throw new InvalidFieldException(field, "Must not be in the future");
    }
  }
}
