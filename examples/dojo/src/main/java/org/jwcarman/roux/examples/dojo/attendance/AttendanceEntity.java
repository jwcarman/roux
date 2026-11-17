package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;
import org.jwcarman.roux.examples.dojo.classes.ClassEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A student's attendance at a class on a date. A student attends a class on a date once: the
 * database holds to it ({@code attendance_class_student_day_key}).
 */
@Entity
@Table(name = "attendance")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AttendanceEntity extends AuditableEntity {

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "class_id")
  private ClassEntity schoolClass;

  private UUID studentId;

  private LocalDate attendedOn;

  /** The student {@code studentId} attended {@code schoolClass} on {@code attendedOn}. */
  public AttendanceEntity(ClassEntity schoolClass, UUID studentId, LocalDate attendedOn) {
    this.schoolClass = schoolClass;
    this.studentId = studentId;
    this.attendedOn = attendedOn;
  }
}
