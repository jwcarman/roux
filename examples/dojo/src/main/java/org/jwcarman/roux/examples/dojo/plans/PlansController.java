package org.jwcarman.roux.examples.dojo.plans;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code /api/plans}: the owner keeps the plans; staff who record payments read the active ones.
 */
@RestController
@RequestMapping("/api/plans")
public class PlansController {

  private final PlanService plans;

  public PlansController(PlanService plans) {
    this.plans = plans;
  }

  @GetMapping
  @RequiresPermission(Permissions.PLANS_MANAGE)
  public List<Plan> list() {
    return plans.list();
  }

  @GetMapping("/active")
  @RequiresPermission(Permissions.PAYMENTS_RECORD)
  public List<Plan> active() {
    return plans.active();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(Permissions.PLANS_MANAGE)
  public Plan create(@Valid @RequestBody PlanRequest request) {
    return plans.create(request);
  }

  @PutMapping("/{id}")
  @RequiresPermission(Permissions.PLANS_MANAGE)
  public Plan update(@PathVariable UUID id, @Valid @RequestBody PlanRequest request) {
    return plans.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @RequiresPermission(Permissions.PLANS_MANAGE)
  public void remove(@PathVariable UUID id) {
    plans.remove(id);
  }
}
