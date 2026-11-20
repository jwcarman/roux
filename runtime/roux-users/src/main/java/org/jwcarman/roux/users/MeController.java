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

import jakarta.validation.Valid;

import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The signed-in user's own name: {@code GET /api/users/me} and {@code PUT /api/users/me}. Anyone
 * signed in may call them; their address changes through who's {@code /who/me/email-addresses}.
 */
@RestController
@RequestMapping("/api/users/me")
public class MeController {

  private final Users users;

  /**
   * Creates the controller.
   *
   * @param users the users
   */
  public MeController(Users users) {
    this.users = users;
  }

  /**
   * The signed-in user.
   *
   * @param principal who is signed in
   * @return how they see themselves
   */
  @GetMapping
  public Me me(@AuthenticationPrincipal WhoPrincipal principal) {
    return users.me(principal.identity().id());
  }

  /**
   * Renames the signed-in user.
   *
   * @param principal who is signed in
   * @param change the new name and the version read
   * @return how they see themselves now
   */
  @PutMapping
  public Me rename(
      @AuthenticationPrincipal WhoPrincipal principal, @Valid @RequestBody NameChange change) {
    return users.renameMe(principal.identity().id(), change.displayName(), change.version());
  }
}
