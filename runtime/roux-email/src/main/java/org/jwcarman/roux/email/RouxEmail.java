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
package org.jwcarman.roux.email;

/** Where roux's finished emails are, on the class path. */
public final class RouxEmail {

  /** The templates, as {@code WhoEmailTemplates} takes the location. */
  public static final String TEMPLATES = "classpath:/org/jwcarman/roux/email/";

  /** The bundle with the five subjects, as {@code ResourceBundle} spells it. */
  public static final String MESSAGES = "org/jwcarman/roux/email/email-messages";

  private RouxEmail() {}
}
