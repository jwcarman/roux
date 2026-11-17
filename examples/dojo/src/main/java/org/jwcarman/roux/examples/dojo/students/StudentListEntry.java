package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;
import org.jwcarman.jpa.entity.BaseEntity;
import org.jwcarman.jpa.search.Searchable;
import org.jwcarman.roux.examples.dojo.ranks.BeltColour;
import org.jwcarman.roux.examples.dojo.ranks.Rank;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A row of the student list: the read model over the {@code student_list} view, which joins each
 * student to the rank of their latest promotion. Change a student through {@link StudentEntity};
 * list and read them through this. Its id and version are the student's.
 */
@Entity
@Immutable
@Table(name = "student_list")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StudentListEntry extends BaseEntity {

  @Searchable private String firstName;
  @Searchable private String lastName;
  @Searchable private String email;

  private String phone;
  private LocalDate birthDate;
  private LocalDate startDate;

  @Enumerated(EnumType.STRING)
  private StudentStatus status;

  /** Last name then first, lower-cased: what sorting by name sorts on. */
  private String nameKey;

  /** The current rank's id, or null for a student with no promotion. */
  private UUID rankId;

  private String rankName;

  @Enumerated(EnumType.STRING)
  private BeltColour rankColour;

  /** The current rank's place in the ladder, or null for a student with no promotion. */
  private Integer rankPosition;

  private Long rankVersion;

  /** The current rank, or null for a student with no promotion. */
  public Rank currentRank() {
    return rankId == null
        ? null
        : new Rank(rankId, rankName, rankColour, rankPosition, rankVersion);
  }
}
