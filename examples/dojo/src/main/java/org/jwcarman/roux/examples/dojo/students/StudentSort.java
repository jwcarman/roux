package org.jwcarman.roux.examples.dojo.students;

import org.jwcarman.jpa.pagination.SortPropertyProvider;

/** The student list's sorts, as the API names them (the table's column ids). */
public enum StudentSort implements SortPropertyProvider {
  NAME("nameKey"),
  START_DATE("startDate"),
  RANK("rankPosition"),
  /** Needs {@code payments.record}. */
  PAID_THROUGH("paidThrough");

  private final String property;

  StudentSort(String property) {
    this.property = property;
  }

  @Override
  public String getSortProperty() {
    return property;
  }
}
