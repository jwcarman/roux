package app.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.RecordingWhoEmailSender;
import org.jwcarman.roux.test.TestUsers;
import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

/**
 * This app's invitation settings: the roles `roux.roles.invitable` lets an invitation give. How
 * invitations work (the link, the profile, the history, the refusals) is roux's, tested in roux.
 */
@AppTest
@Import(InviteTest.Mail.class)
class InviteTest {

  @TestConfiguration
  static class Mail {
    @Bean
    RecordingWhoEmailSender recordingSender() {
      return new RecordingWhoEmailSender();
    }
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired TestUsers users;
  @Autowired EmailCredentialService emailCredentials;
  @Autowired RecordingWhoEmailSender mail;
  @Autowired WhoService who;
  @Autowired AppUserRepository profiles;

  @BeforeEach
  void cleanSlate() {
    users.reset();
    mail.clear();
  }

  @Test
  void anInvitationCanGiveTheUserRole() throws Exception {
    invite("Mo User", "mo@example.org", "USER").andExpect(status().isAccepted());

    UUID identityId =
        who.resolve(emailCredentials.findByAddress("mo@example.org").orElseThrow()::id)
            .orElseThrow()
            .identity()
            .id();
    assertThat(
            jdbc.queryForList(
                "select r.name from who_identity_role ir join who_role r on r.id = ir.role_id"
                    + " where ir.identity_id = ?",
                String.class,
                identityId))
        .containsExactly("USER");
  }

  @Test
  void anInvitationGivesNoOtherRole() throws Exception {
    long before = profiles.count();

    invite("Olive Again", "olive@example.org", "OWNER")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'role')].message").value("That role cannot be given"));
    invite("Nobody", "nobody@example.org", "KING")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'role')].message").value("That role cannot be given"));

    assertThat(emailCredentials.findByAddress("olive@example.org")).isEmpty();
    assertThat(profiles.count()).isEqualTo(before);
  }

  private ResultActions invite(String name, String email, String role) throws Exception {
    return users
        .owner()
        .perform(
            post("/api/users/invitations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\"}"
                        .formatted(name, email, role)));
  }
}
