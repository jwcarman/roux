package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;

import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A student of the school. List and read them through {@link StudentListEntry}. */
@Entity
@Table(name = "student")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class StudentEntity extends AuditableEntity {

  /** The longest first or last name, in characters. */
  public static final int MAX_NAME = 80;

  /** The longest email address, in characters. */
  public static final int MAX_EMAIL = 320;

  /** The longest phone number, in characters. */
  public static final int MAX_PHONE = 30;

  private String firstName;
  private String lastName;
  private String email;
  private String phone;
  private LocalDate birthDate;
  private LocalDate startDate;

  @Enumerated(EnumType.STRING)
  private StudentStatus status;

  /** A new, active student with the details of {@code request}. */
  public StudentEntity(StudentRequest request) {
    this.status = StudentStatus.ACTIVE;
    apply(request);
  }

  /** Replaces the student's details with those of {@code request}. */
  public void change(StudentRequest request) {
    apply(request);
  }

  private void apply(StudentRequest request) {
    this.firstName = request.firstName();
    this.lastName = request.lastName();
    this.email = request.email();
    this.phone = request.phone();
    this.birthDate = request.birthDate();
    this.startDate = request.startDate();
  }

  /** Sets whether the student trains at the school now. */
  public void setStatus(StudentStatus status) {
    this.status = status;
  }
}
