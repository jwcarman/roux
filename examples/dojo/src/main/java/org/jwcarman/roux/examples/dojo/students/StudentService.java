package org.jwcarman.roux.examples.dojo.students;

import static org.jwcarman.roux.examples.dojo.students.StudentSpecifications.currentRankIs;
import static org.jwcarman.roux.examples.dojo.students.StudentSpecifications.paymentIs;
import static org.jwcarman.roux.examples.dojo.students.StudentSpecifications.statusIs;

import java.time.Clock;
import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.domain.Sort.Order;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The school's students: list, add, change, deactivate and reactivate. */
@Service
@Transactional
public class StudentService {

  /** By name unless the request sorts otherwise; the tiebreaker keeps students in place. */
  private static final Paginator PAGES =
      Paginator.of(
          StudentListEntry.class,
          StudentSort.class,
          cfg -> cfg.defaultSort(StudentSort.NAME).defaultPageSize(25));

  private final StudentRepository students;
  private final StudentListRepository list;
  private final PromotionRepository promotions;
  private final Clock clock;

  public StudentService(
      StudentRepository students,
      StudentListRepository list,
      PromotionRepository promotions,
      Clock clock) {
    this.students = students;
    this.list = list;
    this.promotions = promotions;
    this.clock = clock;
  }

  /**
   * One page of students, sorted by {@code spec}'s {@link StudentSort} or by name. A student with
   * no current rank sorts after every other by rank, whichever way.
   *
   * @param search matched against first name, last name and email, case-insensitively; blank
   *     matches everyone
   * @param status only students with this status; null for {@link StudentStatus#ACTIVE}
   * @param rankId only students whose current rank this is; null for any
   * @param payment only students in this payment state on today's date; null for any
   * @param withPayment whether rows carry the plan, paid-through and payment fields (the caller may
   *     record payments); the controller refuses {@code payment} and the paid-through sort
   *     otherwise
   */
  @Transactional(readOnly = true)
  public PageDto<Student> list(
      PageSpec spec,
      String search,
      StudentStatus status,
      UUID rankId,
      PaymentState payment,
      boolean withPayment) {
    LocalDate today = LocalDate.now(clock);
    Specification<StudentListEntry> filter =
        list.searchFor(search).and(statusIs(status == null ? StudentStatus.ACTIVE : status));
    if (rankId != null) {
      filter = filter.and(currentRankIs(rankId));
    }
    if (payment != null) {
      filter = filter.and(paymentIs(payment, today));
    }
    Specification<StudentListEntry> filtered = filter;
    return PAGES.paginate(
        spec,
        pageable -> list.findAll(filtered, nullsLast(pageable)),
        entry -> withPayment ? Student.withPayment(entry, today) : Student.of(entry));
  }

  /** Adds a student, active. */
  public StudentDetail create(StudentRequest request) {
    StudentEntity student = students.saveAndFlush(new StudentEntity(request));
    return detail(student.getId());
  }

  /**
   * Replaces a student's details, if the student is still at {@code request.version()}.
   *
   * @throws StudentNotFoundException if there is no such student
   * @throws InvalidFieldException on {@code version} if none is given
   * @throws ObjectOptimisticLockingFailureException if the student changed since it was read
   */
  public StudentDetail update(UUID id, StudentRequest request) {
    StudentEntity student = find(id);
    Versions.require(student, request.version());
    student.change(request);
    students.saveAndFlush(student);
    return detail(id);
  }

  /**
   * Marks a student inactive.
   *
   * @throws StudentNotFoundException if there is no such student
   * @throws ConflictException if the student is already inactive
   */
  public StudentDetail deactivate(UUID id) {
    return setStatus(id, StudentStatus.INACTIVE, "%s is already inactive");
  }

  /**
   * Marks a student active again.
   *
   * @throws StudentNotFoundException if there is no such student
   * @throws ConflictException if the student is already active
   */
  public StudentDetail reactivate(UUID id) {
    return setStatus(id, StudentStatus.ACTIVE, "%s is already active");
  }

  /**
   * A student as their page shows them.
   *
   * @throws StudentNotFoundException if there is no such student
   */
  @Transactional(readOnly = true)
  public StudentDetail detail(UUID id) {
    StudentListEntry entry = list.findById(id).orElseThrow(() -> new StudentNotFoundException(id));
    return StudentDetail.of(
        entry,
        promotions.findByStudentIdOrderByPromotedOnDescCreatedDateDesc(id).stream()
            .map(Promotion::of)
            .toList());
  }

  private StudentDetail setStatus(UUID id, StudentStatus status, String refusal) {
    StudentEntity student = find(id);
    if (student.getStatus() == status) {
      throw new ConflictException(refusal, student.getFirstName() + " " + student.getLastName());
    }
    student.setStatus(status);
    students.saveAndFlush(student);
    return detail(id);
  }

  private StudentEntity find(UUID id) {
    return students.findById(id).orElseThrow(() -> new StudentNotFoundException(id));
  }

  private static Pageable nullsLast(Pageable pageable) {
    Sort sort = Sort.by(pageable.getSort().stream().map(Order::nullsLast).toList());
    return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), sort);
  }
}
