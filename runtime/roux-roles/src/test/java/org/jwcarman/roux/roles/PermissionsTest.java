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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class PermissionsTest {

  static final class A {
    public static final String X = "a.x";
    public static final String Y = "a.y";
    private static final String HIDDEN = "a.hidden";
    public static String notFinal = "n";
    public final String inst = "i";
    public static final int NOT_A_STRING = 1;

    static String hidden() {
      return HIDDEN;
    }
  }

  static final class B {
    public static final String Y = "a.y";
    public static final String Z = "b.z";
  }

  static final class None {
    private static final String P = "p";

    static String p() {
      return P;
    }
  }

  @Test
  void listsPublicConstantsInDeclarationOrder() {
    assertThat(Permissions.allOf(A.class)).containsExactly("a.x", "a.y");
  }

  @Test
  void dropsDuplicatesAcrossClasses() {
    assertThat(Permissions.allOf(A.class, B.class)).containsExactly("a.x", "a.y", "b.z");
  }

  @Test
  void classWithNoneFails() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> Permissions.allOf(A.class, None.class))
        .withMessageContaining(None.class.getName());
  }

  @Test
  void noClassesFails() {
    assertThatIllegalArgumentException().isThrownBy(Permissions::allOf);
  }

  @Test
  void classRouxCannotReadFails() throws ClassNotFoundException {
    Class<?> hidden = Class.forName("org.jwcarman.roux.roles.hidden.HiddenPermissions");

    assertThatIllegalArgumentException()
        .isThrownBy(() -> Permissions.allOf(hidden))
        .withMessageContaining("SECRET");
  }

  @Test
  void ownerIsNamedOwner() {
    assertThat(RouxRoles.OWNER).isEqualTo("OWNER");
  }
}
