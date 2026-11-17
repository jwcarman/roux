package org.jwcarman.roux.examples.dojo.classes;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * A class as the API answers it; {@code instructorName} is null when there is no instructor, or the
 * member is no longer in the directory.
 */
public record SchoolClass(
    UUID id,
    String name,
    DayOfWeek weekday,
    @JsonFormat(pattern = "HH:mm") LocalTime startsAt,
    @JsonFormat(pattern = "HH:mm") LocalTime endsAt,
    UUID instructorId,
    String instructorName,
    long version) {

  /** The class {@code entity} holds, taught by the member called {@code instructorName}. */
  public static SchoolClass of(ClassEntity entity, String instructorName) {
    return new SchoolClass(
        entity.getId(),
        entity.getName(),
        entity.getWeekday(),
        entity.getStartsAt(),
        entity.getEndsAt(),
        entity.getInstructorId(),
        instructorName,
        entity.getVersion());
  }
}
