package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;

/**
 * How many classes a student has attended since their current rank's promotion: those on a later
 * date than it. A student never promoted has all theirs, and {@code promotedOn} is null.
 */
public record SincePromotion(long classes, LocalDate promotedOn) {}
