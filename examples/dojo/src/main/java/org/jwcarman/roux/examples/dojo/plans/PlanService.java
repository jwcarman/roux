package org.jwcarman.roux.examples.dojo.plans;

import java.util.List;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The plans the school offers. A plan another feature uses keeps its period and is never removed.
 */
@Service
@Transactional
public class PlanService {

  static final String NAME_INDEX = "plan_name_key";

  private static final String NAME_TAKEN = "Another plan has this name";

  private final PlanRepository plans;
  private final List<PlanUsage> usages;

  public PlanService(PlanRepository plans, List<PlanUsage> usages) {
    this.plans = plans;
    this.usages = usages;
  }

  /** Every plan, by name. */
  @Transactional(readOnly = true)
  public List<Plan> list() {
    return plans.findAllByOrderByNameAsc().stream().map(this::toPlan).toList();
  }

  /** The plans offered for new memberships, by name. */
  @Transactional(readOnly = true)
  public List<Plan> active() {
    return plans.findAllByActiveTrueOrderByNameAsc().stream().map(this::toPlan).toList();
  }

  public Plan create(PlanRequest request) {
    requireUniqueName(request.name(), null);
    PlanEntity plan =
        new PlanEntity(request.name(), request.price(), request.period(), request.active());
    return toPlan(saveAndFlush(plan));
  }

  /**
   * Changes a plan.
   *
   * @throws InvalidFieldException on {@code period} if the plan is in use and it would change
   */
  public Plan update(UUID id, PlanRequest request) {
    PlanEntity plan = find(id);
    Versions.require(plan, request.version());
    requireUniqueName(request.name(), id);
    if (plan.getPeriod() != request.period() && isInUse(id)) {
      throw new InvalidFieldException("period", "A plan in use keeps its period");
    }
    plan.change(request.name(), request.price(), request.period(), request.active());
    return toPlan(saveAndFlush(plan));
  }

  /**
   * Removes a plan no membership has used.
   *
   * @throws InvariantViolationException if one has
   */
  public void remove(UUID id) {
    PlanEntity plan = find(id);
    if (isInUse(id)) {
      throw new InvariantViolationException("This plan has been used: make it inactive instead");
    }
    plans.delete(plan);
    plans.flush();
  }

  /**
   * A plan by id.
   *
   * @throws PlanNotFoundException if there is none
   */
  @Transactional(readOnly = true)
  public PlanEntity find(UUID id) {
    return plans.findById(id).orElseThrow(() -> new PlanNotFoundException(id));
  }

  private boolean isInUse(UUID id) {
    return usages.stream().anyMatch(usage -> usage.isInUse(id));
  }

  private Plan toPlan(PlanEntity plan) {
    return Plan.of(plan, isInUse(plan.getId()));
  }

  private PlanEntity saveAndFlush(PlanEntity plan) {
    try {
      return plans.saveAndFlush(plan);
    } catch (DataIntegrityViolationException e) {
      if (e.getCause() instanceof ConstraintViolationException violation
          && NAME_INDEX.equals(violation.getConstraintName())) {
        throw new InvalidFieldException("name", NAME_TAKEN);
      }
      throw e;
    }
  }

  private void requireUniqueName(String name, UUID self) {
    plans
        .findByNameIgnoreCase(name.strip())
        .filter(other -> !other.getId().equals(self))
        .ifPresent(
            other -> {
              throw new InvalidFieldException("name", NAME_TAKEN);
            });
  }
}
