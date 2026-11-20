package org.jwcarman.roux.examples.dojo.attendance;

import java.util.UUID;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A student's attendance, for everyone who may read it. */
@RestController
@RequestMapping("/api/students/{studentId}/attendance")
public class StudentAttendanceController {

  private final StudentAttendanceService attendance;

  public StudentAttendanceController(StudentAttendanceService attendance) {
    this.attendance = attendance;
  }

  @GetMapping
  @RequiresPermission(Permissions.ATTENDANCE_READ)
  public PageDto<StudentAttendance> list(
      @PathVariable UUID studentId, @ModelAttribute PageParams params) {
    return attendance.list(studentId, params);
  }

  @GetMapping("/since-promotion")
  @RequiresPermission(Permissions.ATTENDANCE_READ)
  public SincePromotion sincePromotion(@PathVariable UUID studentId) {
    return attendance.sincePromotion(studentId);
  }
}
