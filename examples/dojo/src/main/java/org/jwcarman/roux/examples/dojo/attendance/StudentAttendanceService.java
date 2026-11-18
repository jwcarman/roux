package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.SortDirection;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.examples.dojo.students.PromotionRepository;
import org.jwcarman.roux.examples.dojo.students.StudentNotFoundException;
import org.jwcarman.roux.examples.dojo.students.StudentRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A student's attendance: the classes they attended, and how many since their last promotion. */
@Service
@Transactional(readOnly = true)
public class StudentAttendanceService {

  /** Newest first; on one date, the latest recorded first. */
  private static final Paginator PAGES =
      Paginator.of(
          AttendanceEntity.class,
          AttendanceSort.class,
          cfg ->
              cfg.defaultSort(AttendanceSort.DATE)
                  .defaultPageSize(20)
                  .tiebreaker("createdDate", "id"));

  private final StudentRepository students;
  private final AttendanceRepository attendance;
  private final PromotionRepository promotions;

  public StudentAttendanceService(
      StudentRepository students, AttendanceRepository attendance, PromotionRepository promotions) {
    this.students = students;
    this.attendance = attendance;
    this.promotions = promotions;
  }

  /**
   * One page of the classes the student attended, newest first ({@code spec}'s page and size; its
   * sort is ignored). A deactivated student keeps their history.
   *
   * @throws StudentNotFoundException if there is no such student
   */
  public PageDto<StudentAttendance> list(UUID studentId, PageSpec spec) {
    requireStudent(studentId);
    return PAGES.paginate(
        new NewestFirst(spec),
        pageable -> attendance.findByStudentId(studentId, pageable),
        StudentAttendance::of);
  }

  /**
   * The classes the student attended after the date of their current rank's promotion (the latest
   * promotion by date): attendance on the promotion's own date counts towards the rank they held
   * going in, not the one they won. All their classes if they were never promoted.
   *
   * @throws StudentNotFoundException if there is no such student
   */
  public SincePromotion sincePromotion(UUID studentId) {
    requireStudent(studentId);
    LocalDate promotedOn = promotions.latestPromotedOn(studentId).orElse(null);
    long classes =
        promotedOn == null
            ? attendance.countByStudentId(studentId)
            : attendance.countByStudentIdAndAttendedOnAfter(studentId, promotedOn);
    return new SincePromotion(classes, promotedOn);
  }

  private void requireStudent(UUID studentId) {
    if (!students.existsById(studentId)) {
      throw new StudentNotFoundException(studentId);
    }
  }

  /** {@code spec}'s page, sorted by date, newest first. */
  private record NewestFirst(PageSpec spec) implements PageSpec {

    @Override
    public Integer pageIndex() {
      return spec.pageIndex();
    }

    @Override
    public Integer pageSize() {
      return spec.pageSize();
    }

    @Override
    public String sortBy() {
      return AttendanceSort.DATE.name();
    }

    @Override
    public SortDirection sortDirection() {
      return SortDirection.DESC;
    }
  }
}
