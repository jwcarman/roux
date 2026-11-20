package org.jwcarman.roux.examples.dojo.members;

import static org.jwcarman.roux.examples.dojo.members.MemberDirectorySpecifications.roleIs;
import static org.jwcarman.roux.examples.dojo.members.MemberDirectorySpecifications.statusIs;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.examples.dojo.activity.Activity;
import org.jwcarman.roux.examples.dojo.activity.ActivityLog;
import org.jwcarman.roux.examples.dojo.web.ExportTooLargeException;
import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.jwcarman.who.admin.LastAdminException;
import org.jwcarman.who.admin.LastAdminGuard;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

/** Team members' own profiles and the team directory. */
@Service
@Transactional
@Validated
public class MemberService {

  /**
   * The directory's paging: by name unless the request sorts otherwise. Paginator sorts by {@code
   * id} last, so members that sort equal keep their place from page to page.
   */
  private static final Paginator DIRECTORY_PAGES =
      Paginator.of(
          MemberDirectoryEntry.class, MemberSort.class, cfg -> cfg.defaultSort(MemberSort.NAME));

  /**
   * Serializes status changes, so two of them cannot both record the same change before either
   * commits. The last-owner rule is who-admin's guard, which takes its own locks.
   */
  private static final long STATUS_LOCK_KEY = 0x6e6f6972_73746174L;

  private final MemberProfileRepository profiles;
  private final MemberDirectoryRepository directory;
  private final ActivityLog activityLog;
  private final WhoService who;
  private final int maxExportRows;
  private final JdbcTemplate jdbc;
  private final RbacService rbac;
  private final LastAdminGuard lastAdmin;

  public MemberService(
      MemberProfileRepository profiles,
      MemberDirectoryRepository directory,
      ActivityLog activityLog,
      WhoService who,
      @Value("${app.export.max-rows:10000}") int maxExportRows,
      JdbcTemplate jdbc,
      RbacService rbac,
      LastAdminGuard lastAdmin) {
    this.profiles = profiles;
    this.directory = directory;
    this.activityLog = activityLog;
    this.who = who;
    this.maxExportRows = maxExportRows;
    this.jdbc = jdbc;
    this.rbac = rbac;
    this.lastAdmin = lastAdmin;
  }

  /** A member's own profile, as the API shows it. */
  public record Profile(String displayName, String email, long version) {
    static Profile of(MemberProfile profile) {
      return new Profile(profile.getDisplayName(), profile.getEmail(), profile.getVersion());
    }
  }

  /** A row of the directory, as the API shows it; {@code id} is the member's identity id. */
  public record Member(UUID id, String displayName, String email, String role, String status) {
    static Member of(MemberDirectoryEntry entry) {
      return new Member(
          entry.getId(),
          entry.getDisplayName(),
          entry.getEmail(),
          entry.getRole(),
          entry.getStatus());
    }
  }

  /**
   * Returns the member's profile.
   *
   * @throws MemberProfileNotFoundException if the member has none
   */
  @Transactional(readOnly = true)
  public Profile profile(UUID identityId) {
    return Profile.of(find(identityId));
  }

  /**
   * Renames the member, if the profile is still at {@code version}: a client renames the profile it
   * last read, so a change made elsewhere in between is not overwritten.
   *
   * @throws MemberProfileNotFoundException if the member has none
   * @throws ObjectOptimisticLockingFailureException if the profile changed since {@code version}
   * @throws IllegalArgumentException if the name breaks {@link MemberProfile}'s rule
   */
  public Profile rename(
      UUID identityId,
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String displayName,
      long version) {
    MemberProfile profile = find(identityId);
    Versions.require(profile, version);
    String before = profile.getDisplayName();
    profile.rename(displayName);
    if (!profile.getDisplayName().equals(before)) {
      activityLog.record(
          MemberActivity.SUBJECT,
          identityId,
          MemberActivity.RENAMED,
          "Renamed from " + before + " to " + profile.getDisplayName());
    }
    return Profile.of(profiles.saveAndFlush(profile));
  }

  /**
   * One page of the team directory, sorted by {@code spec}'s {@link MemberSort} or by name.
   *
   * @param search matched against name and email, case-insensitively; blank lists everyone
   * @param role only members with this role; null for any
   * @param status only members with this status; null for {@link MemberStatus#ACTIVE}
   * @throws InvalidFieldException on {@code role} if no role has that name
   */
  @Transactional(readOnly = true)
  public PageDto<Member> directory(PageSpec spec, String search, String role, MemberStatus status) {
    return DIRECTORY_PAGES.paginate(
        spec, pageable -> directory.findAll(filtered(search, role, status), pageable), Member::of);
  }

