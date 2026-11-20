package org.jwcarman.roux.examples.dojo.memberships;

import java.time.Clock;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.examples.dojo.students.StudentEntity;
import org.jwcarman.roux.examples.dojo.students.StudentRepository;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.MoneySettings;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Money taken: per month for a year, and this month's payments. "Now" is the injected clock. */
@Service
@Transactional(readOnly = true)
public class PaymentsService {

  static final int MONTHS = 12;

  private static final Paginator PAGES =
      Paginator.of(
          PaymentEntity.class,
          PaymentSort.class,
          cfg -> cfg.defaultSort(PaymentSort.TAKEN_ON).defaultPageSize(25));

  private static final Sort NEWEST_FIRST =
      Sort.by(Sort.Direction.DESC, "takenOn", "createdDate", "id");

  private final PaymentRepository payments;
  private final MembershipRepository memberships;
  private final StudentRepository students;
  private final Recorders recorders;
  private final MoneySettings money;
  private final Clock clock;

  public PaymentsService(
      PaymentRepository payments,
      MembershipRepository memberships,
      StudentRepository students,
      Recorders recorders,
      MoneySettings money,
      Clock clock) {
    this.payments = payments;
    this.memberships = memberships;
    this.students = students;
    this.recorders = recorders;
    this.money = money;
    this.clock = clock;
  }

  /** The last {@value #MONTHS} months including this one, oldest first, zero where none. */
  public List<MonthlyTotal> monthly() {
    YearMonth now = YearMonth.now(clock);
    YearMonth first = now.minusMonths(MONTHS - 1L);
    Map<String, Long> sums =
        payments.sumByMonth(first.atDay(1), now.plusMonths(1).atDay(1)).stream()
            .collect(
                Collectors.toMap(
                    PaymentRepository.MonthSum::getMonth, PaymentRepository.MonthSum::getTotal));
    return IntStream.range(0, MONTHS)
        .mapToObj(i -> first.plusMonths(i).toString())
        .map(
            month ->
                new MonthlyTotal(month, Money.of(sums.getOrDefault(month, 0L), money.currency())))
        .toList();
  }

  /** This month's payments, newest first unless {@code spec} sorts otherwise. */
  public PageDto<PaymentListEntry> thisMonth(PageSpec spec) {
    YearMonth now = YearMonth.now(clock);
    LocalDate from = now.atDay(1);
    LocalDate until = now.plusMonths(1).atDay(1);
    return PAGES.paginate(
        spec,
        pageable ->
            payments.findByTakenOnGreaterThanEqualAndTakenOnLessThan(
                from, until, spec.sortDirection() == null ? newestFirst(pageable) : pageable),
        this::entry);
  }

  private PaymentListEntry entry(PaymentEntity payment) {
    MembershipEntity membership = memberships.findById(payment.getMembershipId()).orElseThrow();
    StudentEntity student = students.findById(membership.getStudentId()).orElseThrow();
    return new PaymentListEntry(
        payment.getId(),
        payment.getTakenOn(),
        student.getId(),
        student.getFirstName() + " " + student.getLastName(),
        membership.getPlan().getName(),
        payment.getPeriods(),
        payment.getAmount(),
        payment.getMethod(),
        recorders.nameOf(payment.getCreatedBy()));
  }

  private static Pageable newestFirst(Pageable pageable) {
    return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), NEWEST_FIRST);
  }
}
