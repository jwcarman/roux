package org.jwcarman.roux.examples.dojo.memberships;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.jwcarman.roux.examples.dojo.activity.ActivityLog;
import org.jwcarman.roux.examples.dojo.members.MemberProfile;
import org.jwcarman.roux.examples.dojo.members.MemberProfileRepository;
import org.jwcarman.roux.examples.dojo.plans.PlanEntity;
import org.jwcarman.roux.examples.dojo.plans.PlanRepository;
import org.jwcarman.roux.examples.dojo.students.StudentEntity;
import org.jwcarman.roux.examples.dojo.students.StudentNotFoundException;
import org.jwcarman.roux.examples.dojo.students.StudentRepository;
import org.jwcarman.roux.examples.dojo.students.StudentStatus;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A student's memberships and the payments recorded on them. Paid through is never stored: it is
 * counted from the payments ({@link PaidThrough}). "Today" is the injected clock's date.
 */
@Service
@Transactional
public class MembershipService {

  static final String UNKNOWN = "Unknown";

  /** History entries are written in one locale; the school has no locale setting yet. */
  private static final Locale HISTORY_LOCALE = Locale.US;

  private final MembershipRepository memberships;
  private final PaymentRepository payments;
  private final PlanRepository plans;
  private final StudentRepository students;
  private final MemberProfileRepository profiles;
  private final ActivityLog activityLog;
  private final Clock clock;

  public MembershipService(
      MembershipRepository memberships,
      PaymentRepository payments,
      PlanRepository plans,
      StudentRepository students,
      MemberProfileRepository profiles,
      ActivityLog activityLog,
      Clock clock) {
    this.memberships = memberships;
    this.payments = payments;
    this.plans = plans;
    this.students = students;
    this.profiles = profiles;
    this.activityLog = activityLog;
    this.clock = clock;
  }

  /**
   * The student's current membership and the ended ones, newest first.
   *
   * @throws StudentNotFoundException if there is no such student
   */
  @Transactional(readOnly = true)
  public StudentMemberships memberships(UUID studentId) {
    StudentEntity student = student(studentId);
    List<MembershipEntity> all = memberships.findAllByStudentIdOrderByStartDateDesc(studentId);
    Map<UUID, List<PaymentEntity>> paid =
        payments
            .findAllByMembershipIdInOrderByTakenOnDescCreatedDateDesc(
                all.stream().map(MembershipEntity::getId).toList())
            .stream()
            .collect(Collectors.groupingBy(PaymentEntity::getMembershipId));
    List<MembershipView> views =
        all.stream().map(m -> view(student, m, paid.getOrDefault(m.getId(), List.of()))).toList();
    MembershipView current =
        views.stream().filter(v -> v.endDate() == null).findFirst().orElse(null);
    return new StudentMemberships(
        current, views.stream().filter(v -> v.endDate() != null).toList());
  }

  /**
   * Puts the student on a plan from a date, ending the current membership the day before.
   *
   * @throws InvalidFieldException on {@code planId} if the plan is unknown or inactive, or on
   *     {@code startDate} if it is not after the current membership's start
   */
  public MembershipView start(UUID studentId, MembershipRequest request) {
    StudentEntity student = locked(studentId);
    PlanEntity plan =
        plans
            .findById(request.planId())
            .filter(PlanEntity::isActive)
            .orElseThrow(() -> new InvalidFieldException("planId", "That plan is not offered"));
    Optional<MembershipEntity> current = memberships.findByStudentIdAndEndDateIsNull(studentId);
    current.ifPresent(
        previous -> {
          if (!request.startDate().isAfter(previous.getStartDate())) {
            throw new InvalidFieldException(
                "startDate",
                "Must be after the current membership's start (" + previous.getStartDate() + ")");
          }
          previous.end(request.startDate().minusDays(1));
          memberships.saveAndFlush(previous);
        });
    MembershipEntity membership =
        memberships.saveAndFlush(new MembershipEntity(studentId, plan, request.startDate()));
    activityLog.record(
        MembershipActivity.SUBJECT,
        studentId,
        MembershipActivity.STARTED,
        "Membership started: " + plan.getName());
    return view(student, membership, List.of());
  }

