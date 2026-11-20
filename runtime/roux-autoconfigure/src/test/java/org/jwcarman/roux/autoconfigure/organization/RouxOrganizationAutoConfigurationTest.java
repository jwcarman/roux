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
package org.jwcarman.roux.autoconfigure.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Locale;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.autoconfigure.money.RouxMoneyAutoConfiguration;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.jwcarman.roux.organization.OrganizationContext;
import org.jwcarman.roux.organization.OrganizationContextSource;
import org.jwcarman.roux.organization.OrganizationController;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxOrganizationAutoConfigurationTest {

  private static final String ZONE = "roux.organization.time-zone=America/New_York";
  private static final String LOCALE = "roux.organization.locale=en-US";

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(
              AutoConfigurations.of(
                  RouxMoneyAutoConfiguration.class, RouxOrganizationAutoConfiguration.class));

  @Test
  void both_settings_make_the_calendar() {
    runner
        .withPropertyValues(ZONE, LOCALE)
        .run(
            context -> {
              OrganizationCalendar calendar = context.getBean(OrganizationCalendar.class);
              assertThat(calendar.zone()).isEqualTo(ZoneId.of("America/New_York"));
              assertThat(calendar.locale()).isEqualTo(Locale.forLanguageTag("en-US"));
            });
  }

  @Test
  void a_missing_time_zone_fails_startup() {
    runner
        .withPropertyValues(LOCALE)
        .run(
            context ->
                assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessage(
                        "roux.organization.time-zone must be set to the organization's time zone"
                            + " (an IANA name such as America/New_York)"));
  }

  @Test
  void a_missing_locale_fails_startup() {
    runner
        .withPropertyValues(ZONE)
        .run(
            context ->
                assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessage(
                        "roux.organization.locale must be set to the organization's locale"
                            + " (a BCP 47 tag such as en-US)"));
  }

  @Test
  void a_blank_locale_fails_startup() {
    runner
        .withPropertyValues(ZONE, "roux.organization.locale= ")
        .run(
            context ->
                assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessageStartingWith("roux.organization.locale must be set"));
  }

  @Test
  void an_unknown_time_zone_fails_startup_naming_the_setting() {
    runner
        .withPropertyValues("roux.organization.time-zone=America/Nwe_York", LOCALE)
        .run(
            context ->
                assertThat(context.getStartupFailure())
                    .hasStackTraceContaining(
                        "Failed to bind properties under 'roux.organization.time-zone'"));
  }

  @Test
  void a_fixed_offset_is_not_a_time_zone() {
    for (String zone : new String[] {"Z", "+05:00", "UTC+3", "GMT-04:00"}) {
      runner
          .withPropertyValues("roux.organization.time-zone=" + zone, LOCALE)
          .run(
              context ->
                  assertThat(context.getStartupFailure())
                      .rootCause()
                      .hasMessageStartingWith(
                          "roux.organization.time-zone must be a place's time zone, not a fixed"
                              + " offset"));
    }
  }

  @Test
  void utc_and_an_etc_zone_are_time_zones() {
    for (String zone : new String[] {"UTC", "Etc/GMT+5"}) {
      runner
          .withPropertyValues("roux.organization.time-zone=" + zone, LOCALE)
          .run(context -> assertThat(context).hasNotFailed());
    }
  }

  @Test
  void a_locale_written_another_way_says_how_to_write_it() {
    runner
        .withPropertyValues(ZONE, "roux.organization.locale=en-us")
        .run(
            context ->
                assertThat(context.getStartupFailure())
                    .rootCause()
                    .hasMessage("roux.organization.locale must be written en-US, not en-us"));
  }

  @Test
  void a_malformed_or_unknown_locale_fails_startup() {
    for (String tag : new String[] {"en_US", "xx-YY"}) {
      runner
          .withPropertyValues(ZONE, "roux.organization.locale=" + tag)
          .run(
              context ->
                  assertThat(context.getStartupFailure())
                      .rootCause()
                      .hasMessage(
                          "roux.organization.locale is not a locale this server knows: " + tag));
    }
  }

  @Test
  void the_calendar_reads_the_apps_clock() {
    runner
        .withPropertyValues(ZONE, LOCALE)
        .withBean(
            Clock.class, () -> Clock.fixed(Instant.parse("2026-11-21T03:00:00Z"), ZoneOffset.UTC))
        .run(
            context ->
                assertThat(context.getBean(OrganizationCalendar.class).today())
                    .isEqualTo(LocalDate.parse("2026-11-20")));
  }

  @Test
  void without_a_clock_the_calendar_uses_the_system_clock() {
    runner
        .withPropertyValues(ZONE, LOCALE)
        .run(
            context ->
                assertThat(context.getBean(OrganizationCalendar.class).now().toInstant())
                    .isCloseTo(Instant.now(), within(1, ChronoUnit.MINUTES)));
  }

  @Test
  void the_context_carries_the_currency_when_there_is_one() {
    runner
        .withPropertyValues(ZONE, LOCALE, "roux.money.currency=USD")
        .run(
            context -> {
              OrganizationContext current =
                  context.getBean(OrganizationContextSource.class).current();
              assertThat(current.currency()).isEqualTo("USD");
              assertThat(current.fractionDigits()).isEqualTo(2);
            });
  }

  @Test
  void and_nulls_without() {
    runner
        .withPropertyValues(ZONE, LOCALE)
        .run(
            context ->
                assertThat(context.getBean(OrganizationContextSource.class).current().currency())
                    .isNull());
  }

  @Test
  void without_roux_money_the_context_has_no_currency() {
    runner
        .withClassLoader(new FilteredClassLoader(Money.class))
        .withPropertyValues(ZONE, LOCALE, "roux.money.currency=USD")
        .run(
            context ->
                assertThat(context.getBean(OrganizationContextSource.class).current().currency())
                    .isNull());
  }

  @Test
  void an_apps_own_source_replaces_rouxs() {
    OrganizationContextSource own =
        () -> new OrganizationContext("UTC", "en", LocalDate.EPOCH, Instant.EPOCH, null, null);
    runner
        .withPropertyValues(ZONE, LOCALE)
        .withBean(OrganizationContextSource.class, () -> own)
        .run(context -> assertThat(context.getBean(OrganizationContextSource.class)).isSameAs(own));
  }

  @Test
  void a_web_app_serves_the_context_to_anyone() {
    new WebApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxOrganizationAutoConfiguration.class))
        .withPropertyValues(ZONE, LOCALE)
        .run(
            context -> {
              assertThat(context)
                  .getBean(OrganizationController.class)
                  .isInstanceOf(OrganizationController.class);
              assertThat(context.getBean(WhoPublicPathContributor.class).publicPaths())
                  .containsExactly(OrganizationController.PATH);
            });
  }

  @Test
  void a_non_web_app_has_no_endpoint() {
    runner
        .withPropertyValues(ZONE, LOCALE)
        .run(context -> assertThat(context).doesNotHaveBean(OrganizationController.class));
  }
}
