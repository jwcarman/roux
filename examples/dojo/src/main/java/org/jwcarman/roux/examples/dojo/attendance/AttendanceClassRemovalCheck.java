package org.jwcarman.roux.examples.dojo.attendance;

import org.jwcarman.roux.examples.dojo.classes.ClassEntity;
import org.jwcarman.roux.examples.dojo.classes.ClassRemovalCheck;
import org.jwcarman.roux.problems.ConflictException;
import org.springframework.stereotype.Component;

/** A class anyone attended may not be removed: the attendance would lose its class. */
@Component
public class AttendanceClassRemovalCheck implements ClassRemovalCheck {

  private final AttendanceRepository attendance;

  public AttendanceClassRemovalCheck(AttendanceRepository attendance) {
    this.attendance = attendance;
  }

  @Override
  public void check(ClassEntity schoolClass) {
    if (attendance.existsBySchoolClassId(schoolClass.getId())) {
      throw new ConflictException("Students have attended %s", schoolClass.getName());
    }
  }
}
