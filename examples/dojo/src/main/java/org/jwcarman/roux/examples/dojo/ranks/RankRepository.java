package org.jwcarman.roux.examples.dojo.ranks;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** The school's ranks. */
public interface RankRepository extends JpaRepository<RankEntity, UUID> {

  /** The ladder, lowest first. */
  List<RankEntity> findAllByOrderByPositionAsc();

  /** The rank named {@code name}, ignoring case. */
  Optional<RankEntity> findByNameIgnoreCase(String name);

  /** The highest position in use, or 0 for no ranks. */
  @Query("select coalesce(max(r.position), 0) from RankEntity r")
  int maxPosition();
}
