package org.jwcarman.roux.examples.dojo.members;

import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A team member's profile: one per identity holding a team role, created with that identity. Its id
 * is the identity's id.
 */
@Entity
@Table(name = "member_profile")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MemberProfile extends AuditableEntity {

  /** The longest display name, in characters. */
  public static final int MAX_NAME = 80;

  private String displayName;
  private String email;

  /**
   * Creates the profile of a new team member.
   *
   * @param identityId the member's who identity, which becomes the profile's id
   * @param displayName the name to show; stripped, not blank, at most {@value #MAX_NAME} characters
   * @param email the member's address as who stored it
   * @throws IllegalArgumentException if the name breaks the rule
   */
  public MemberProfile(UUID identityId, String displayName, String email) {
    super(identityId);
    this.displayName = checkedName(displayName);
    this.email = email;
  }

  /**
   * Changes the display name.
   *
   * @param displayName the new name, under the same rule as the constructor's
   * @throws IllegalArgumentException if the name breaks the rule
   */
  public void rename(String displayName) {
    this.displayName = checkedName(displayName);
  }

  private static String checkedName(String name) {
    String stripped = name == null ? "" : name.strip();
    if (stripped.isEmpty() || stripped.length() > MAX_NAME) {
      throw new IllegalArgumentException(
          "A display name must be 1 to " + MAX_NAME + " characters after stripping");
    }
    return stripped;
  }
}
