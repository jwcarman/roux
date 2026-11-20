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
package org.jwcarman.roux.activity;

/**
 * What happened to a record: a Java record whose components are the facts kept (a rename's old and
 * new names), with its kind's code and its sentence. {@link ActivityLog#append} stores the
 * components as JSON.
 *
 * <pre>{@code
 * public record MemberRenamed(String from, String to) implements BusinessActivity {
 *   public String type() { return "member.renamed"; }
 *   public String describe() { return "Renamed from " + from + " to " + to; }
 * }
 * }</pre>
 */
public interface BusinessActivity {

  /**
   * The kind's code: lower case and dotted ({@code member.renamed}), at most 100 characters. Stored
   * rows keep it, so it never changes once rows exist; a new meaning is a new code.
   */
  String type();

  /**
   * What happened, in a sentence (at most 500 characters): {@code Renamed from Ada to Ada King}.
   * Written once, when the activity happens.
   */
  String describe();
}
