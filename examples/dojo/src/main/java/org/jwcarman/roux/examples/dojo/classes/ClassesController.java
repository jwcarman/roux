package org.jwcarman.roux.examples.dojo.classes;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.roux.examples.dojo.identity.AppRoles;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The school's timetable: everyone reads it, the owner changes it. */
@RestController
@RequestMapping("/api/classes")
public class ClassesController {

  private final ClassService classes;

  public ClassesController(ClassService classes) {
    this.classes = classes;
  }

  @GetMapping
  @RequiresPermission(AppRoles.CLASSES_READ)
  public List<SchoolClass> list() {
    return classes.list();
  }

  @GetMapping("/instructors")
  @RequiresPermission(AppRoles.CLASSES_MANAGE)
  public List<Instructor> instructors() {
    return classes.instructors();
  }

  @GetMapping("/{id}")
  @RequiresPermission(AppRoles.CLASSES_READ)
  public SchoolClass get(@PathVariable UUID id) {
    return classes.get(id);
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(AppRoles.CLASSES_MANAGE)
  public SchoolClass create(@Valid @RequestBody ClassRequest request) {
    return classes.create(request);
  }

  @PutMapping("/{id}")
  @RequiresPermission(AppRoles.CLASSES_MANAGE)
  public SchoolClass update(@PathVariable UUID id, @Valid @RequestBody ClassRequest request) {
    return classes.update(id, request);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @RequiresPermission(AppRoles.CLASSES_MANAGE)
  public void remove(@PathVariable UUID id) {
    classes.remove(id);
  }
}
