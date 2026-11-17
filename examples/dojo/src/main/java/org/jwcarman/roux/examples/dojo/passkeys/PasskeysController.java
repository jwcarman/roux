package org.jwcarman.roux.examples.dojo.passkeys;

import java.util.List;

import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.passkey.PasskeyService;
import org.jwcarman.who.passkey.PasskeySummary;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Lists the caller's own passkeys; removal is who's {@code DELETE /who/passkey/register/{id}}. */
@RestController
@RequestMapping("/api/passkeys")
public class PasskeysController {

  private final PasskeyService passkeys;

  public PasskeysController(PasskeyService passkeys) {
    this.passkeys = passkeys;
  }

  @GetMapping
  public List<PasskeySummary> list(@AuthenticationPrincipal WhoPrincipal principal) {
    return passkeys.list(principal.identity().id());
  }
}
