package org.jwcarman.roux.examples.dojo;

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
 * The whole app on a test database, with MockMvc, {@link TestMembers} and {@link TestClock}.
 *
 * <p>Test classes with the same configuration share one running app and one database, so each test
 * starts with {@link TestMembers#reset(String...)}. A class that needs other properties adds
 * {@code @TestPropertySource}; it then gets an app and a database of its own.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@SpringBootTest(properties = "app.owner-email=" + TestMembers.OWNER_EMAIL)
@AutoConfigureMockMvc
@ContextConfiguration(initializers = TestDatabase.Initializer.class)
@Import({TestMembers.class, TestClock.class})
public @interface AppTest {

  /** {@link WebEnvironment#RANDOM_PORT} for a test that needs a real port. */
  @AliasFor(annotation = SpringBootTest.class)
  WebEnvironment webEnvironment() default WebEnvironment.MOCK;
}
