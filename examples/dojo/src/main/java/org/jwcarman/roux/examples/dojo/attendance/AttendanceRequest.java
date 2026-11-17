package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

import org.jwcarman.roux.problems.constraints.NotInFuture;

/**
 * What a check-in screen says about one student: present at the class on {@code date}, or not. It
 * states the wanted outcome rather than toggling, so sending it twice changes nothing the second
 * time.
 */
public record AttendanceRequest(
    @NotNull UUID studentId, @NotNull @NotInFuture LocalDate date, @NotNull Boolean present) {}
