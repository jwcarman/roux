package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.notNullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestMember;
import org.jwcarman.roux.test.TestMembers;
import org.jwcarman.who.admin.LastAdminException;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/** A member's detail, deactivation and reactivation, and history. */
@AppTest
class MemberStatusTest {

  @Autowired JdbcTemplate jdbc;
  @Autowired WhoService who;
  @Autowired RbacService rbac;
  @Autowired ActivityLog activityLog;
  @Autowired TransactionTemplate tx;
  @Autowired MemberService memberService;
  @Autowired TestMembers members;

  private TestMember owner;
  private TestMember ada;

  @BeforeEach
  void cleanSlate() {
    members.reset("roux_activity");
    owner = members.owner();
    ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
  }

  @Test
  void detailShowsTheMember() throws Exception {
    owner
        .browser()
        .perform(get(path(ada.id())))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.id").value(ada.id().toString()))
        .andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
        .andExpect(jsonPath("$.email").value("ada@example.org"))
        .andExpect(jsonPath("$.role").value("MEMBER"))
        .andExpect(jsonPath("$.status").value("ACTIVE"))
        .andExpect(jsonPath("$.joinedAt").value(notNullValue()));
  }

  @Test
  void anUnknownMemberIs404() throws Exception {
    owner.browser().perform(get(path(UUID.randomUUID()))).andExpect(status().isNotFound());
    owner.browser().perform(get("/api/members/abc")).andExpect(status().isNotFound());
    owner
        .browser()
        .perform(get(path(UUID.randomUUID()) + "/activities"))
        .andExpect(status().isNotFound());
    owner
        .browser()
        .perform(post(path(UUID.randomUUID()) + "/deactivate"))
        .andExpect(status().isNotFound());
  }

  @Test
  void anOwnerDeactivatesAndReactivatesAMember() throws Exception {
    owner
        .browser()
        .perform(post(path(ada.id()) + "/deactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("DEACTIVATED"));
    owner
        .browser()
        .perform(get(path(ada.id())))
        .andExpect(jsonPath("$.status").value("DEACTIVATED"));

    owner
        .browser()
        .perform(post(path(ada.id()) + "/reactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACTIVE"));
  }

  @Test
  void aDeactivatedMembersNextRequestIsUnauthenticated() throws Exception {
    ada.browser().perform(get("/api/members/me")).andExpect(status().isOk());

    owner.browser().perform(post(path(ada.id()) + "/deactivate")).andExpect(status().isOk());

    ada.browser().perform(get("/api/members/me")).andExpect(status().isUnauthorized());
  }

  @Test
  void statusChangesAreRecordedNewestFirstWithTheActorsName() throws Exception {
    owner.browser().perform(post(path(ada.id()) + "/deactivate")).andExpect(status().isOk());
    owner.browser().perform(post(path(ada.id()) + "/reactivate")).andExpect(status().isOk());

    owner
        .browser()
        .perform(get(path(ada.id()) + "/activities"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].type").value("member.reactivated"))
        .andExpect(jsonPath("$.data[0].description").value("Reactivated"))
        .andExpect(jsonPath("$.data[0].actorName").value("Test Owner"))
        .andExpect(jsonPath("$.data[1].type").value("member.deactivated"))
        .andExpect(jsonPath("$.data[1].description").value("Deactivated"))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(2));
  }

  @Test
  void anEntryWithNoActorIsBySystemAndOneWhoseActorIsGoneIsUnknown() throws Exception {
    tx.executeWithoutResult(
        _ -> activityLog.append(ada.id(), new MemberRenamed("Ada", "Ada King")));
    TestMember grace = members.signedIn("Grace Hopper", "grace@example.org", RouxRoles.OWNER);
    grace.browser().perform(post(path(ada.id()) + "/deactivate")).andExpect(status().isOk());
    who.deleteIdentity(grace.id());

    owner
        .browser()
        .perform(get(path(ada.id()) + "/activities"))
        .andExpect(jsonPath("$.data[0].actorName").value("Unknown"))
        .andExpect(jsonPath("$.data[1].actorName").value("System"));
  }

  @Test
  void youCannotDeactivateYourself() throws Exception {
    owner
        .browser()
        .perform(post(path(owner.id()) + "/deactivate"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("You cannot deactivate yourself"));
  }

  @Test
  void theTeamKeepsAnActiveOwner() throws Exception {
    Role manager = rbac.createRole("MANAGER");
    rbac.addPermissionToRole(manager, Permissions.MEMBERS_MANAGE);
    TestMember max = members.signedIn("Max Manager", "max@example.org", manager);

    max.browser()
        .perform(post(path(owner.id()) + "/deactivate"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("last-admin"))
        .andExpect(
            jsonPath("$.detail").value("The team needs someone active who can manage people"));
  }

  @Test
  void anOwnerMayBeDeactivatedWhileAnotherIsActive() throws Exception {
    TestMember olga = members.signedIn("Olga Owner", "olga@example.org", RouxRoles.OWNER);

    olga.browser().perform(post(path(owner.id()) + "/deactivate")).andExpect(status().isOk());
  }

  @Test
  void twoOwnersDeactivatingEachOtherAtOnceLeaveOneActiveOwner() throws Exception {
    TestMember olga = members.signedIn("Olga Owner", "olga@example.org", RouxRoles.OWNER);
    // Each change waits, before it commits, until both have run their checks (or 2 s pass, when
    // the other is held back by the lock): the window in which both would count two owners.
    CountDownLatch bothChecked = new CountDownLatch(2);
    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      List<Future<?>> changes = new ArrayList<>();
      for (UUID[] pair : new UUID[][] {{owner.id(), olga.id()}, {olga.id(), owner.id()}}) {
        changes.add(
            pool.submit(
                () ->
                    tx.executeWithoutResult(
                        status -> {
                          memberService.deactivate(pair[0], pair[1]);
                          bothChecked.countDown();
                          try {
                            bothChecked.await(2, TimeUnit.SECONDS);
                          } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                          }
                        })));
      }
      int conflicts = 0;
      for (Future<?> change : changes) {
        try {
          change.get(10, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
          assertThat(e.getCause()).isInstanceOf(LastAdminException.class);
          conflicts++;
        }
      }
      assertThat(conflicts).isEqualTo(1);
    } finally {
      pool.shutdownNow();
    }
    assertThat(
            jdbc.queryForObject(
                "select count(*) from member_directory where role = 'OWNER' and status = 'ACTIVE'",
                Integer.class))
        .isEqualTo(1);
  }

  @Test
  void deactivatingTwiceOrReactivatingAnActiveMemberIsRefused() throws Exception {
    owner
        .browser()
        .perform(post(path(ada.id()) + "/reactivate"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("Already active"));
    owner.browser().perform(post(path(ada.id()) + "/deactivate")).andExpect(status().isOk());
    owner
        .browser()
        .perform(post(path(ada.id()) + "/deactivate"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("Already deactivated"));
  }

  @Test
  void aMemberCannotDeactivateAnyone() throws Exception {
    TestMember grace = members.signedIn("Grace Hopper", "grace@example.org", Roles.MEMBER);

    grace.browser().perform(post(path(ada.id()) + "/deactivate")).andExpect(status().isForbidden());
  }

  private static String path(UUID id) {
    return "/api/members/" + id;
  }
}
