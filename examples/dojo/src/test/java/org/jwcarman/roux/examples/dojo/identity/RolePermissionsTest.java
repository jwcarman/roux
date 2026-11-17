package org.jwcarman.roux.examples.dojo.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * Who may call each ranks, students and promotions endpoint: a 403 for a role without the
 * permission, anything else (a 2xx, or a 400 or 404 for the made-up ids) for a role with it.
 * Authorization comes before the controller, so no endpoint's data matters here.
 */
@AppTest
class RolePermissionsTest {

  private static final Set<AppRole> EVERYONE = EnumSet.allOf(AppRole.class);
  private static final Set<AppRole> OWNER_ONLY = EnumSet.of(AppRole.OWNER);
  private static final Set<AppRole> STAFF = EnumSet.of(AppRole.OWNER, AppRole.INSTRUCTOR);

  private static final String ID = UUID.randomUUID().toString();
  private static final String RANKS = "/api/ranks";
  private static final String STUDENTS = "/api/students";
  private static final String PROMOTIONS = STUDENTS + "/" + ID + "/promotions";
  private static final String RANK_BODY = "{\"name\":\"White\",\"colour\":\"WHITE\"}";
  private static final String STUDENT_BODY =
      "{\"firstName\":\"Ada\",\"lastName\":\"Lovelace\",\"startDate\":\"2026-01-01\"}";
  private static final String PROMOTION_BODY =
      "{\"rankId\":\"" + ID + "\",\"date\":\"2026-01-01\"}";

  /** One endpoint, and the roles that may call it. */
  record Endpoint(String name, MockHttpServletRequestBuilder request, Set<AppRole> allowed) {
    @Override
    public String toString() {
      return name;
    }
  }

  @Autowired TestMembers members;

  @BeforeEach
  void cleanSlate() {
    members.reset("promotion", "student", "rank");
  }

  static Stream<Endpoint> endpoints() {
    return Stream.of(
        new Endpoint("GET ranks", get(RANKS), EVERYONE),
        new Endpoint("POST ranks", json(post(RANKS), RANK_BODY), OWNER_ONLY),
        new Endpoint("PUT rank", json(put(RANKS + "/" + ID), RANK_BODY), OWNER_ONLY),
        new Endpoint("move a rank up", post(RANKS + "/" + ID + "/move-up"), OWNER_ONLY),
        new Endpoint("move a rank down", post(RANKS + "/" + ID + "/move-down"), OWNER_ONLY),
        new Endpoint("DELETE rank", delete(RANKS + "/" + ID), OWNER_ONLY),
        new Endpoint("GET students", get(STUDENTS), EVERYONE),
        new Endpoint("GET student", get(STUDENTS + "/" + ID), EVERYONE),
        new Endpoint("POST students", json(post(STUDENTS), STUDENT_BODY), STAFF),
        new Endpoint("PUT student", json(put(STUDENTS + "/" + ID), STUDENT_BODY), STAFF),
        new Endpoint("deactivate", post(STUDENTS + "/" + ID + "/deactivate"), STAFF),
        new Endpoint("reactivate", post(STUDENTS + "/" + ID + "/reactivate"), STAFF),
        new Endpoint("promote", json(post(PROMOTIONS), PROMOTION_BODY), STAFF),
        new Endpoint("remove a promotion", delete(PROMOTIONS + "/" + ID), STAFF));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("endpoints")
  void eachRoleMayCallWhatItHasThePermissionFor(Endpoint endpoint) throws Exception {
    for (AppRole role : AppRole.values()) {
      TestMember caller = callerWith(role);

      int status = caller.perform(endpoint.request()).andReturn().getResponse().getStatus();

      if (endpoint.allowed().contains(role)) {
        assertThat(status).as("%s as %s", endpoint.name(), role).isNotIn(401, 403);
      } else {
        assertThat(status).as("%s as %s", endpoint.name(), role).isEqualTo(403);
      }
    }
  }

  private TestMember callerWith(AppRole role) {
    if (role == AppRole.OWNER) {
      return members.owner();
    }
    String address = role.name().toLowerCase() + "@example.org";
    return members.signedIn(role.name(), address, role);
  }

  private static MockHttpServletRequestBuilder json(
      MockHttpServletRequestBuilder request, String body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(body);
  }
}
