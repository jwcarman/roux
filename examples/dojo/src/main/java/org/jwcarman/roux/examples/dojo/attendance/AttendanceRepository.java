package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

/** Who attended which class on which day. */
public interface AttendanceRepository extends JpaRepository<AttendanceEntity, UUID> {

  /** The ids of the students marked present at the class on that date. */
  @Query(
      "select a.studentId from AttendanceEntity a"
          + " where a.schoolClass.id = :classId and a.attendedOn = :date")
  List<UUID> presentStudentIds(UUID classId, LocalDate date);

  /** Whether the student is marked present at the class on that date. */
  boolean existsBySchoolClassIdAndStudentIdAndAttendedOn(
      UUID classId, UUID studentId, LocalDate date);

  /** Whether anyone ever attended the class. */
  boolean existsBySchoolClassId(UUID classId);

  /** A page of the student's attendance, as {@code pageable} sorts it. */
  @EntityGraph(attributePaths = "schoolClass")
  Page<AttendanceEntity> findByStudentId(UUID studentId, Pageable pageable);

  /** How many classes the student attended, in all. */
  long countByStudentId(UUID studentId);

  /** How many classes the student attended on a date after {@code date}. */
  long countByStudentIdAndAttendedOnAfter(UUID studentId, LocalDate date);

  /** Takes the student's attendance back; nothing happens if there is none. */
  @Transactional
  @Modifying
  @Query(
      "delete from AttendanceEntity a where a.schoolClass.id = :classId"
          + " and a.studentId = :studentId and a.attendedOn = :date")
  int deleteMark(UUID classId, UUID studentId, LocalDate date);
}
