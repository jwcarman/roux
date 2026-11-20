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

import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * What the signed-in caller may do, for a response that shows or allows more to some callers than
 * to others (a list's column only some people see, a filter or sort over it). An endpoint's own
 * permission stays {@code @RequiresPermission}; this is for the parts inside it.
 *
 * <pre>{@code
 * if (payment != null || sort == PAID_THROUGH) {
 *   caller.require(Permissions.PAYMENTS_RECORD, "Filtering or sorting by payment");
 * }
 * boolean withPayment = caller.has(Permissions.PAYMENTS_RECORD); // the rows' payment fields, or null
 * }</pre>
 */
public class CallerPermissions {

  /**
   * Whether the signed-in caller holds the permission: {@code false} when no one is signed in, or
   * the caller is not one of who's.
   *
   * @param permission the permission's name ({@code payments.record})
   * @return whether the caller holds it
   */
  public boolean has(String permission) {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null
        && authentication.getPrincipal() instanceof WhoPrincipal principal
        && principal.permissions().contains(permission);
  }

  /**
   * Refuses a caller without the permission: a {@code 403} problem ({@code 401} signed out).
   *
   * @param permission the permission's name
   * @param what what needs it, for the log ({@code Filtering by payment})
   * @throws AccessDeniedException when the caller does not hold it
   */
  public void require(String permission, String what) {
    if (!has(permission)) {
      throw new AccessDeniedException(what + " needs " + permission);
    }
  }
}
