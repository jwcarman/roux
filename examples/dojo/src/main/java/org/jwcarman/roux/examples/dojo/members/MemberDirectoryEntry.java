package org.jwcarman.roux.examples.dojo.members;

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;
import org.jwcarman.jpa.entity.BaseEntity;
import org.jwcarman.jpa.search.Searchable;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A row of the team directory: the read model over the {@code member_directory} view, which joins
 * profiles to who's roles. Edit a member through {@link MemberProfile}; list them through this. Its
 * id and version are the profile's, so its id is the member's identity id.
 */
@Entity
@Immutable
@Table(name = "member_directory")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberDirectoryEntry extends BaseEntity {

  @Searchable private String displayName;
  @Searchable private String email;

  /** {@code OWNER}, {@code INSTRUCTOR} or {@code MEMBER}. */
  private String role;

  /**
   * 0 for {@code OWNER}, 1 for {@code INSTRUCTOR}, 2 for {@code MEMBER}: sorting by role puts
   * owners first.
   */
  private int roleRank;

  /** A {@link MemberStatus} name: {@code DEACTIVATED} when who will not let them sign in. */
  private String status;

  /** When the member's identity was created: invited, or bootstrapped as the owner. */
  private Instant joinedAt;
}
