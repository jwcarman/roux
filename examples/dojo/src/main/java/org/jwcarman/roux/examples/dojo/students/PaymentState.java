package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;

/**
 * Where a student stands on paying: {@code OVERDUE} when active with a current membership paid
 * through a day before today, {@code PAID} with any other current membership, {@code NONE} without
 * one.
 */
public enum PaymentState {
  PAID,
  OVERDUE,
  NONE;

  /**
   * The state of a student.
   *
   * @param paidThrough the current membership's paid-through date; null when there is none
   */
  public static PaymentState of(StudentStatus status, LocalDate paidThrough, LocalDate today) {
    if (paidThrough == null) {
      return NONE;
    }
    return status == StudentStatus.ACTIVE && paidThrough.isBefore(today) ? OVERDUE : PAID;
  }
}
