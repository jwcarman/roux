package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** The school's students, for changing them. */
public interface StudentRepository extends JpaRepository<StudentEntity, UUID> {}
