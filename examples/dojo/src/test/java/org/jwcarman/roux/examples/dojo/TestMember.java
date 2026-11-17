package org.jwcarman.roux.examples.dojo;

import java.util.UUID;

import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * A member signed in through {@link TestMembers}: their identity, and a browser in their session.
 */
public record TestMember(UUID id, WhoMockMvcBrowser browser) {

  /** Sends {@code request} from this member's browser, with the session and CSRF token. */
  public ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
    return browser.perform(request);
  }
}
