package org.jwcarman.roux.examples.dojo.students;

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
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestClock;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** The students list's plan, paid-through and payment columns, its Payment filter and sort. */
@AppTest
class StudentListPaymentTest {

  private static final String STUDENTS = "/api/students";

  @Autowired TestUsers users;
  @Autowired TestClock clock;
  @Autowired PlanRepository plans;
  @Autowired StudentRepository students;

  private TestUser owner;

  @BeforeEach
  void threeStudents() throws Exception {
    users.reset();
    clock.set("2026-04-01T12:00:00Z");
    owner = users.owner();
    UUID plan =
        plans
            .save(
                new PlanEntity(
                    "Monthly",
                    Money.of(15000, Currency.getInstance("USD")),
                    PlanPeriod.MONTHLY,
                    true))
            .getId();
    UUID olive = student("Olive", "Overdue");
    start(olive, plan);
    UUID paula = student("Paula", "Paid");
    start(paula, plan);
    pay(paula);
    student("Nora", "None");
    UUID ivan = student("Ivan", "Inactive");
    start(ivan, plan);
    StudentEntity inactive = students.findById(ivan).orElseThrow();
    inactive.setStatus(StudentStatus.INACTIVE);
    students.saveAndFlush(inactive);
  }

  @Test
  void rowsShowThePlanPaidThroughAndPaymentState() throws Exception {
    list("payment", "OVERDUE")
        .andExpect(jsonPath("$.data[0].planName").value("Monthly"))
        .andExpect(jsonPath("$.data[0].paidThrough").value("2026-03-14"))
        .andExpect(jsonPath("$.data[0].payment").value("OVERDUE"));
    list("payment", "NONE")
        .andExpect(jsonPath("$.data[0].planName").doesNotExist())
        .andExpect(jsonPath("$.data[0].payment").value("NONE"));
  }

  @Test
  void aStudentPaidThroughTodayInNewYorkIsNotOverdueBeforeNewYorksMidnight() throws Exception {
    // Paula is paid through Apr 14. At 03:00 UTC on the 15th it is still the 14th in New York.
    clock.set("2026-04-15T03:00:00Z");
    owner = users.owner(); // a fresh session: the old one expired as the clock moved on
    list("payment", "PAID").andExpect(jsonPath("$.data[*].firstName", contains("Paula")));
    clock.set("2026-04-15T04:00:00Z");
    owner = users.owner();
    list("payment", "PAID").andExpect(jsonPath("$.data", hasSize(0)));
  }

  @Test
  void thePaymentFilterPicksEachState() throws Exception {
    list("payment", "OVERDUE").andExpect(jsonPath("$.data[*].firstName", contains("Olive")));
    list("payment", "PAID").andExpect(jsonPath("$.data[*].firstName", contains("Paula")));
    list("payment", "NONE").andExpect(jsonPath("$.data[*].firstName", contains("Nora")));
  }

  @Test
  void anInactiveStudentPastDueIsPaidNotOverdue() throws Exception {
    owner
        .browser()
        .perform(get(STUDENTS).param("status", "INACTIVE").param("payment", "OVERDUE"))
        .andExpect(jsonPath("$.data", hasSize(0)));
    owner
        .browser()
        .perform(get(STUDENTS).param("status", "INACTIVE").param("payment", "PAID"))
        .andExpect(jsonPath("$.data[*].firstName", contains("Ivan")))
        .andExpect(jsonPath("$.data[0].payment").value("PAID"));
  }

  @Test
  void paidThroughSortsWithNoMembershipLast() throws Exception {
    owner
        .browser()
        .perform(get(STUDENTS).param("sortBy", "PAID_THROUGH").param("sortDirection", "ASC"))
        .andExpect(jsonPath("$.data[*].firstName", contains("Olive", "Paula", "Nora")));
    owner
        .browser()
        .perform(get(STUDENTS).param("sortBy", "PAID_THROUGH").param("sortDirection", "DESC"))
        .andExpect(jsonPath("$.data[*].firstName", contains("Paula", "Olive", "Nora")));
  }

  @Test
  void aMemberSeesNoMoneyAndCannotFilterOrSortByIt() throws Exception {
    TestUser max = users.signedIn("Max", "max@example.org", Roles.MEMBER);

    max.browser()
        .perform(get(STUDENTS).param("sortBy", "NAME"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(3)))
        .andExpect(jsonPath("$.data[*].planName", contains(null, null, null)))
        .andExpect(jsonPath("$.data[*].paidThrough", contains(null, null, null)))
        .andExpect(jsonPath("$.data[*].payment", contains(null, null, null)));
    max.browser()
        .perform(get(STUDENTS).param("payment", "OVERDUE"))
        .andExpect(status().isForbidden());
    max.browser()
        .perform(get(STUDENTS).param("sortBy", "PAID_THROUGH"))
        .andExpect(status().isForbidden());
  }

  private ResultActions list(String name, String value) throws Exception {
    return owner.browser().perform(get(STUDENTS).param(name, value));
  }

  private UUID student(String first, String last) {
    return students
        .saveAndFlush(
            new StudentEntity(
                new StudentRequest(
                    first, last, null, null, null, LocalDate.parse("2026-01-01"), null)))
        .getId();
  }

  private void start(UUID student, UUID plan) throws Exception {
    owner
        .browser()
        .perform(
            post(STUDENTS + "/" + student + "/memberships")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"planId\":\"" + plan + "\",\"startDate\":\"2026-03-15\"}"))
        .andExpect(status().isCreated());
  }

  private void pay(UUID student) throws Exception {
    owner
        .browser()
        .perform(
            post(STUDENTS + "/" + student + "/payments")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"periods\":1,\"takenOn\":\"2026-04-01\",\"method\":\"CASH\"}"))
        .andExpect(status().isCreated());
  }
}
