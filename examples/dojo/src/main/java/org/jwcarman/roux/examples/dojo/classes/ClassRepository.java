package org.jwcarman.roux.examples.dojo.classes;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** The school's timetable. */
public interface ClassRepository extends JpaRepository<ClassEntity, UUID> {}
