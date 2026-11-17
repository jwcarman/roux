package org.jwcarman.roux.examples.dojo.members;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** Profiles by id, which is the member's identity id. */
public interface MemberProfileRepository extends JpaRepository<MemberProfile, UUID> {}
