package org.jwcarman.roux.examples.dojo.classes;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A class on the school's weekly timetable: it repeats every {@code weekday} from {@code startsAt}
 * to {@code endsAt}, wall-clock time at the school.
 */
@Entity
@Table(name = "school_class")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ClassEntity extends AuditableEntity {

  /** The longest name, in characters. */
  public static final int MAX_NAME = 60;

  private String name;

  @Enumerated(EnumType.STRING)
  private DayOfWeek weekday;

  private LocalTime startsAt;
  private LocalTime endsAt;

  /** The member who teaches it, or null; an owner or an instructor when it was saved. */
  private UUID instructorId;

  /** A new class with the details of {@code request}, already checked by {@link ClassService}. */
  public ClassEntity(ClassRequest request) {
    change(request);
  }

  /** Replaces the class's details with those of {@code request}; times are kept to the minute. */
  public void change(ClassRequest request) {
    this.name = request.name();
    this.weekday = request.weekday();
    this.startsAt = request.startsAt().truncatedTo(ChronoUnit.MINUTES);
    this.endsAt = request.endsAt().truncatedTo(ChronoUnit.MINUTES);
    this.instructorId = request.instructorId();
  }
}
