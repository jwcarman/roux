package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.jpa.pagination.SortPropertyProvider;

/** The directory's sorts, as the API names them, and the properties they sort by. */
public enum MemberSort implements SortPropertyProvider {
  NAME("displayName"),
  EMAIL("email"),
  ROLE("roleRank");

  private final String property;

  MemberSort(String property) {
    this.property = property;
  }

  @Override
  public String getSortProperty() {
    return property;
  }
}
