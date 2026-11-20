package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.examples.dojo.ranks.RankEntity;
import org.jwcarman.roux.examples.dojo.ranks.RankRepository;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Promoting students, and taking a promotion back. */
@Service
@Transactional
public class PromotionService {

  private final PromotionRepository promotions;
  private final StudentRepository students;
  private final RankRepository ranks;
  private final StudentService studentService;
  private final ActivityLog activityLog;

  public PromotionService(
      PromotionRepository promotions,
      StudentRepository students,
      RankRepository ranks,
      StudentService studentService,
      ActivityLog activityLog) {
    this.promotions = promotions;
    this.students = students;
    this.ranks = ranks;
    this.studentService = studentService;
    this.activityLog = activityLog;
  }

  /**
   * Records a promotion of the student, which may be dated before earlier ones: the student's
   * current rank is that of the latest by date.
   *
   * @return the student after the promotion
   * @throws StudentNotFoundException if there is no such student
   * @throws InvalidFieldException on {@code rankId} if there is no such rank
   * @throws ConflictException if the student already has a promotion to that rank on that date
   */
  public StudentDetail promote(UUID studentId, PromotionRequest request) {
    StudentEntity student = find(studentId);
    RankEntity rank =
        ranks
            .findById(request.rankId())
            .orElseThrow(() -> new InvalidFieldException("rankId", "No such rank"));
    if (promotions.existsByStudentIdAndRankIdAndPromotedOn(
        studentId, rank.getId(), request.date())) {
      throw new ConflictException(
          "%s already holds %s from that date",
          student.getFirstName() + " " + student.getLastName(), rank.getName());
    }
    promotions.saveAndFlush(new PromotionEntity(studentId, rank, request.date()));
    activityLog.append(
        studentId, new StudentPromoted(rank.getId(), rank.getName(), request.date()), rank.getId());
    return studentService.detail(studentId);
  }

  /**
   * Takes a promotion back, so the student's current rank is recomputed from the rest.
   *
   * @return the student after the removal
   * @throws StudentNotFoundException if there is no such student
   * @throws PromotionNotFoundException if the student has no such promotion
   */
  public StudentDetail remove(UUID studentId, UUID promotionId) {
    find(studentId);
    PromotionEntity promotion =
        promotions
            .findByIdAndStudentId(promotionId, studentId)
            .orElseThrow(() -> new PromotionNotFoundException(promotionId));
    RankEntity rank = promotion.getRank();
    promotions.delete(promotion);
    promotions.flush();
    activityLog.append(
        studentId,
        new PromotionRemoved(rank.getId(), rank.getName(), promotion.getPromotedOn()),
        rank.getId());
    return studentService.detail(studentId);
  }

  private StudentEntity find(UUID studentId) {
    return students.findById(studentId).orElseThrow(() -> new StudentNotFoundException(studentId));
  }
}
