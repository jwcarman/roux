package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.ranks.Rank;

/** A promotion as the API answers it. */
public record Promotion(UUID id, Rank rank, LocalDate date) {

  /** The promotion {@code entity} holds. */
  public static Promotion of(PromotionEntity entity) {
    return new Promotion(entity.getId(), Rank.of(entity.getRank()), entity.getPromotedOn());
  }
}
