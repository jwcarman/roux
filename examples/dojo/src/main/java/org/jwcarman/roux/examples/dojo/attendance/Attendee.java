package org.jwcarman.roux.examples.dojo.attendance;

import java.util.UUID;

/** A student on a class's check-in list, and whether they are marked present on that date. */
public record Attendee(UUID studentId, String firstName, String lastName, boolean present) {}
