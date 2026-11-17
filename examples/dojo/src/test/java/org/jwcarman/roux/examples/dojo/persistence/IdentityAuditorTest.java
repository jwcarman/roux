package org.jwcarman.roux.examples.dojo.persistence;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

class IdentityAuditorTest {

  private final IdentityAuditor auditor = new IdentityAuditor();

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void signedInIdentityIsTheAuditor() {
    Identity identity = Identity.create();
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(new WhoPrincipal(identity, Set.of()), null));

    assertThat(auditor.getCurrentAuditor()).contains(identity.id().toString());
  }

  @Test
  void noIdentityIsSystem() {
    assertThat(auditor.getCurrentAuditor()).contains("system");

    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("someone", null));
    assertThat(auditor.getCurrentAuditor()).contains("system");
  }
}
