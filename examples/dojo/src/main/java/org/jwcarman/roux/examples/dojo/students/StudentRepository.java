package org.jwcarman.roux.examples.dojo.students;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

/** The school's students, for changing them. */
public interface StudentRepository extends JpaRepository<StudentEntity, UUID> {

  /** The students with {@code status}, in no particular order. */
  List<StudentEntity> findByStatus(StudentStatus status);

  /**
   * The student, locked until the transaction ends ({@code for update}): changes to one student's
   * memberships and payments take turns.
   */
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  @Query("select s from StudentEntity s where s.id = :id")
  Optional<StudentEntity> lockById(UUID id);
}
