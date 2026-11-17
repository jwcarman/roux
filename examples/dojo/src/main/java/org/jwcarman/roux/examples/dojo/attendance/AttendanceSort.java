package org.jwcarman.roux.examples.dojo.attendance;

import org.jwcarman.jpa.pagination.SortPropertyProvider;

/** What a student's attendance is sorted by: the date, which the list always uses. */
public enum AttendanceSort implements SortPropertyProvider {
  DATE("attendedOn");

  private final String property;

  AttendanceSort(String property) {
    this.property = property;
  }

  @Override
  public String getSortProperty() {
    return property;
  }
}
