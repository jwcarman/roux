package org.jwcarman.roux.examples.dojo.activity;

import java.time.Clock;
import java.util.UUID;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.PaginationDto;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.examples.dojo.persistence.IdentityAuditor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Sort.Order;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records changes a person would want to see ("Renamed from Ada to Ada King"). Call it from the
 * service that makes the change, inside that change's transaction: the entry commits or rolls back
 * with it, and calling it outside a transaction is a mistake it refuses.
 */
@Service
public class ActivityLog {

  private final ActivityRepository entries;
  private final IdentityAuditor auditor;
  private final Clock clock;

  public ActivityLog(ActivityRepository entries, IdentityAuditor auditor, Clock clock) {
    this.entries = entries;
    this.auditor = auditor;
    this.clock = clock;
  }

  /**
   * Records that {@code action} happened to the subject, now, by the signed-in identity (none for
   * the system).
   *
   * @param subjectType what kind of thing changed, such as {@code "member"}
   * @param subjectId the thing's id
   * @param action a code for the change, such as {@code "member.renamed"}
   * @param summary the sentence a person reads, at most 500 characters
   * @throws org.springframework.transaction.IllegalTransactionStateException outside a transaction
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void record(String subjectType, UUID subjectId, String action, String summary) {
    entries.save(
        new ActivityEntry(clock.instant(), actor(), subjectType, subjectId, action, summary));
  }

  /**
   * A subject's history, newest first, a page at a time ({@code spec}'s page and size; its sort is
   * ignored).
   */
  @Transactional(readOnly = true)
  public PageDto<Activity> history(String subjectType, UUID subjectId, PageSpec spec) {
    int pageIndex = spec.pageIndex() == null ? 0 : Math.max(0, spec.pageIndex());
    int pageSize =
        spec.pageSize() == null
            ? Paginator.DEFAULT_PAGE_SIZE
            : Math.clamp(spec.pageSize(), 1, Paginator.DEFAULT_MAX_PAGE_SIZE);
    Page<Activity> page =
        entries
            .findViews(
                subjectType,
                subjectId,
                PageRequest.of(
                    pageIndex, pageSize, Sort.by(Order.desc("occurredAt"), Order.desc("id"))))
            .map(Activity::of);
    return new PageDto<>(
        page.getContent(),
        new PaginationDto(
            page.getNumber(),
            page.getSize(),
            page.getTotalElements(),
            page.getTotalPages(),
            page.hasNext(),
            page.hasPrevious()));
  }

  private UUID actor() {
    return auditor
        .getCurrentAuditor()
        .filter(id -> !IdentityAuditor.SYSTEM.equals(id))
        .map(UUID::fromString)
        .orElse(null);
  }
}
