package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.activity.BusinessActivity;

/** A student was promoted to a rank, from {@code on}. */
public record StudentPromoted(UUID rankId, String rank, LocalDate on) implements BusinessActivity {

  @Override
  public String type() {
    return "student.promoted";
  }

  @Override
  public String describe() {
    return "Promoted to " + rank;
  }
}
