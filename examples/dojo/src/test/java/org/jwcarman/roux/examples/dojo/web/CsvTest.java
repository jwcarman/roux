package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;

class CsvTest {

  @Test
  void aDocumentIsABomTheHeaderAndRowsWithCrlfLineEnds() {
    assertThat(Csv.document(List.of("Name", "Email"), List.of(List.of("Ada", "ada@example.org"))))
        .isEqualTo("﻿Name,Email\r\nAda,ada@example.org\r\n");
  }

  @Test
  void cellsWithCommasQuotesOrLineBreaksAreQuoted() {
    assertThat(Csv.cell("Lovelace, Ada")).isEqualTo("\"Lovelace, Ada\"");
    assertThat(Csv.cell("Ada \"Countess\" King")).isEqualTo("\"Ada \"\"Countess\"\" King\"");
    assertThat(Csv.cell("two\nlines")).isEqualTo("\"two\nlines\"");
    assertThat(Csv.cell("two\r\nlines")).isEqualTo("\"two\r\nlines\"");
  }

  @Test
  void cellsThatASpreadsheetWouldRunAsAFormulaAreEscaped() {
    assertThat(Csv.cell("=SUM(1)")).isEqualTo("'=SUM(1)");
    assertThat(Csv.cell("+1")).isEqualTo("'+1");
    assertThat(Csv.cell("-1")).isEqualTo("'-1");
    assertThat(Csv.cell("@x")).isEqualTo("'@x");
    assertThat(Csv.cell("=HYPERLINK(\"x\",\"y\")"))
        .isEqualTo("\"'=HYPERLINK(\"\"x\"\",\"\"y\"\")\"");
  }

  @Test
  void otherTextIsLeftAlone() {
    assertThat(Csv.cell("Zoë Ångström")).isEqualTo("Zoë Ångström");
    assertThat(Csv.cell("")).isEmpty();
    assertThat(Csv.cell(null)).isEmpty();
  }
}
