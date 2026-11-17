package org.jwcarman.roux.examples.dojo.ranks;

/**
 * A reason a rank may not be removed, from a feature that refers to ranks (students' promotions).
 * Implementations throw a {@code ConflictException} saying why.
 */
@FunctionalInterface
public interface RankRemovalCheck {

  /** Refuses the removal of {@code rank} by throwing, or returns to allow it. */
  void check(RankEntity rank);
}
