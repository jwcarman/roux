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
package org.jwcarman.roux.organization;

import java.util.Objects;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Serves the organization's context at {@value #PATH}: the browser asks when its today ends, and
 * whenever the page it was served had no context (Vite's dev server).
 */
@RestController
public class OrganizationController {

  /** Where the context is served. */
  public static final String PATH = "/api/organization";

  private final OrganizationContextSource source;

  /** Creates the controller over the context's source. */
  public OrganizationController(OrganizationContextSource source) {
    this.source = Objects.requireNonNull(source, "source");
  }

  /** The context as of now. */
  @GetMapping(PATH)
  public OrganizationContext organization() {
    return source.current();
  }
}
