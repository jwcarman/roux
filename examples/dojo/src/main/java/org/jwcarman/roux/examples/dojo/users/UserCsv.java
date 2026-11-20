package org.jwcarman.roux.examples.dojo.users;

import java.time.ZoneId;
import java.util.List;

import org.jwcarman.roux.examples.dojo.web.Csv;
import org.jwcarman.roux.users.UserDirectoryEntry;

/** The team as a CSV file: name, email, role, status and the school's day they joined. */
final class UserCsv {

  static final List<String> HEADER = List.of("Name", "Email", "Role", "Status", "Joined");

  private UserCsv() {}

  static String write(List<UserDirectoryEntry> users, ZoneId zone) {
    return Csv.document(
        HEADER,
        users.stream()
            .map(
                user ->
                    List.of(
                        user.getDisplayName(),
                        user.getEmail(),
                        user.getRole(),
                        user.getStatus(),
                        user.getJoinedAt().atZone(zone).toLocalDate().toString()))
            .toList());
  }
}
