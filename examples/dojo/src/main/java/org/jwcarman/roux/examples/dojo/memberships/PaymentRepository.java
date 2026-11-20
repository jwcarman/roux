package org.jwcarman.roux.examples.dojo.memberships;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PaymentRepository extends JpaRepository<PaymentEntity, UUID> {

  List<PaymentEntity> findAllByMembershipIdInOrderByTakenOnDescCreatedDateDesc(
      Collection<UUID> membershipIds);

  @Query(
      "select coalesce(sum(p.periods), 0) from PaymentEntity p where p.membershipId = :membershipId")
  int sumPeriods(UUID membershipId);
}
