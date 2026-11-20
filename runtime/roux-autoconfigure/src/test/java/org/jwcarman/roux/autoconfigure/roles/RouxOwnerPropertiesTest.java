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
package org.jwcarman.roux.autoconfigure.roles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import org.junit.jupiter.api.Test;

class RouxOwnerPropertiesTest {

  @Test
  void a_missing_email_names_the_setting() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new RouxOwnerProperties(null, "Pat"))
        .withMessage("roux.owner.email must be set to the first owner's address");
  }

  @Test
  void a_blank_email_names_the_setting() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new RouxOwnerProperties("  ", "Pat"))
        .withMessage("roux.owner.email must be set to the first owner's address");
  }

  @Test
  void a_missing_name_names_the_setting() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new RouxOwnerProperties("pat@example.com", null))
        .withMessage("roux.owner.name must be set to the first owner's name");
  }

  @Test
  void a_blank_name_names_the_setting() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new RouxOwnerProperties("pat@example.com", " "))
        .withMessage("roux.owner.name must be set to the first owner's name");
  }

  @Test
  void the_name_is_stripped() {
    assertThat(new RouxOwnerProperties("pat@example.com", "  Pat  ").name()).isEqualTo("Pat");
  }
}
