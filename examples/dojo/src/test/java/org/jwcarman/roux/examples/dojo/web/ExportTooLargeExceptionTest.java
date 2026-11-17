package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.problems.InvalidFieldException;

class ExportTooLargeExceptionTest {

  @Test
  void isAFieldErrorOnExport() {
    InvalidFieldException exception = new ExportTooLargeException();

    assertThat(exception).hasMessage("Narrow the list to export it");
    assertThat(exception.getField()).isEqualTo("export");
  }
}
