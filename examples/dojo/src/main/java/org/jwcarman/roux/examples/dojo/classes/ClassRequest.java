package org.jwcarman.roux.examples.dojo.classes;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonFormat;

/**
 * A new class, or new values for one. Times are the school's wall clock as {@code HH:mm}; the end
 * must be after the start and the instructor an owner or an instructor ({@link ClassService}).
 * {@code version} is the version being edited, and is ignored when creating.
 */
public record ClassRequest(
    @NotBlank @Size(max = ClassEntity.MAX_NAME) String name,
    @NotNull DayOfWeek weekday,
    @NotNull @JsonFormat(pattern = "HH:mm") LocalTime startsAt,
    @NotNull @JsonFormat(pattern = "HH:mm") LocalTime endsAt,
    UUID instructorId,
    Long version) {

  public ClassRequest {
    name = name == null ? null : name.strip();
  }
}
