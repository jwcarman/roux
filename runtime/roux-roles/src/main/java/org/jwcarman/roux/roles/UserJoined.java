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
 * A user joined: the first owner at startup, someone invited through {@link UserInvitations}, or a
 * test's person. Published inside the transaction that creates the user, so an app's listener adds
 * its own data for them in the same commit (an entity for one role only, by {@code role}), and a
 * listener that throws rolls the user back.
 *
 * @param identityId the user's who identity
 * @param name the user's display name
 * @param email the user's address, as who registered it
 * @param role the role the user joined with, by name ({@code OWNER} for the first owner)
 */
public record UserJoined(UUID identityId, String name, String email, String role) {}
