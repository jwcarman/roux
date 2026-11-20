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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Set;

import org.junit.jupiter.api.Test;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.emaillink.InvalidInvitationException;
import org.jwcarman.who.emaillink.InvitationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/**
 * {@code roux.roles.invitable} as an application gets it from the starter: the invite form's list,
 * and the guard on every invitation, whichever endpoint sends it.
 */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class InvitableRolesContractTest {

  @Autowired MockMvc mvc;
  @Autowired InvitationService invitations;
  @Autowired EmailCredentialService emails;

  @Test
  void signedInGetsTheList() throws Exception {
    mvc.perform(get("/api/roles/invitable").with(user("someone")))
        .andExpect(status().isOk())
        .andExpect(content().json("[\"MEMBER\"]", true));
  }

  @Test
  void signedOutIsRefused() throws Exception {
    mvc.perform(get("/api/roles/invitable")).andExpect(status().isUnauthorized());
  }

  @Test
  void anInvitationGivingOwnerIsRolledBack() {
    assertThatThrownBy(() -> invitations.invite("x@roux.test", Set.of("OWNER")))
        .isInstanceOf(InvalidInvitationException.class)
        .hasMessageContaining("An invitation may only give [MEMBER]");

    assertThat(emails.findByAddress("x@roux.test")).isEmpty();
  }
}
