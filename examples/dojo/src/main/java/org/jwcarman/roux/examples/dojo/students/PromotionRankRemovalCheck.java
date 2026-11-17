package org.jwcarman.roux.examples.dojo.students;

import org.jwcarman.roux.examples.dojo.ranks.RankEntity;
import org.jwcarman.roux.examples.dojo.ranks.RankRemovalCheck;
import org.jwcarman.roux.problems.ConflictException;
import org.springframework.stereotype.Component;

/** A rank that any promotion refers to may not be removed. */
@Component
public class PromotionRankRemovalCheck implements RankRemovalCheck {

  private final PromotionRepository promotions;

  public PromotionRankRemovalCheck(PromotionRepository promotions) {
    this.promotions = promotions;
  }

  @Override
  public void check(RankEntity rank) {
    if (promotions.existsByRankId(rank.getId())) {
      throw new ConflictException("Students hold or have held %s", rank.getName());
    }
  }
}
