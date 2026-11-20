package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.activity.BusinessActivity;

/** A promotion was taken back. */
public record PromotionRemoved(UUID rankId, String rank, LocalDate on) implements BusinessActivity {

  @Override
  public String type() {
    return "promotion.removed";
  }

  @Override
  public String describe() {
    return "Promotion to " + rank + " taken back";
  }
}
