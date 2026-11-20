package org.jwcarman.roux.examples.dojo.members;

import java.util.UUID;

import org.jwcarman.jpa.spring.search.SearchableRepository;

public interface MemberDirectoryRepository
    extends SearchableRepository<MemberDirectoryEntry, UUID> {}
