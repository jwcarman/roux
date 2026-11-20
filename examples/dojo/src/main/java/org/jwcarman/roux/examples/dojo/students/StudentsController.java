package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.roux.roles.CallerPermissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The school's students: readers list them, managers add, change and deactivate them. */
@RestController
@RequestMapping("/api/students")
public class StudentsController {

  private final StudentService students;
  private final CallerPermissions caller;

  public StudentsController(StudentService students, CallerPermissions caller) {
    this.students = students;
    this.caller = caller;
  }

  @GetMapping
  @RequiresPermission(Permissions.STUDENTS_READ)
  public PageDto<Student> list(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) StudentStatus status,
      @RequestParam(required = false) UUID rankId,
      @RequestParam(required = false) PaymentState payment) {
    if (payment != null || StudentSort.PAID_THROUGH.name().equals(params.sortBy())) {
      caller.require(Permissions.PAYMENTS_RECORD, "Filtering or sorting by payment");
    }
    // The rows' plan, paid-through and payment fields, or null for a caller who may not see them.
    boolean withPayment = caller.has(Permissions.PAYMENTS_RECORD);
    return students.list(params, search, status, rankId, payment, withPayment);
  }

  @GetMapping("/{id}")
  @RequiresPermission(Permissions.STUDENTS_READ)
  public StudentDetail detail(@PathVariable UUID id) {
    return students.detail(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(Permissions.STUDENTS_MANAGE)
  public StudentDetail create(@Valid @RequestBody StudentRequest request) {
    return students.create(request);
  }

  @PutMapping("/{id}")
  @RequiresPermission(Permissions.STUDENTS_MANAGE)
  public StudentDetail update(@PathVariable UUID id, @Valid @RequestBody StudentRequest request) {
    return students.update(id, request);
  }

  @PostMapping("/{id}/deactivate")
  @RequiresPermission(Permissions.STUDENTS_MANAGE)
  public StudentDetail deactivate(@PathVariable UUID id) {
    return students.deactivate(id);
  }

  @PostMapping("/{id}/reactivate")
  @RequiresPermission(Permissions.STUDENTS_MANAGE)
  public StudentDetail reactivate(@PathVariable UUID id) {
    return students.reactivate(id);
  }
}
