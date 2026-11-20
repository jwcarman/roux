package org.jwcarman.roux.examples.dojo.memberships;

import org.jwcarman.jpa.pagination.SortPropertyProvider;

/** How the Payments page's list may sort: by date taken (newest first unless asked otherwise). */
public enum PaymentSort implements SortPropertyProvider {
  TAKEN_ON("takenOn");

  private final String property;

  PaymentSort(String property) {
    this.property = property;
  }

  @Override
  public String getSortProperty() {
    return property;
  }
}
