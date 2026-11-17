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
package org.jwcarman.roux.contracts;

import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Import;

/**
 * An application as roux's starter makes it: who's own security chain, on PostgreSQL. No security
 * configuration of its own.
 */
@SpringBootConfiguration
@Import({ContractTestController.class, TestDatabase.class})
@EnableAutoConfiguration(
    // who 0.19.0 signs in without a UserDetailsService but publishes no bean that makes Spring
    // Boot's in-memory user back off, so Boot would log a generated password. Nothing signs in
    // with it; the exclusion keeps the log clean.
    excludeName =
        "org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration")
class ContractTestApplication {}
