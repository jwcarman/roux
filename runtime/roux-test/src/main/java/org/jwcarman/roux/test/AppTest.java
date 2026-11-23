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

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.core.annotation.AliasFor;
import org.springframework.test.context.ContextConfiguration;

/**
 * The whole app on a test database, with MockMvc, {@link TestUsers} and {@link TestClock}.
 *
 * <p>Test classes with the same configuration share one running app and one database, so each test
 * starts with {@link TestUsers#reset()}. A class that needs other properties adds
 * {@code @TestPropertySource}; it then gets an app and a database of its own.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest(properties = "roux.owner.email=" + TestUsers.OWNER_EMAIL)
@AutoConfigureMockMvc
@ContextConfiguration(initializers = TestDatabase.Initializer.class)
@Import({TestUsers.class, TestClock.class})
public @interface AppTest {

  /** {@link WebEnvironment#RANDOM_PORT} for a test that needs a real port. */
  @AliasFor(annotation = SpringBootTest.class)
  WebEnvironment webEnvironment() default WebEnvironment.MOCK;
}
