package org.jwcarman.roux.examples.dojo.web;

import java.io.Serial;

import org.jwcarman.roux.problems.InvalidFieldException;

/**
 * An export with more rows than the app allows: answered by roux's {@code ProblemsAdvice} as a 400
 * Problem Detail with a field error on {@code export}, rather than a file cut off silently.
 */
public class ExportTooLargeException extends InvalidFieldException {

  @Serial private static final long serialVersionUID = 1L;

  public ExportTooLargeException() {
    super("export", "Narrow the list to export it");
  }
}
