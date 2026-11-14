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
package org.jwcarman.roux.problems;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * roux-problems' settings, under {@code roux.problems}.
 *
 * @param enabled whether roux answers errors as Problem Details at all
 * @param apiPathPrefix where the API's paths begin: a path under it that matches nothing is a
 *     problem, and any other is a page the error page renders
 */
@ConfigurationProperties("roux.problems")
public record RouxProblemsProperties(
    @DefaultValue("true") boolean enabled, @DefaultValue("/api/") String apiPathPrefix) {}
