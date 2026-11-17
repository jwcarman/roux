package org.jwcarman.roux.examples.dojo.classes;

import java.time.DayOfWeek;

/**
 * A reason a class may not move to another weekday, from a feature that keeps dates against it
 * (attendance). Implementations throw a {@code ConflictException} saying why.
 */
@FunctionalInterface
public interface ClassWeekdayChangeCheck {

  /** Refuses moving {@code schoolClass} to {@code weekday} by throwing, or returns to allow it. */
  void check(ClassEntity schoolClass, DayOfWeek weekday);
}
