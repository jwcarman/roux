package org.jwcarman.roux.examples.dojo.activity;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

/** The activity log's rows. */
public interface ActivityRepository extends JpaRepository<ActivityEntry, UUID> {

  /** One subject's entries, in the order and page {@code pageable} asks for. */
  Page<ActivityEntry> findBySubjectTypeAndSubjectId(
      String subjectType, UUID subjectId, Pageable pageable);

  /**
   * One subject's entries with their actors' display names. Actors are the app's identities, whose
   * names live in member profiles; an actor with no profile (the system, or one since deleted) has
   * a null name.
   */
  @Query(
      value =
          "select new org.jwcarman.roux.examples.dojo.activity.ActivityView(a.id, a.occurredAt, a.action,"
              + " a.summary, a.actorId, p.displayName) from ActivityEntry a left join MemberProfile"
              + " p on p.id = a.actorId where a.subjectType = :subjectType and a.subjectId ="
              + " :subjectId",
      countQuery =
          "select count(a) from ActivityEntry a where a.subjectType = :subjectType and"
              + " a.subjectId = :subjectId")
  Page<ActivityView> findViews(String subjectType, UUID subjectId, Pageable pageable);
}
