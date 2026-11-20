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
package org.jwcarman.roux.roles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.Consumer;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.emaillink.Invitation;
import org.jwcarman.who.emaillink.InvitationService;

@DisplayNameGeneration(ReplaceUnderscores.class)
class MemberInvitationsTest {

  private final InvitationService who = mock(InvitationService.class);
  private final List<Object> happened = new ArrayList<>();
  private final MemberInvitations invitations = new MemberInvitations(who, happened::add);
  private final Identity ada = Identity.create();

  /** who's invitation: runs the callback with the new identity, inside its transaction. */
  private Invitation whoInvites(Invitation answer) {
    when(who.invite(eq(" Ada@Example.org "), eq(Set.of("MEMBER")), any()))
        .thenAnswer(
            call -> {
              Consumer<Identity> inTransaction = call.getArgument(2);
              inTransaction.accept(ada);
              return answer;
            });
    return answer;
  }

  @Test
  void publishes_member_joined_inside_the_invitation_then_the_apps_work() {
    Invitation sent = whoInvites(new Invitation(ada.id(), EmailLinkOutcome.SENT));

    Invitation invitation =
        invitations.invite(
            "Ada Lovelace", " Ada@Example.org ", "MEMBER", identity -> happened.add("app work"));

    assertThat(invitation).isSameAs(sent);
    assertThat(happened)
        .containsExactly(new MemberJoined(ada.id(), "Ada Lovelace", "ada@example.org"), "app work");
  }

  @Test
  void without_extra_work_it_only_publishes() {
    whoInvites(new Invitation(ada.id(), EmailLinkOutcome.SENT));

    invitations.invite("Ada Lovelace", " Ada@Example.org ", "MEMBER");

    assertThat(happened)
        .containsExactly(new MemberJoined(ada.id(), "Ada Lovelace", "ada@example.org"));
  }
}
