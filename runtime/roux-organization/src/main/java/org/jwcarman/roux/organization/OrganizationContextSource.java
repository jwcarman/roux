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

/**
 * Where the organization's context comes from, read for every page and every {@code GET
 * /api/organization}. roux provides one from {@code roux.organization.*}, the app's clock and
 * {@code roux.money.currency}; an app declares its own bean to replace it.
 */
@FunctionalInterface
public interface OrganizationContextSource {

  /** The context as of now; never {@code null}. */
  OrganizationContext current();
}
