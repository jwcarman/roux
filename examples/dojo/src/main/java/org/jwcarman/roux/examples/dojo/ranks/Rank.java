package org.jwcarman.roux.examples.dojo.ranks;

import java.util.UUID;

/** A rank as the API answers it. */
public record Rank(UUID id, String name, BeltColour colour, int position, long version) {

  /** The rank {@code entity} holds. */
  public static Rank of(RankEntity entity) {
    return new Rank(
        entity.getId(),
        entity.getName(),
        entity.getColour(),
        entity.getPosition(),
        entity.getVersion());
  }
}
