package org.jwcarman.roux.examples.dojo.memberships;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface MembershipRepository extends JpaRepository<MembershipEntity, UUID> {

  Optional<MembershipEntity> findByStudentIdAndEndDateIsNull(UUID studentId);

  List<MembershipEntity> findAllByStudentIdOrderByStartDateDesc(UUID studentId);

  boolean existsByPlanId(UUID planId);
}
