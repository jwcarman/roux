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

import org.jwcarman.roux.roles.UserJoined;
import org.jwcarman.who.core.event.SignInSucceeded;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;

/**
 * Makes the {@link AppUser} of everyone who joins, inside the transaction that creates them. It
 * runs before every other {@link UserJoined} listener, so an app's listener can save its own entity
 * that shares the user's id; a listener that throws rolls the user back with the rest.
 */
public class AppUsers {

  private final AppUserRepository users;

  /**
   * Creates the listener.
   *
   * @param users where the users are saved
   */
  public AppUsers(AppUserRepository users) {
    this.users = users;
  }

  /**
   * Saves the user who joined, with the name they joined with.
   *
   * @param joined who joined
   */
  @EventListener
  @Order(Ordered.HIGHEST_PRECEDENCE)
  public void on(UserJoined joined) {
    users.save(new AppUser(joined.identityId(), joined.name()));
  }

  /**
   * Records a user's first sign-in, which the directory's {@code invited} flag reads: who purges
   * ended and idle sessions, so "has a session" cannot tell.
   *
   * @param signedIn who's sign-in
   */
  @EventListener
  public void on(SignInSucceeded signedIn) {
    users.recordFirstSignIn(signedIn.identityId(), signedIn.occurredAt());
  }
}
