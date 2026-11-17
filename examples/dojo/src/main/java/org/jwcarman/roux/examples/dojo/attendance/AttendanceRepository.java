package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

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

  /** Takes the student's attendance back; nothing happens if there is none. */
  @Transactional
  @Modifying
  @Query(
      "delete from AttendanceEntity a where a.schoolClass.id = :classId"
          + " and a.studentId = :studentId and a.attendedOn = :date")
  int deleteMark(UUID classId, UUID studentId, LocalDate date);
}
