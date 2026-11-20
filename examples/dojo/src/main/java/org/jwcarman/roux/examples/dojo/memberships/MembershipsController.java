package org.jwcarman.roux.examples.dojo.memberships;

import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** A student's memberships and payments, for staff who record payments. */
@RestController
@RequestMapping("/api/students/{studentId}")
@RequiresPermission(Permissions.PAYMENTS_RECORD)
public class MembershipsController {

  private final MembershipService memberships;

  public MembershipsController(MembershipService memberships) {
    this.memberships = memberships;
  }

  @GetMapping("/memberships")
  public StudentMemberships memberships(@PathVariable UUID studentId) {
    return memberships.memberships(studentId);
  }

  @PostMapping("/memberships")
  @ResponseStatus(HttpStatus.CREATED)
  public MembershipView start(
      @PathVariable UUID studentId, @Valid @RequestBody MembershipRequest request) {
    return memberships.start(studentId, request);
  }

  @PostMapping("/payments")
  @ResponseStatus(HttpStatus.CREATED)
  public PaymentView record(
      @PathVariable UUID studentId, @Valid @RequestBody PaymentRequest request) {
    return memberships.record(studentId, request);
  }

  @DeleteMapping("/payments/{paymentId}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void remove(@PathVariable UUID studentId, @PathVariable UUID paymentId) {
    memberships.remove(studentId, paymentId);
  }
}
