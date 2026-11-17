package org.jwcarman.roux.examples.dojo.web;

import java.util.List;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * CSV for spreadsheet users (RFC 4180): a UTF-8 byte-order mark, so Excel reads accented names
 * right; CRLF line ends; cells with commas, quotes or line breaks quoted; and a cell starting with
 * {@code =}, {@code +}, {@code -} or {@code @} prefixed with {@code '}, so a spreadsheet shows it
 * instead of running it as a formula (a member named {@code =HYPERLINK(...)} stays text).
 */
public final class Csv {

  private static final String BOM = "﻿";
  private static final String LINE_END = "\r\n";
  private static final Pattern NEEDS_QUOTES = Pattern.compile("[\",\r\n]");

  private Csv() {}

  /** The whole file: the header row, then each row. */
  public static String document(List<String> header, List<List<String>> rows) {
    StringBuilder csv = new StringBuilder(BOM).append(row(header));
    rows.forEach(row -> csv.append(row(row)));
    return csv.toString();
  }

  /** One cell, escaped and quoted as needed; null is an empty cell. */
  public static String cell(String value) {
    if (value == null || value.isEmpty()) {
      return "";
    }
    String text = "=+-@".indexOf(value.charAt(0)) >= 0 ? "'" + value : value;
    return NEEDS_QUOTES.matcher(text).find() ? "\"" + text.replace("\"", "\"\"") + "\"" : text;
  }

  private static String row(List<String> cells) {
    return cells.stream().map(Csv::cell).collect(Collectors.joining(",")) + LINE_END;
  }
}
