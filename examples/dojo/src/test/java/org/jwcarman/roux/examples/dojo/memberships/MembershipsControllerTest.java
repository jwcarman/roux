package org.jwcarman.roux.examples.dojo.memberships;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.Currency;
import java.util.List;
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
import org.jwcarman.roux.examples.dojo.students.StudentStatus;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestClock;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AppTest
class MembershipsControllerTest {

  private static final Currency USD = Currency.getInstance("USD");

  @Autowired TestUsers users;
  @Autowired TestClock clock;
  @Autowired ObjectMapper json;
  @Autowired PlanRepository plans;
  @Autowired StudentRepository students;
  @Autowired JdbcTemplate jdbc;
  @Autowired MembershipRepository membershipRepository;
  @Autowired PaymentRepository paymentRepository;

  private TestUser ivy;
  private PlanEntity monthly;
  private UUID maya;

  @BeforeEach
  void cleanSlate() {
    users.reset("payment", "membership", "plan", "student", "roux_activity");
    clock.set("2026-04-01T12:00:00Z");
    ivy = users.signedIn("Ivy Instructor", "ivy@example.org", Roles.INSTRUCTOR);
    monthly =
        plans.save(
            new PlanEntity("Monthly unlimited", Money.of(15000, USD), PlanPeriod.MONTHLY, true));
    maya = student("Maya", "Chen");
  }

  @Test
  void aNewMembershipOwesFromItsFirstDay() throws Exception {
    start(maya, monthly.getId(), "2026-03-15")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.plan.name").value("Monthly unlimited"))
        .andExpect(jsonPath("$.plan.price.minorUnits").value(15000))
        .andExpect(jsonPath("$.startDate").value("2026-03-15"))
        .andExpect(jsonPath("$.endDate").doesNotExist())
        .andExpect(jsonPath("$.paidThrough").value("2026-03-14"))
        .andExpect(jsonPath("$.overdue").value(true));
  }

  @Test
  void aPaymentMovesPaidThroughAndIsPricedByTheServer() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");

    pay(maya, 2, "2026-04-01", "CARD", "Paid at the desk")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.amount.minorUnits").value(30000))
        .andExpect(jsonPath("$.amount.currency").value("USD"))
        .andExpect(jsonPath("$.periods").value(2))
        .andExpect(jsonPath("$.method").value("CARD"))
        .andExpect(jsonPath("$.note").value("Paid at the desk"))
        .andExpect(jsonPath("$.recordedByName").value("Ivy Instructor"));

