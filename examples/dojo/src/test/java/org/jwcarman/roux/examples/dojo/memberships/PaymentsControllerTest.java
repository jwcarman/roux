package org.jwcarman.roux.examples.dojo.memberships;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Currency;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.examples.dojo.plans.PlanEntity;
import org.jwcarman.roux.examples.dojo.plans.PlanPeriod;
import org.jwcarman.roux.examples.dojo.plans.PlanRepository;
import org.jwcarman.roux.examples.dojo.students.StudentEntity;
import org.jwcarman.roux.examples.dojo.students.StudentRepository;
import org.jwcarman.roux.examples.dojo.students.StudentRequest;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestClock;
import org.jwcarman.roux.test.TestMember;
import org.jwcarman.roux.test.TestMembers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

@AppTest
class PaymentsControllerTest {

  @Autowired TestMembers members;
  @Autowired TestClock clock;
  @Autowired PlanRepository plans;
  @Autowired StudentRepository students;

  private TestMember owner;

  private UUID maya;

  @BeforeEach
  void paymentsOverAYear() throws Exception {
    members.reset("payment", "membership", "plan", "student");
    clock.set("2026-04-15T12:00:00Z");
    owner = members.owner();
    UUID plan =
        plans
            .save(
                new PlanEntity(
                    "Monthly",
                    Money.of(15000, Currency.getInstance("USD")),
                    PlanPeriod.MONTHLY,
                    true))
            .getId();
    maya =
        students
            .saveAndFlush(
                new StudentEntity(
                    new StudentRequest(
                        "Maya", "Chen", null, null, null, LocalDate.parse("2025-01-01"), null)))
            .getId();
    send(
        "/api/students/" + maya + "/memberships",
        "{\"planId\":\"" + plan + "\",\"startDate\":\"2025-04-01\"}");
    pay(maya, 1, "2025-04-30");
    pay(maya, 2, "2026-02-03");
    pay(maya, 1, "2026-04-01");
    pay(maya, 1, "2026-04-10");
  }

  @Test
  void monthlyTotalsCoverTwelveMonthsEndingNow() throws Exception {
    owner
        .browser()
        .perform(get("/api/payments/monthly"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(12)))
        .andExpect(jsonPath("$[0].month").value("2025-05"))
        .andExpect(jsonPath("$[0].total.minorUnits").value(0))
        .andExpect(jsonPath("$[9].month").value("2026-02"))
        .andExpect(jsonPath("$[9].total.minorUnits").value(30000))
        .andExpect(jsonPath("$[10].month").value("2026-03"))
        .andExpect(jsonPath("$[10].total.minorUnits").value(0))
        .andExpect(jsonPath("$[11].month").value("2026-04"))
        .andExpect(jsonPath("$[11].total.minorUnits").value(30000))
        .andExpect(jsonPath("$[11].total.currency").value("USD"));
  }

  @Test
  void thisMonthsPaymentsAreListedNewestFirst() throws Exception {
    owner
        .browser()
        .perform(get("/api/payments"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].takenOn", contains("2026-04-10", "2026-04-01")))
        .andExpect(jsonPath("$.data[0].studentName").value("Maya Chen"))
        .andExpect(jsonPath("$.data[0].studentId").isNotEmpty())
        .andExpect(jsonPath("$.data[0].planName").value("Monthly"))
        .andExpect(jsonPath("$.data[0].periods").value(1))
        .andExpect(jsonPath("$.data[0].amount.minorUnits").value(15000))
        .andExpect(jsonPath("$.data[0].method").value("CASH"))
        .andExpect(jsonPath("$.data[0].recordedByName").isNotEmpty());
  }

  @Test
  void thisMonthIsNewYorksMonthAtUtcsMonthStart() throws Exception {
    // 03:00 UTC on May 1 is still April 30 in New York.
    clock.set("2026-05-01T03:00:00Z");
    owner = members.owner(); // a fresh session: the old one expired as the clock moved on
    pay(maya, 1, "2026-04-30");

    owner
        .browser()
        .perform(get("/api/payments"))
        .andExpect(
            jsonPath("$.data[*].takenOn", contains("2026-04-30", "2026-04-10", "2026-04-01")));
    owner
        .browser()
        .perform(get("/api/payments/monthly"))
        .andExpect(jsonPath("$[11].month").value("2026-04"))
        .andExpect(jsonPath("$[11].total.minorUnits").value(45000));
  }

  @Test
  void anInstructorCannotSeeMoneyTaken() throws Exception {
    TestMember ivy = members.signedIn("Ivy", "ivy@example.org", Roles.INSTRUCTOR);

    ivy.browser().perform(get("/api/payments/monthly")).andExpect(status().isForbidden());
    ivy.browser().perform(get("/api/payments")).andExpect(status().isForbidden());
  }

  private void pay(UUID student, int periods, String takenOn) throws Exception {
    send(
        "/api/students/" + student + "/payments",
        "{\"periods\":" + periods + ",\"takenOn\":\"" + takenOn + "\",\"method\":\"CASH\"}");
  }

  private void send(String path, String body) throws Exception {
    owner
        .browser()
        .perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body))
        .andExpect(status().isCreated());
  }
}
