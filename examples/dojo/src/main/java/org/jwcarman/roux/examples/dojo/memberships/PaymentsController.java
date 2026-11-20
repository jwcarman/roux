package org.jwcarman.roux.examples.dojo.memberships;

import java.util.List;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** {@code /api/payments}: the owner's view of money taken. */
@RestController
@RequestMapping("/api/payments")
@RequiresPermission(Permissions.PAYMENTS_READ)
public class PaymentsController {

  private final PaymentsService payments;

  public PaymentsController(PaymentsService payments) {
    this.payments = payments;
  }

  @GetMapping("/monthly")
  public List<MonthlyTotal> monthly() {
    return payments.monthly();
  }

  @GetMapping
  public PageDto<PaymentListEntry> thisMonth(@ModelAttribute PageParams params) {
    return payments.thisMonth(params);
  }
}