  /**
   * The whole directory as CSV, filtered and sorted as {@link #directory} would be, without paging.
   *
   * @throws ExportTooLargeException past {@code app.export.max-rows} rows (10,000 by default)
   */
  @Transactional(readOnly = true)
  public String exportCsv(PageSpec spec, String search, String role, MemberStatus status) {
    Sort sort = DIRECTORY_PAGES.pageableOf(spec).getSort();
    List<MemberDirectoryEntry> rows =
        directory
            .findAll(filtered(search, role, status), PageRequest.of(0, maxExportRows + 1, sort))
            .getContent();
    if (rows.size() > maxExportRows) {
      throw new ExportTooLargeException();
    }
    return MemberCsv.write(rows);
  }

  /** The search, narrowed by the filters: jpa-utils' searchFor composes like any Specification. */
  private Specification<MemberDirectoryEntry> filtered(
      String search, String role, MemberStatus status) {
    if (role != null && rbac.findRole(role).isEmpty()) {
      throw new InvalidFieldException("role", "No such role");
    }
    Specification<MemberDirectoryEntry> filter =
        directory.searchFor(search).and(statusIs(status == null ? MemberStatus.ACTIVE : status));
    return role == null ? filter : filter.and(roleIs(role));
  }

  /** A member as their detail page shows them. */
  public record MemberDetail(
      UUID id, String displayName, String email, String role, String status, Instant joinedAt) {
    static MemberDetail of(MemberDirectoryEntry entry) {
      return new MemberDetail(
          entry.getId(),
          entry.getDisplayName(),
          entry.getEmail(),
          entry.getRole(),
          entry.getStatus(),
          entry.getJoinedAt());
    }

    MemberDetail withStatus(String newStatus) {
      return new MemberDetail(id, displayName, email, role, newStatus, joinedAt);
    }
  }

  /**
   * Returns a member.
   *
   * @throws MemberProfileNotFoundException if there is no such member
   */
  @Transactional(readOnly = true)
  public MemberDetail detail(UUID memberId) {
    return MemberDetail.of(entry(memberId));
  }

  /**
   * Deactivates a member: who stops resolving them, so they are signed out on their next request
   * and cannot sign in, until reactivated. Recorded in the member's history.
   *
   * @param actorId the identity doing it, which may not deactivate itself
   * @throws MemberProfileNotFoundException if there is no such member
   * @throws InvariantViolationException if it is the actor, or already deactivated
   * @throws LastAdminException if it is the last active owner (no one else could manage people)
   */
  public MemberDetail deactivate(UUID actorId, UUID memberId) {
    lockStatusChanges();
    MemberDirectoryEntry member = entry(memberId);
    if (memberId.equals(actorId)) {
      throw new InvariantViolationException("You cannot deactivate yourself");
    }
    if (MemberStatus.DEACTIVATED.name().equals(member.getStatus())) {
      throw new InvariantViolationException("Already deactivated");
    }
    // who-admin's guard: only owners may manage people, so it keeps an active owner
    return lastAdmin.deactivate(
        memberId,
        () -> {
          who.deactivate(memberId);
          activityLog.record(
              MemberActivity.SUBJECT, memberId, MemberActivity.DEACTIVATED, "Deactivated");
          return MemberDetail.of(member).withStatus(MemberStatus.DEACTIVATED.name());
        });
  }

  /**
   * Reactivates a deactivated member. Recorded in the member's history.
   *
   * @throws MemberProfileNotFoundException if there is no such member
   * @throws InvariantViolationException if the member is already active
   */
  public MemberDetail reactivate(UUID memberId) {
    lockStatusChanges();
    MemberDirectoryEntry member = entry(memberId);
    if (MemberStatus.ACTIVE.name().equals(member.getStatus())) {
      throw new InvariantViolationException("Already active");
    }
    who.reactivate(memberId);
    activityLog.record(MemberActivity.SUBJECT, memberId, MemberActivity.REACTIVATED, "Reactivated");
    return MemberDetail.of(member).withStatus(MemberStatus.ACTIVE.name());
  }

  /**
   * A member's history, newest first.
   *
   * @throws MemberProfileNotFoundException if there is no such member
   */
  @Transactional(readOnly = true)
  public PageDto<Activity> activities(UUID memberId, PageSpec spec) {
    entry(memberId);
    return activityLog.history(MemberActivity.SUBJECT, memberId, spec);
  }

  /**
   * Taken before the member is read, so the checks see what the previous change committed; released
   * when the transaction ends.
   */
  private void lockStatusChanges() {
    jdbc.queryForObject("select pg_advisory_xact_lock(?)", Object.class, STATUS_LOCK_KEY);
  }

  private MemberDirectoryEntry entry(UUID memberId) {
    return directory.findById(memberId).orElseThrow(MemberProfileNotFoundException::new);
  }

  private MemberProfile find(UUID identityId) {
    return profiles.findById(identityId).orElseThrow(MemberProfileNotFoundException::new);
  }
}
