package org.jwcarman.roux.examples.dojo.classes;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.users.UserDirectory;
import org.jwcarman.roux.users.UserDirectoryEntry;
import org.springframework.data.domain.Sort;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The school's weekly timetable: add, change and remove classes. */
@Service
@Transactional
public class ClassService {

  private static final List<String> TEACHING_ROLES = List.of("OWNER", "INSTRUCTOR");

  private static final Comparator<ClassEntity> TIMETABLE_ORDER =
      Comparator.comparing(ClassEntity::getWeekday)
          .thenComparing(ClassEntity::getStartsAt)
          .thenComparing(ClassEntity::getName);

  private final ClassRepository classes;
  private final UserDirectory directory;
  private final List<ClassRemovalCheck> removalChecks;
  private final List<ClassWeekdayChangeCheck> weekdayChecks;

  public ClassService(
      ClassRepository classes,
      UserDirectory directory,
      List<ClassRemovalCheck> removalChecks,
      List<ClassWeekdayChangeCheck> weekdayChecks) {
    this.classes = classes;
    this.directory = directory;
    this.removalChecks = removalChecks;
    this.weekdayChecks = weekdayChecks;
  }

  /** The timetable: Monday's classes first, each day's by start time. */
  @Transactional(readOnly = true)
  public List<SchoolClass> list() {
    List<ClassEntity> timetable = classes.findAll().stream().sorted(TIMETABLE_ORDER).toList();
    Map<UUID, String> names = instructorNames(timetable);
    return timetable.stream()
        .map(entity -> SchoolClass.of(entity, names.get(entity.getInstructorId())))
        .toList();
  }

  /**
   * A class.
   *
   * @throws ClassNotFoundException if there is no such class
   */
  @Transactional(readOnly = true)
  public SchoolClass get(UUID id) {
    return view(find(id));
  }

  /** The members who may teach a class, by name. */
  @Transactional(readOnly = true)
  public List<Instructor> instructors() {
    return directory.findAll(Sort.by("displayName", "id")).stream()
        .filter(member -> TEACHING_ROLES.contains(member.getRole()))
        .map(member -> new Instructor(member.getId(), member.getDisplayName()))
        .toList();
  }

  /**
   * Adds a class.
   *
   * @throws InvalidFieldException on {@code instructorId} if that member is not an owner or an
   *     instructor
   */
  public SchoolClass create(ClassRequest request) {
    requireValid(request);
    return view(classes.saveAndFlush(new ClassEntity(request)));
  }

  /**
   * Replaces a class's details, if the class is still at {@code request.version()}.
   *
   * @throws ClassNotFoundException if there is no such class
   * @throws InvalidFieldException as {@link #create}, or on {@code version} if none is given
   * @throws ObjectOptimisticLockingFailureException if the class changed since it was read
   * @throws ConflictException if the weekday changes and a {@link ClassWeekdayChangeCheck} refuses
   *     (the class has attendance)
   */
  public SchoolClass update(UUID id, ClassRequest request) {
    ClassEntity schoolClass = find(id);
    Versions.require(schoolClass, request.version());
    requireValid(request);
    if (schoolClass.getWeekday() != request.weekday()) {
      weekdayChecks.forEach(check -> check.check(schoolClass, request.weekday()));
    }
    schoolClass.change(request);
    return view(classes.saveAndFlush(schoolClass));
  }

  /**
   * Removes a class.
   *
   * @throws ClassNotFoundException if there is no such class
   * @throws ConflictException if a {@link ClassRemovalCheck} refuses (the class has attendance)
   */
  public void remove(UUID id) {
    ClassEntity schoolClass = find(id);
    removalChecks.forEach(check -> check.check(schoolClass));
    classes.delete(schoolClass);
    classes.flush();
  }

  private void requireValid(ClassRequest request) {
    UUID instructorId = request.instructorId();
    if (instructorId != null
        && directory
            .findById(instructorId)
            .filter(member -> TEACHING_ROLES.contains(member.getRole()))
            .isEmpty()) {
      throw new InvalidFieldException("instructorId", "Must be an owner or an instructor");
    }
  }

  private SchoolClass view(ClassEntity entity) {
    return SchoolClass.of(entity, instructorNames(List.of(entity)).get(entity.getInstructorId()));
  }

  private Map<UUID, String> instructorNames(List<ClassEntity> timetable) {
    List<UUID> ids =
        timetable.stream()
            .map(ClassEntity::getInstructorId)
            .filter(Objects::nonNull)
            .distinct()
            .toList();
    return directory.findAllById(ids).stream()
        .collect(Collectors.toMap(UserDirectoryEntry::getId, UserDirectoryEntry::getDisplayName));
  }

  private ClassEntity find(UUID id) {
    return classes.findById(id).orElseThrow(() -> new ClassNotFoundException(id));
  }
}
