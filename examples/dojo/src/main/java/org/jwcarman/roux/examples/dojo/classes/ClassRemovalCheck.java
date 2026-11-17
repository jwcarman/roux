package org.jwcarman.roux.examples.dojo.classes;

/**
 * A reason a class may not be removed, from a feature that refers to classes (attendance).
 * Implementations throw a {@code ConflictException} saying why.
 */
@FunctionalInterface
public interface ClassRemovalCheck {

  /** Refuses the removal of {@code schoolClass} by throwing, or returns to allow it. */
  void check(ClassEntity schoolClass);
}
