package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import org.jwcarman.roux.examples.dojo.ranks.RankEntity;
import org.jwcarman.roux.examples.dojo.ranks.RankRepository;
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

  public PromotionService(
      PromotionRepository promotions,
      StudentRepository students,
      RankRepository ranks,
      StudentService studentService) {
    this.promotions = promotions;
    this.students = students;
    this.ranks = ranks;
    this.studentService = studentService;
  }

  /**
   * Records a promotion of the student, which may be dated before earlier ones: the student's
   * current rank is that of the latest by date.
   *
   * @return the student after the promotion
   * @throws StudentNotFoundException if there is no such student
   * @throws InvalidFieldException on {@code rankId} if there is no such rank
   */
  public StudentDetail promote(UUID studentId, PromotionRequest request) {
    requireStudent(studentId);
    RankEntity rank =
        ranks
            .findById(request.rankId())
            .orElseThrow(() -> new InvalidFieldException("rankId", "No such rank"));
    promotions.saveAndFlush(new PromotionEntity(studentId, rank, request.date()));
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
    requireStudent(studentId);
    PromotionEntity promotion =
        promotions
            .findByIdAndStudentId(promotionId, studentId)
            .orElseThrow(() -> new PromotionNotFoundException(promotionId));
    promotions.delete(promotion);
    promotions.flush();
    return studentService.detail(studentId);
  }

  private void requireStudent(UUID studentId) {
    if (!students.existsById(studentId)) {
      throw new StudentNotFoundException(studentId);
    }
  }
}
