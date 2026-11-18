package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.UUID;

/** One class a student attended, as their page lists it. */
public record StudentAttendance(UUID id, LocalDate date, UUID classId, String className) {

  /** The attendance {@code entity} holds. */
  public static StudentAttendance of(AttendanceEntity entity) {
    return new StudentAttendance(
        entity.getId(),
        entity.getAttendedOn(),
        entity.getSchoolClass().getId(),
        entity.getSchoolClass().getName());
  }
}
