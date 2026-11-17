package org.jwcarman.roux.examples.dojo.students;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** The school's students, for changing them. */
public interface StudentRepository extends JpaRepository<StudentEntity, UUID> {

  /** The students with {@code status}, in no particular order. */
  List<StudentEntity> findByStatus(StudentStatus status);
}