  /**
   * Records a payment on the current membership, priced at the plan's price now.
   *
   * @throws InvariantViolationException if the student has no membership
   */
  public PaymentView record(UUID studentId, PaymentRequest request) {
    locked(studentId);
    MembershipEntity membership =
        memberships
            .findByStudentIdAndEndDateIsNull(studentId)
            .orElseThrow(() -> new InvariantViolationException("Start a membership first"));
    PlanEntity plan = membership.getPlan();
    PaymentEntity payment =
        payments.saveAndFlush(
            new PaymentEntity(
                membership.getId(),
                request.periods(),
                plan.getPrice().times(request.periods()),
                request.takenOn(),
                request.method(),
                request.note()));
    activityLog.record(
        MembershipActivity.SUBJECT,
        studentId,
        MembershipActivity.PAYMENT_RECORDED,
        "Payment recorded: " + describe(payment));
    return paymentView(payment);
  }

  /**
   * Removes a payment (a mistake); paid through moves back by its periods.
   *
   * @throws PaymentNotFoundException if the student has no such payment
   */
  public void remove(UUID studentId, UUID paymentId) {
    student(studentId);
    PaymentEntity payment =
        payments.findById(paymentId).orElseThrow(() -> new PaymentNotFoundException(paymentId));
    memberships
        .findById(payment.getMembershipId())
        .filter(m -> m.getStudentId().equals(studentId))
        .orElseThrow(() -> new PaymentNotFoundException(paymentId));
    payments.delete(payment);
    payments.flush();
    activityLog.record(
        MembershipActivity.SUBJECT,
        studentId,
        MembershipActivity.PAYMENT_REMOVED,
        "Payment removed: " + describe(payment));
  }

  /**
   * The display name of whoever recorded something, from its {@code createdBy}: the member's
   * profile name, or {@value #UNKNOWN}.
   */
  String recordedBy(String createdBy) {
    return parse(createdBy)
        .flatMap(profiles::findById)
        .map(MemberProfile::getDisplayName)
        .orElse(UNKNOWN);
  }

  private MembershipView view(
      StudentEntity student, MembershipEntity membership, List<PaymentEntity> paid) {
    PlanEntity plan = membership.getPlan();
    int periods = paid.stream().mapToInt(PaymentEntity::getPeriods).sum();
    LocalDate paidThrough = PaidThrough.of(membership.getStartDate(), plan.getPeriod(), periods);
    boolean overdue =
        membership.getEndDate() == null
            && student.getStatus() == StudentStatus.ACTIVE
            && paidThrough.isBefore(LocalDate.now(clock));
    return new MembershipView(
        membership.getId(),
        new MembershipView.PlanSummary(
            plan.getId(), plan.getName(), plan.getPrice(), plan.getPeriod()),
        membership.getStartDate(),
        membership.getEndDate(),
        paidThrough,
        overdue,
        paid.stream().map(this::paymentView).toList());
  }

  private PaymentView paymentView(PaymentEntity payment) {
    return new PaymentView(
        payment.getId(),
        payment.getTakenOn(),
        payment.getPeriods(),
        payment.getAmount(),
        payment.getMethod(),
        payment.getNote(),
        recordedBy(payment.getCreatedBy()));
  }

  /** "2 × $150.00": the periods and the price each was paid at (the amount always divides). */
  private static String describe(PaymentEntity payment) {
    Money amount = payment.getAmount();
    Money each = Money.of(amount.minorUnits() / payment.getPeriods(), amount.currency());
    return payment.getPeriods() + " × " + each.format(HISTORY_LOCALE);
  }

  private static Optional<UUID> parse(String id) {
    try {
      return Optional.ofNullable(id).map(UUID::fromString);
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
  }

  private StudentEntity locked(UUID studentId) {
    return students.lockById(studentId).orElseThrow(() -> new StudentNotFoundException(studentId));
  }

  private StudentEntity student(UUID studentId) {
    return students.findById(studentId).orElseThrow(() -> new StudentNotFoundException(studentId));
  }
}
