package org.jwcarman.roux.examples.dojo.users;

import java.nio.charset.StandardCharsets;
import java.util.List;

import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.examples.dojo.web.ExportTooLargeException;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.jwcarman.roux.users.RouxUserPermissions;
import org.jwcarman.roux.users.UserDirectory;
import org.jwcarman.roux.users.UserDirectoryEntry;
import org.jwcarman.roux.users.UserFilter;
import org.jwcarman.roux.users.UserSort;
import org.jwcarman.roux.users.UserStatus;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * roux's user list as a CSV download, {@code GET /api/users/export.csv}: filtered and sorted like
 * the list, not paged, and refused past {@code app.export.max-rows} rows (10,000 by default).
 */
@RestController
public class UsersExportController {

  private static final Paginator PAGES =
      Paginator.of(UserDirectoryEntry.class, UserSort.class, cfg -> cfg.defaultSort(UserSort.NAME));

  private final UserDirectory directory;
  private final int maxRows;
  private final OrganizationCalendar calendar;

  public UsersExportController(
      UserDirectory directory,
      @Value("${app.export.max-rows:10000}") int maxRows,
      OrganizationCalendar calendar) {
    this.directory = directory;
    this.maxRows = maxRows;
    this.calendar = calendar;
  }

  @GetMapping("/api/users/export.csv")
  @RequiresPermission(RouxUserPermissions.USERS_READ)
  @Transactional(readOnly = true)
  public ResponseEntity<String> export(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String role,
      @RequestParam(required = false) UserStatus status) {
    Sort sort = PAGES.pageableOf(params).getSort();
    List<UserDirectoryEntry> rows =
        directory
            .findAll(
                new UserFilter(search, role, status).specification(),
                PageRequest.of(0, maxRows + 1, sort))
            .getContent();
    if (rows.size() > maxRows) {
      throw new ExportTooLargeException();
    }
    return ResponseEntity.ok()
        .contentType(new MediaType("text", "csv", StandardCharsets.UTF_8))
        .header(
            HttpHeaders.CONTENT_DISPOSITION,
            ContentDisposition.attachment().filename("users.csv").build().toString())
        .body(UserCsv.write(rows, calendar.zone()));
  }
}
