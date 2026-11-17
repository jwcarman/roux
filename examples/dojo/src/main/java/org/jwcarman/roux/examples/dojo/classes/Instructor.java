package org.jwcarman.roux.examples.dojo.classes;

import java.util.UUID;

/** A member who may teach a class: an owner or an instructor. */
public record Instructor(UUID id, String name) {}
