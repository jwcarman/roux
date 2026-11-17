package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import org.jwcarman.jpa.spring.search.SearchableRepository;

/** The student list, searchable over name and email. */
public interface StudentListRepository extends SearchableRepository<StudentListEntry, UUID> {}
