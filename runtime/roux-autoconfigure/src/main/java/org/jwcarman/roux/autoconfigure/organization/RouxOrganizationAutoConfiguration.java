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

import java.time.Clock;
import java.util.List;
import java.util.Objects;

import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.MoneySettings;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.jwcarman.roux.organization.OrganizationContext;
import org.jwcarman.roux.organization.OrganizationContextSource;
import org.jwcarman.roux.organization.OrganizationController;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The organization: its {@link OrganizationCalendar} from {@code roux.organization.*} and the app's
 * {@link Clock} bean (the system's UTC clock without one), the {@link OrganizationContextSource}
 * the shell and {@code GET /api/organization} read (with {@code roux.money.currency} when
 * roux-money has one), and, in a servlet app, the endpoint, open to signed-out requests as the page
 * is.
 */
@AutoConfiguration
@ConditionalOnClass(OrganizationCalendar.class)
@EnableConfigurationProperties(RouxOrganizationProperties.class)
public class RouxOrganizationAutoConfiguration {

  /** The organization's calendar. */
  @Bean
  @ConditionalOnMissingBean
  public OrganizationCalendar rouxOrganizationCalendar(
      RouxOrganizationProperties organization, ObjectProvider<Clock> clock) {
    return new OrganizationCalendar(
        clock.getIfAvailable(Clock::systemUTC),
        Objects.requireNonNull(organization.timeZone()),
        organization.toLocale());
  }

  /** The context without a currency: the app has no roux-money. */
  @Bean
  @ConditionalOnMissingBean
  public OrganizationContextSource rouxOrganizationContextSource(OrganizationCalendar calendar) {
    return () -> OrganizationContext.of(calendar, null);
  }

  /** The context with roux-money's currency, when it has one. */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(Money.class)
  static class WithMoney {

    @Bean
    @ConditionalOnMissingBean
    OrganizationContextSource rouxOrganizationContextSourceWithMoney(
        OrganizationCalendar calendar, ObjectProvider<MoneySettings> money) {
      return () -> {
        MoneySettings settings = money.getIfAvailable();
        return OrganizationContext.of(calendar, settings == null ? null : settings.currency());
      };
    }
  }

  /** The endpoint. */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnWebApplication(type = Type.SERVLET)
  static class Web {

    @Bean
    @ConditionalOnMissingBean
    OrganizationController rouxOrganizationController(OrganizationContextSource source) {
      return new OrganizationController(source);
    }

    /** The context is in every page, signed in or not, so its endpoint is open too. */
    @Configuration(proxyBeanMethods = false)
    @ConditionalOnClass(WhoPublicPathContributor.class)
    static class PublicPath {

      @Bean
      WhoPublicPathContributor organizationPublicPath() {
        return () -> List.of(OrganizationController.PATH);
      }
    }
  }
}
