package org.jwcarman.roux.examples.dojo.persistence;

import java.util.Optional;

import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/** Audits changes as the signed-in identity's id, or {@code system} when no identity acts. */
public class IdentityAuditor implements AuditorAware<String> {

  public static final String SYSTEM = "system";

  @Override
  public Optional<String> getCurrentAuditor() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication != null && authentication.getPrincipal() instanceof WhoPrincipal principal) {
      return Optional.of(principal.identity().id().toString());
    }
    return Optional.of(SYSTEM);
  }
}
