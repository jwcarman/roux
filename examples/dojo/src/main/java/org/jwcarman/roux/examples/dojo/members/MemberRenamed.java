package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.activity.BusinessActivity;

/** A member changed their name. */
public record MemberRenamed(String from, String to) implements BusinessActivity {

  @Override
  public String type() {
    return "member.renamed";
  }

  @Override
  public String describe() {
    return "Renamed from " + from + " to " + to;
  }
}
