/*
 * Copyright © 2026 James Carman
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jwcarman.roux.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.IdentityStatus;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.emaillink.Invitation;

@DisplayNameGeneration(ReplaceUnderscores.class)
class UserControllersTest {

  private static final Instant NOW = Instant.parse("2026-11-20T15:00:00Z");

  private final Users users = mock(Users.class);
  private final UUID me = UUID.randomUUID();
  private final UUID ada = UUID.randomUUID();
  private final WhoPrincipal principal =
      new WhoPrincipal(new Identity(me, IdentityStatus.ACTIVE, NOW, NOW), Set.of());
  private final UserDetail detail =
      new UserDetail(ada, "Ada", "ada@example.org", "MEMBER", "ACTIVE", NOW, false, 0);

  @Nested
  class Me_endpoints {

    private final MeController controller = new MeController(users);
    private final Me mine = new Me(me, "Me", "me@example.org", 1);

    @Test
    void reads_the_signed_in_user() {
      when(users.me(me)).thenReturn(mine);

      assertThat(controller.me(principal)).isSameAs(mine);
    }

    @Test
    void renames_the_signed_in_user() {
      when(users.renameMe(me, "New", 1L)).thenReturn(mine);

      assertThat(controller.rename(principal, new NameChange("New", 1L))).isSameAs(mine);
    }
  }

  @Nested
  class Users_endpoints {

    private final UsersController controller = new UsersController(users);
    private final PageParams params = new PageParams(0, 20, null, null);

    @Test
    void lists_with_the_filter() {
      PageDto<UserRow> page = new PageDto<>(List.of(), null);
      when(users.list(params, new UserFilter("ada", "MEMBER", UserStatus.DEACTIVATED)))
          .thenReturn(page);

      assertThat(controller.list(params, "ada", "MEMBER", UserStatus.DEACTIVATED)).isSameAs(page);
    }

    @Test
    void reads_one_and_their_history() {
      PageDto<Activity> history = new PageDto<>(List.of(), null);
      when(users.detail(ada)).thenReturn(detail);
      when(users.activities(ada, params)).thenReturn(history);

      assertThat(controller.detail(ada)).isSameAs(detail);
      assertThat(controller.activities(ada, params)).isSameAs(history);
    }

    @Test
    void invites_and_says_whether_the_link_went_out() {
      when(users.invite("Grace", "grace@example.org", "MEMBER"))
          .thenReturn(new Invitation(ada, EmailLinkOutcome.SENT));

      assertThat(controller.invite(new InvitationRequest("Grace", "grace@example.org", "MEMBER")))
          .isEqualTo(new InvitationResult(true));
    }

    @Test
    void renames_and_changes_the_role() {
      when(users.rename(ada, "Ada King", 0L)).thenReturn(detail);
      when(users.changeRole(ada, "INSTRUCTOR")).thenReturn(detail);

      assertThat(controller.rename(ada, new NameChange("Ada King", 0L))).isSameAs(detail);
      assertThat(controller.changeRole(ada, new RoleChange("INSTRUCTOR"))).isSameAs(detail);
    }

    @Test
    void deactivates_as_the_signed_in_user_and_reactivates() {
      when(users.deactivate(me, ada)).thenReturn(detail);
      when(users.reactivate(ada)).thenReturn(detail);

      assertThat(controller.deactivate(principal, ada)).isSameAs(detail);
      assertThat(controller.reactivate(ada)).isSameAs(detail);
    }

    @Test
    void signs_them_out_everywhere() {
      controller.signOutEverywhere(ada);

      verify(users).signOutEverywhere(ada);
    }
  }
}
