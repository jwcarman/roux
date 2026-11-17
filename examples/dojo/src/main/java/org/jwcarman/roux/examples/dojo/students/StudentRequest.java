package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.validation.NotInFuture;
import org.jwcarman.roux.validation.Phone;

/**
 * A new student, or new details for one. Text is stripped, and a blank email or phone is none.
 * {@code version} is the version being edited, and is ignored when creating. The birth date may not
 * be in the future ({@link NotInFuture}).
 *
 * @param phone digits, spaces and {@code + - ( ) .}, at least 7 digits ({@link Phone})
 */
public record StudentRequest(
    @NotBlank @Size(max = StudentEntity.MAX_NAME) String firstName,
    @NotBlank @Size(max = StudentEntity.MAX_NAME) String lastName,
    @Email @Size(max = StudentEntity.MAX_EMAIL) String email,
    @Size(max = StudentEntity.MAX_PHONE) @Phone String phone,
    @NotInFuture LocalDate birthDate,
    @NotNull LocalDate startDate,
    Long version) {

  public StudentRequest {
    firstName = strip(firstName);
    lastName = strip(lastName);
    email = blankAsNull(email);
    phone = blankAsNull(phone);
  }

  private static String strip(String value) {
    return value == null ? null : value.strip();
  }

  private static String blankAsNull(String value) {
    String stripped = strip(value);
    return stripped == null || stripped.isEmpty() ? null : stripped;
  }
}
