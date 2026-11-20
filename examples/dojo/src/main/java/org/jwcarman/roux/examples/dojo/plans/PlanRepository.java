package org.jwcarman.roux.examples.dojo.plans;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlanRepository extends JpaRepository<PlanEntity, UUID> {

  List<PlanEntity> findAllByOrderByNameAsc();

  List<PlanEntity> findAllByActiveTrueOrderByNameAsc();

  Optional<PlanEntity> findByNameIgnoreCase(String name);
}
