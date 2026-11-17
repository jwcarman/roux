package org.jwcarman.roux.examples.dojo.attendance;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.jwcarman.roux.examples.dojo.classes.ClassEntity;
import org.jwcarman.roux.examples.dojo.classes.ClassNotFoundException;
import org.jwcarman.roux.examples.dojo.classes.ClassRepository;
import org.jwcarman.roux.examples.dojo.students.StudentEntity;
import org.jwcarman.roux.examples.dojo.students.StudentNotFoundException;
import org.jwcarman.roux.examples.dojo.students.StudentRepository;
import org.jwcarman.roux.examples.dojo.students.StudentStatus;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Check-in: who is on a class's list for a date, and marking students present or not. */
@Service
public class AttendanceService {

  /** The unique constraint on (class, student, date) (attendance.xml). */
  static final String ONCE_PER_DAY = "attendance_class_student_day_key";

  private static final Comparator<StudentEntity> BY_NAME =
      Comparator.comparing((StudentEntity s) -> s.getLastName().toLowerCase(Locale.ROOT))
          .thenComparing(s -> s.getFirstName().toLowerCase(Locale.ROOT))
          .thenComparing(StudentEntity::getId);

  private final ClassRepository classes;
  private final StudentRepository students;
  private final AttendanceRepository attendance;

  public AttendanceService(
      ClassRepository classes, StudentRepository students, AttendanceRepository attendance) {
    this.classes = classes;
    this.students = students;
    this.attendance = attendance;
  }

  /**
   * Every active student, by name, with whether they are marked present at the class on {@code
   * date}. A deactivated student is not listed, whatever they attended.
   *
   * @throws ClassNotFoundException if there is no such class
   * @throws InvalidFieldException on {@code date} if it is not a day the class runs
   */
  @Transactional(readOnly = true)
  public List<Attendee> checkIn(UUID classId, LocalDate date) {
    ClassEntity schoolClass = findClass(classId);
    requireClassDay(schoolClass, date);
    Set<UUID> present = Set.copyOf(attendance.presentStudentIds(classId, date));
    return students.findByStatus(StudentStatus.ACTIVE).stream()
        .sorted(BY_NAME)
        .map(
            student ->
                new Attendee(
                    student.getId(),
                    student.getFirstName(),
                    student.getLastName(),
                    present.contains(student.getId())))
        .toList();
  }

  /**
   * Marks a student present at the class on a date, or takes the mark back. Either is idempotent:
   * marking present twice (a double tap, two devices) leaves one mark, and taking back what is not
   * there is not an error.
   *
   * <p>Not transactional on purpose. Two requests can both find no mark and both insert; the unique
   * constraint {@value #ONCE_PER_DAY} refuses the second, which must read as "already present".
   * That refusal ends a transaction it happens in, so each repository call here is its own, and the
   * one that lost is answered like the one that won.
   *
   * @throws ClassNotFoundException if there is no such class
   * @throws StudentNotFoundException if there is no such student
   * @throws InvalidFieldException on {@code date} if it is not a day the class runs
   * @throws ConflictException if the student is marked present but is not active
   */
  public Attendee mark(UUID classId, AttendanceRequest request) {
    ClassEntity schoolClass = findClass(classId);
    requireClassDay(schoolClass, request.date());
    StudentEntity student =
        students
            .findById(request.studentId())
            .orElseThrow(() -> new StudentNotFoundException(request.studentId()));
    if (request.present()) {
      markPresent(schoolClass, student, request.date());
    } else {
      attendance.deleteMark(classId, student.getId(), request.date());
    }
    return new Attendee(
        student.getId(), student.getFirstName(), student.getLastName(), request.present());
  }

  private void markPresent(ClassEntity schoolClass, StudentEntity student, LocalDate date) {
    if (student.getStatus() != StudentStatus.ACTIVE) {
      throw new ConflictException(
          "%s is not active", student.getFirstName() + " " + student.getLastName());
    }
    if (attendance.existsBySchoolClassIdAndStudentIdAndAttendedOn(
        schoolClass.getId(), student.getId(), date)) {
      return;
    }
    try {
      attendance.saveAndFlush(new AttendanceEntity(schoolClass, student.getId(), date));
    } catch (DataIntegrityViolationException e) {
      if (!(e.getCause() instanceof ConstraintViolationException violation
          && ONCE_PER_DAY.equals(violation.getConstraintName()))) {
        throw e;
      }
    }
  }

  private static void requireClassDay(ClassEntity schoolClass, LocalDate date) {
    DayOfWeek weekday = schoolClass.getWeekday();
    if (date.getDayOfWeek() != weekday) {
      throw new InvalidFieldException(
          "date",
          "Must be a %s, when %s runs",
          weekday.getDisplayName(TextStyle.FULL, Locale.ENGLISH),
          schoolClass.getName());
    }
  }

  private ClassEntity findClass(UUID id) {
    return classes.findById(id).orElseThrow(() -> new ClassNotFoundException(id));
  }
}
