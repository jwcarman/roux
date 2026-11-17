package org.jwcarman.roux.examples.dojo.students;

import org.jwcarman.jpa.entity.BaseEntity;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/** The version check an edit makes before it changes anything. */
final class StudentVersions {

  private StudentVersions() {}

  /**
   * Refuses an edit made from a stale read.
   *
   * @param read the version the client read, or null if it sent none
   * @throws InvalidFieldException on {@code version} if none is given
   * @throws ObjectOptimisticLockingFailureException if {@code entity} has changed since
   */
  static void require(BaseEntity entity, Long read) {
    if (read == null) {
      throw new InvalidFieldException("version", "Must not be empty");
    }
    if (!entity.getVersion().equals(read)) {
      throw new ObjectOptimisticLockingFailureException(entity.getClass(), entity.getId());
    }
  }
}
