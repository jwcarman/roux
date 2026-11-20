package org.jwcarman.roux.examples.dojo.attendance;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.roux.validation.NotInFuture;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A class's check-in: owners and instructors see the list for a date and mark students. */
@RestController
@Validated
@RequestMapping("/api/classes/{classId}")
public class CheckInController {

  private final AttendanceService attendance;

  public CheckInController(AttendanceService attendance) {
    this.attendance = attendance;
  }

  @GetMapping("/check-in")
  @RequiresPermission(Permissions.ATTENDANCE_RECORD)
  public List<Attendee> checkIn(
      @PathVariable UUID classId, @RequestParam @NotNull @NotInFuture LocalDate date) {
    return attendance.checkIn(classId, date);
  }

  @PutMapping("/attendance")
  @RequiresPermission(Permissions.ATTENDANCE_RECORD)
  public Attendee mark(@PathVariable UUID classId, @Valid @RequestBody AttendanceRequest request) {
    return attendance.mark(classId, request);
  }
}
