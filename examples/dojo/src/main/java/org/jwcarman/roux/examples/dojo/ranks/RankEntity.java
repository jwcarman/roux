package org.jwcarman.roux.examples.dojo.ranks;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A rank in the school's ladder; {@code position} orders the ladder from 1. */
@Entity
@Table(name = "rank")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class RankEntity extends AuditableEntity {

  /** The longest name, in characters. */
  public static final int MAX_NAME = 40;

  private String name;

  @Enumerated(EnumType.STRING)
  private BeltColour colour;

  private int position;

  /**
   * A new rank at {@code position}.
   *
   * @param name the name, already checked against {@link RankRequest}
   * @param colour the belt colour
   * @param position where it goes in the ladder, from 1
   */
  public RankEntity(String name, BeltColour colour, int position) {
    this.name = name.strip();
    this.colour = colour;
    this.position = position;
  }

  /** Renames and recolours the rank. */
  public void change(String name, BeltColour colour) {
    this.name = name.strip();
    this.colour = colour;
  }

  /** Puts the rank at {@code position}. */
  public void moveTo(int position) {
    this.position = position;
  }
}
