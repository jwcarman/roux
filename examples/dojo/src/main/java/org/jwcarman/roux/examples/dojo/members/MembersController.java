package org.jwcarman.roux.examples.dojo.members;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.roux.examples.dojo.members.MemberService.Member;
import org.jwcarman.roux.examples.dojo.members.MemberService.MemberDetail;
import org.jwcarman.roux.examples.dojo.members.MemberService.Profile;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The team: your own profile, the directory, and each member's detail, status and history. Each
 * endpoint is gated on a permission, never on a role; your own profile is always the signed-in
 * identity's.
 */
@RestController
@RequestMapping("/api/members")
public class MembersController {

  private final MemberService members;

  public MembersController(MemberService members) {
    this.members = members;
  }

  @GetMapping("/me")
  @RequiresPermission(Permissions.MEMBERS_PROFILE)
  public Profile me(@AuthenticationPrincipal WhoPrincipal principal) {
    return members.profile(principal.identity().id());
  }

  @PutMapping("/me")
  @RequiresPermission(Permissions.MEMBERS_PROFILE)
  public Profile rename(
      @AuthenticationPrincipal WhoPrincipal principal, @Valid @RequestBody Rename request) {
    return members.rename(principal.identity().id(), request.displayName(), request.version());
  }

  @GetMapping
  @RequiresPermission(Permissions.MEMBERS_READ)
  public PageDto<Member> directory(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String role,
      @RequestParam(required = false) MemberStatus status) {
    return members.directory(params, search, role, status);
  }

  /** The directory as a CSV download, filtered and sorted like the list; not paged. */
  @GetMapping("/export.csv")
  @RequiresPermission(Permissions.MEMBERS_READ)
  public ResponseEntity<String> export(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String role,
      @RequestParam(required = false) MemberStatus status) {
    return ResponseEntity.ok()
        .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename("members.csv").build().toString())
        .body(members.exportCsv(params, search, role, status));
  }

  @GetMapping("/{id}")
  @RequiresPermission(Permissions.MEMBERS_READ)
  public MemberDetail detail(@PathVariable UUID id) {
    return members.detail(id);
  }

  @GetMapping("/{id}/activities")
  @RequiresPermission(Permissions.MEMBERS_READ)
  public PageDto<Activity> activities(@PathVariable UUID id, @ModelAttribute PageParams params) {
    return members.activities(id, params);
  }

  @PostMapping("/{id}/deactivate")
  @RequiresPermission(Permissions.MEMBERS_MANAGE)
  public MemberDetail deactivate(
      @AuthenticationPrincipal WhoPrincipal principal, @PathVariable UUID id) {
    return members.deactivate(principal.identity().id(), id);
  }

  @PostMapping("/{id}/reactivate")
  @RequiresPermission(Permissions.MEMBERS_MANAGE)
  public MemberDetail reactivate(@PathVariable UUID id) {
    return members.reactivate(id);
  }

  /**
   * A new display name for the profile at {@code version}. The name is stripped before it is
   * checked, under {@link MemberProfile}'s rule.
   */
  public record Rename(
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String displayName, @NotNull Long version) {
    public Rename {
      displayName = displayName == null ? null : displayName.strip();
    }
  }
}
