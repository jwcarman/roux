package org.jwcarman.roux.examples.dojo.classes;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.validation.After;

/**
 * A new class, or new values for one. Times are the school's wall clock ({@code HH:mm} in, {@code
 * HH:mm:ss} out, as Jackson writes a {@code LocalTime}); the end must be after the start ({@link
 * After}, on {@code endsAt}) and the instructor an owner or an instructor ({@link ClassService}).
 * {@code version} is the version being edited, and is ignored when creating.
 */
@After(field = "endsAt", other = "startsAt", otherLabel = "the start time")
public record ClassRequest(
    @NotBlank @Size(max = ClassEntity.MAX_NAME) String name,
    @NotNull DayOfWeek weekday,
    @NotNull LocalTime startsAt,
    @NotNull LocalTime endsAt,
    UUID instructorId,
    Long version) {

  public ClassRequest {
    name = name == null ? null : name.strip();
  }
}