    memberships(maya)
        .andExpect(jsonPath("$.current.paidThrough").value("2026-05-14"))
        .andExpect(jsonPath("$.current.overdue").value(false))
        .andExpect(jsonPath("$.current.payments[0].amount.minorUnits").value(30000));
  }

  @Test
  void removingAPaymentMovesPaidThroughBack() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    String payment = id(pay(maya, 2, "2026-04-01", "CASH", null));

    ivy.browser()
        .perform(delete("/api/students/" + maya + "/payments/" + payment))
        .andExpect(status().isNoContent());

    memberships(maya)
        .andExpect(jsonPath("$.current.paidThrough").value("2026-03-14"))
        .andExpect(jsonPath("$.current.payments.length()").value(0));
  }

  @Test
  void aPriceChangeLeavesRecordedPaymentsAlone() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    pay(maya, 1, "2026-04-01", "CASH", null);
    monthly.change("Monthly unlimited", Money.of(20000, USD), PlanPeriod.MONTHLY, true);
    plans.saveAndFlush(monthly);

    memberships(maya).andExpect(jsonPath("$.current.payments[0].amount.minorUnits").value(15000));
    pay(maya, 1, "2026-04-01", "CASH", null)
        .andExpect(jsonPath("$.amount.minorUnits").value(20000));
  }

  @Test
  void aNewMembershipMustStartAfterTheCurrentOne() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");

    start(maya, monthly.getId(), "2026-03-15")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'startDate')].message")
                .value("Must be after the current membership's start (2026-03-15)"));
  }

  @Test
  void aNewMembershipEndsTheCurrentOneTheDayBefore() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    pay(maya, 2, "2026-04-01", "CARD", null);
    PlanEntity yearly =
        plans.save(new PlanEntity("Yearly", Money.of(150000, USD), PlanPeriod.YEARLY, true));

    start(maya, yearly.getId(), "2026-05-15").andExpect(status().isCreated());

    memberships(maya)
        .andExpect(jsonPath("$.current.plan.name").value("Yearly"))
        .andExpect(jsonPath("$.current.overdue").value(false))
        .andExpect(jsonPath("$.past[0].plan.name").value("Monthly unlimited"))
        .andExpect(jsonPath("$.past[0].endDate").value("2026-05-14"))
        .andExpect(jsonPath("$.past[0].overdue").value(false))
        .andExpect(jsonPath("$.past[0].payments.length()").value(1));
  }

  @Test
  void aPaymentNeedsAMembership() throws Exception {
    pay(maya, 1, "2026-04-01", "CASH", null)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("Start a membership first"));
  }

  @Test
  void anInactivePlanIsNotOffered() throws Exception {
    PlanEntity old =
        plans.save(new PlanEntity("Old", Money.of(100, USD), PlanPeriod.MONTHLY, false));

    start(maya, old.getId(), "2026-04-01")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'planId')].message").value("That plan is not offered"));
    start(maya, UUID.randomUUID(), "2026-04-01")
        .andExpect(
            jsonPath("$.errors[?(@.field == 'planId')].message").value("That plan is not offered"));
  }

  @Test
  void aPaymentCoversOneToTwelvePeriods() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");

    pay(maya, 13, "2026-04-01", "CASH", null)
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'periods')].message").value("Must be at most 12"));
    pay(maya, 0, "2026-04-01", "CASH", null)
        .andExpect(
            jsonPath("$.errors[?(@.field == 'periods')].message").value("Must be at least 1"));
  }

  @Test
  void anInactiveStudentIsNeverOverdue() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    StudentEntity student = students.findById(maya).orElseThrow();
    student.setStatus(StudentStatus.INACTIVE);
    students.saveAndFlush(student);

    memberships(maya).andExpect(jsonPath("$.current.overdue").value(false));
  }

  @Test
  void aFutureMembershipIsCurrentAndNotYetOverdue() throws Exception {
    start(maya, monthly.getId(), "2026-05-01")
        .andExpect(jsonPath("$.paidThrough").value("2026-04-30"))
        .andExpect(jsonPath("$.overdue").value(false));
  }

  @Test
  void aStudentWithoutAMembershipHasNone() throws Exception {
    memberships(maya)
        .andExpect(jsonPath("$.current").doesNotExist())
        .andExpect(jsonPath("$.past.length()").value(0));
  }

  @Test
  void anotherStudentsPaymentIsNotFound() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    String payment = id(pay(maya, 1, "2026-04-01", "CASH", null));
    UUID sam = student("Sam", "Lee");

    ivy.browser()
        .perform(delete("/api/students/" + sam + "/payments/" + payment))
        .andExpect(status().isNotFound());
  }

  @Test
  void anUnknownStudentIsNotFound() throws Exception {
    memberships(UUID.randomUUID()).andExpect(status().isNotFound());
  }

  @Test
  void aMemberCannotSeeOrRecordMoney() throws Exception {
    TestUser max = users.signedIn("Max", "max@example.org", Roles.MEMBER);

    max.browser()
        .perform(get("/api/students/" + maya + "/memberships"))
        .andExpect(status().isForbidden());
  }

  @Test
  void eachChangeIsInTheStudentsHistory() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    String payment = id(pay(maya, 2, "2026-04-01", "CARD", null));
    ivy.browser().perform(delete("/api/students/" + maya + "/payments/" + payment));

    List<String> summaries =
        jdbc.queryForList(
            "select description from roux_activity where anchor_id = ?"
                + " order by occurred_at, description",
            String.class,
            maya);
    assertThat(summaries)
        .containsExactlyInAnyOrder(
            "Membership started: Monthly unlimited",
            "Payment recorded: 2 × $150.00",
            "Payment removed: 2 × $150.00");
  }

  @Test
  void theStudentsHistoryIsNewestFirstWithTheFactsKept() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    clock.set("2026-04-01T12:05:00Z");
    pay(maya, 2, "2026-04-01", "CARD", null);

    ivy.browser()
        .perform(get("/api/students/" + maya + "/activities"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].type").value("payment.recorded"))
        .andExpect(jsonPath("$.data[0].description").value("Payment recorded: 2 × $150.00"))
        .andExpect(jsonPath("$.data[0].details.periods").value(2))
        .andExpect(jsonPath("$.data[0].details.amount.minorUnits").value(30000))
        .andExpect(jsonPath("$.data[0].details.takenOn").value("2026-04-01"))
        .andExpect(jsonPath("$.data[0].actorName").value("Ivy Instructor"))
        .andExpect(jsonPath("$.data[1].type").value("membership.started"))
        .andExpect(jsonPath("$.data[1].details.plan").value("Monthly unlimited"))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(2));
  }

  @Test
  void aMemberCannotSeeTheStudentsHistory() throws Exception {
    TestUser max = users.signedIn("Max", "max@example.org", Roles.MEMBER);

    max.browser()
        .perform(get("/api/students/" + maya + "/activities"))
        .andExpect(status().isForbidden());
  }

  @Test
  void paidThroughAgreesWithTheViewAtMonthEnd() throws Exception {
    start(maya, monthly.getId(), "2026-01-31");
    pay(maya, 1, "2026-04-01", "CASH", null);

    LocalDate fromView =
        jdbc.queryForObject(
            "select paid_through from membership_paid_through where student_id = ?",
            LocalDate.class,
            maya);
    assertThat(fromView)
        .isEqualTo("2026-02-27")
        .isEqualTo(PaidThrough.of(LocalDate.parse("2026-01-31"), PlanPeriod.MONTHLY, 1));
  }

  @Test
  void aUsedPlanCannotBeRemovedOrChangePeriod() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    TestUser owner = users.owner();

    owner.browser().perform(get("/api/plans")).andExpect(jsonPath("$[0].inUse").value(true));
    owner
        .browser()
        .perform(delete("/api/plans/" + monthly.getId()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("This plan has been used: make it inactive instead"));
    owner
        .browser()
        .perform(
            put("/api/plans/" + monthly.getId())
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"Monthly unlimited\",\"price\":{\"minorUnits\":15000,\"currency\":\"USD\"},"
                        + "\"period\":\"YEARLY\",\"active\":true,\"version\":0}"))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'period')].message")
                .value("A plan in use keeps its period"));
  }

  @Test
  void aPaymentNoMemberRecordedIsByUnknown() throws Exception {
    start(maya, monthly.getId(), "2026-03-15");
    UUID membership =
        membershipRepository.findByStudentIdAndEndDateIsNull(maya).orElseThrow().getId();
    paymentRepository.saveAndFlush(
        new PaymentEntity(
            membership,
            1,
            Money.of(15000, USD),
            LocalDate.parse("2026-03-15"),
            PaymentMethod.CASH,
            null));

    memberships(maya).andExpect(jsonPath("$.current.payments[0].recordedByName").value("Unknown"));
  }

  private UUID student(String first, String last) {
    return students
        .saveAndFlush(
            new StudentEntity(
                new StudentRequest(
                    first, last, null, null, null, LocalDate.parse("2026-01-01"), null)))
        .getId();
  }

  private ResultActions start(UUID student, UUID plan, String startDate) throws Exception {
    return ivy.browser()
        .perform(
            post("/api/students/" + student + "/memberships")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"planId\":\"" + plan + "\",\"startDate\":\"" + startDate + "\"}"));
  }

  private ResultActions pay(UUID student, int periods, String takenOn, String method, String note)
      throws Exception {
    return ivy.browser()
        .perform(
            post("/api/students/" + student + "/payments")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(new Payment(periods, takenOn, method, note))));
  }

  private ResultActions memberships(UUID student) throws Exception {
    return ivy.browser().perform(get("/api/students/" + student + "/memberships"));
  }

  private String id(ResultActions result) throws Exception {
    MvcResult done = result.andReturn();
    JsonNode body = json.readTree(done.getResponse().getContentAsString());
    return body.get("id").asString();
  }

  private record Payment(int periods, String takenOn, String method, String note) {}
}
