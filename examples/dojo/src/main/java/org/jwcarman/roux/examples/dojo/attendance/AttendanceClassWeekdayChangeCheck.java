package org.jwcarman.roux.examples.dojo.attendance;

import java.time.DayOfWeek;
import java.time.format.TextStyle;
import java.util.Locale;

import org.jwcarman.roux.examples.dojo.classes.ClassEntity;
import org.jwcarman.roux.examples.dojo.classes.ClassWeekdayChangeCheck;
import org.jwcarman.roux.problems.ConflictException;
import org.springframework.stereotype.Component;

/**
 * A class with attendance keeps its weekday: the attendance is on dates that are that weekday, and
 * would be left on days the class no longer runs.
 */
@Component
public class AttendanceClassWeekdayChangeCheck implements ClassWeekdayChangeCheck {

  private final AttendanceRepository attendance;

  public AttendanceClassWeekdayChangeCheck(AttendanceRepository attendance) {
    this.attendance = attendance;
  }

  @Override
  public void check(ClassEntity schoolClass, DayOfWeek weekday) {
    if (attendance.existsBySchoolClassId(schoolClass.getId())) {
      throw new ConflictException(
          "%s has attendance on %ss; it cannot move to another day",
          schoolClass.getName(),
          schoolClass.getWeekday().getDisplayName(TextStyle.FULL, Locale.ENGLISH));
    }
  }
}
