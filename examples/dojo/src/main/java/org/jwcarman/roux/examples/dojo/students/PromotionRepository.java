package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** Students' promotions. */
public interface PromotionRepository extends JpaRepository<PromotionEntity, UUID> {

  /** A student's promotions, newest first: by date, then by when they were recorded. */
  List<PromotionEntity> findByStudentIdOrderByPromotedOnDescCreatedDateDesc(UUID studentId);

  /** The promotion {@code id}, if it is the student's. */
  Optional<PromotionEntity> findByIdAndStudentId(UUID id, UUID studentId);

  /** Whether the student already has a promotion to the rank on that date. */
  boolean existsByStudentIdAndRankIdAndPromotedOn(
      UUID studentId, UUID rankId, LocalDate promotedOn);

  /** The date of the student's latest promotion, if they have been promoted. */
  @Query("select max(p.promotedOn) from PromotionEntity p where p.studentId = :studentId")
  Optional<LocalDate> latestPromotedOn(UUID studentId);

  /** Whether any student was ever promoted to the rank {@code rankId}. */
  boolean existsByRankId(UUID rankId);
}
