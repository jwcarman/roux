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

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/roles/invitable}: the roles an invite form offers, in the order configured, for
 * anyone signed in. Roles are data, so the form asks rather than listing them itself.
 */
@RestController
@RequestMapping(InvitableRolesController.PATH)
public class InvitableRolesController {

  /** Where the list is served. */
  public static final String PATH = "/api/roles/invitable";

  private final InvitableRoles invitable;

  /**
   * Creates the controller.
   *
   * @param invitable the roles an invitation may give
   */
  public InvitableRolesController(InvitableRoles invitable) {
    this.invitable = invitable;
  }

  /** {@return the roles an invitation may give, in the order configured} */
  @GetMapping
  public List<String> invitable() {
    return invitable.names();
  }
}
