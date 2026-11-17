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
package org.jwcarman.roux.autoconfigure.spa;

import java.util.List;

import org.jwcarman.roux.spa.SpaFallbackFilter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The single-page app support's settings, under {@code roux.spa}.
 *
 * @param excludedPaths path patterns, besides {@link SpaFallbackFilter#DEFAULT_EXCLUDED_PATHS},
 *     that are never answered with the shell: the app's own server-rendered pages, say
 */
@ConfigurationProperties("roux.spa")
public record RouxSpaProperties(@DefaultValue List<String> excludedPaths) {}
