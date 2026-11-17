package org.jwcarman.roux.examples.dojo.passkeys;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Passkey rows are inserted straight into who's tables: a real registration needs a WebAuthn
 * ceremony, which the Playwright suite covers.
 */
@AppTest
class PasskeysControllerTest {

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestMembers members;
  @Autowired EmailCredentialService emailCredentials;

  @BeforeEach
  void cleanSlate() {
    members.reset("who_passkey_user");
  }

  @Test
  void listReturnsOnlyTheCallersPasskeys() throws Exception {
    TestMember alice = member("alice@example.com");
    TestMember bob = member("bob@example.com");
    addPasskey(identityIdOf("alice@example.com"), "alice-cred-1", "Alice laptop");
    addPasskey(identityIdOf("alice@example.com"), "alice-cred-2", "Alice phone");
    addPasskey(identityIdOf("bob@example.com"), "bob-cred-1", "Bob key");

    alice
        .perform(get("/api/passkeys"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(2))
        .andExpect(jsonPath("$[0].credentialId").value("alice-cred-1"))
        .andExpect(jsonPath("$[0].label").value("Alice laptop"))
        .andExpect(jsonPath("$[0].id").isNotEmpty())
        .andExpect(jsonPath("$[0].created").isNotEmpty())
        .andExpect(jsonPath("$[1].credentialId").value("alice-cred-2"));
    bob.perform(get("/api/passkeys"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].label").value("Bob key"));
  }

  @Test
  void listWithoutPasskeysIsEmpty() throws Exception {
    member("carol@example.com")
        .perform(get("/api/passkeys"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void anonymousCallerIsRejected() throws Exception {
    mvc.perform(get("/api/passkeys")).andExpect(status().is4xxClientError());
  }

  private TestMember member(String address) {
    return members.signedIn(address, address, AppRole.MEMBER);
  }

  private UUID identityIdOf(String address) {
    EmailCredential credential = emailCredentials.findByAddress(address).orElseThrow();
    return jdbc.queryForObject(
        "select identity_id from who_credential_identity where credential_id = ?",
        UUID.class,
        credential.id());
  }

  private void addPasskey(UUID identityId, String credentialId, String label) {
    String userId = "user-" + identityId;
    jdbc.update(
        "insert into who_passkey_user (id, identity_id, name, display_name) values (?, ?, ?, ?)"
            + " on conflict (id) do nothing",
        userId,
        identityId,
        userId,
        userId);
    jdbc.update(
        "insert into who_passkey_credential (credential_id, user_entity_user_id, public_key,"
            + " signature_count, uv_initialized, backup_eligible, backup_state, created, label,"
            + " credential_uuid) values (?, ?, ?, 0, true, false, false, now(), ?, ?)",
        credentialId,
        userId,
        new byte[] {1, 2, 3},
        label,
        UUID.randomUUID());
  }
}
