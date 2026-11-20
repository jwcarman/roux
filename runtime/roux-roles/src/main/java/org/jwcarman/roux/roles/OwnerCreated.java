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
package org.jwcarman.roux.roles;

import java.util.UUID;

/**
 * roux made the first owner. Published inside the owner's transaction, so an app's listener adds
 * its own data for the owner (a profile) in the same commit, and a listener that throws rolls the
 * owner back.
 *
 * @param identityId the owner's identity
 * @param name the owner's display name, from {@code roux.owner.name}
 * @param email the owner's address, as who registered it
 */
public record OwnerCreated(UUID identityId, String name, String email) {}
