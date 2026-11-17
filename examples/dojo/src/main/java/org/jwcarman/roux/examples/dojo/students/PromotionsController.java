package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.roux.examples.dojo.identity.AppRoles;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** A student's promotions: those who manage promotions record them and take them back. */
@RestController
@RequestMapping("/api/students/{studentId}/promotions")
public class PromotionsController {

  private final PromotionService promotions;

  public PromotionsController(PromotionService promotions) {
    this.promotions = promotions;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(AppRoles.PROMOTIONS_MANAGE)
  public StudentDetail promote(
      @PathVariable UUID studentId, @Valid @RequestBody PromotionRequest request) {
    return promotions.promote(studentId, request);
  }

  @DeleteMapping("/{promotionId}")
  @RequiresPermission(AppRoles.PROMOTIONS_MANAGE)
  public StudentDetail remove(@PathVariable UUID studentId, @PathVariable UUID promotionId) {
    return promotions.remove(studentId, promotionId);
  }
}
