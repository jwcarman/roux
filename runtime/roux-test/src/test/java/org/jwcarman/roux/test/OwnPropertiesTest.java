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
package org.jwcarman.roux.test;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.MemberJoined;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;

/** A class with properties of its own gets an app, a database and an owner of its own. */
@AppTest
@TestPropertySource(properties = "roux.owner.name=Another Owner")
@Import(TestMembersTest.Joined.class)
class OwnPropertiesTest {

  @Autowired TestMembers members;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestMembersTest.Joined joined;

  @Test
  void a_class_with_its_own_properties_gets_its_own_database_and_owner() {
    joined.events.clear();

    members.reset();

    assertThat(jdbc.queryForObject("select current_database()", String.class))
        .startsWith("app_test_");
    assertThat(joined.events).extracting(MemberJoined::name).containsExactly("Another Owner");
  }
}
