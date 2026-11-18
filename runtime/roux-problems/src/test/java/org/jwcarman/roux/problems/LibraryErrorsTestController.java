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
package org.jwcarman.roux.problems;

import org.jwcarman.jpa.pagination.UnknownSortByValueException;
import org.jwcarman.who.spring.security.web.ReauthenticationRequiredException;
import org.jwcarman.who.spring.security.web.SignInFailedException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Endpoints that raise the errors of Spring Security, who and jpa-utils, for their tests. */
@RestController
@RequestMapping("/api/test/libraries")
class LibraryErrorsTestController {

  @GetMapping("/denied")
  String denied() {
    throw new AccessDeniedException("method security said no");
  }

  @GetMapping("/unauthenticated")
  String unauthenticated() {
    throw new BadCredentialsException("secret reason");
  }

  @GetMapping("/sign-in-failed")
  String signInFailed() {
    throw new SignInFailedException(new IllegalStateException("invalid_token"));
  }

  @GetMapping("/reauthenticate")
  String reauthenticate() {
    throw new ReauthenticationRequiredException();
  }

  @GetMapping("/unknown-sort")
  String unknownSort() {
    throw new UnknownSortByValueException("bogus", new String[] {"name", "email"});
  }
}
