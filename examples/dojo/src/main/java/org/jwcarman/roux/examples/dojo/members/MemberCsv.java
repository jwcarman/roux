package org.jwcarman.roux.examples.dojo.members;

import java.time.ZoneId;
import java.util.List;

import org.jwcarman.roux.examples.dojo.web.Csv;

/** The team directory as a CSV file: name, email, role, status and the date they joined (UTC). */
final class MemberCsv {

  static final List<String> HEADER = List.of("Name", "Email", "Role", "Status", "Joined");

  private MemberCsv() {}

  static String write(List<MemberDirectoryEntry> members, ZoneId zone) {
    return Csv.document(
        HEADER,
        members.stream()
            .map(
                member ->
                    List.of(
                        member.getDisplayName(),
                        member.getEmail(),
                        member.getRole(),
                        member.getStatus(),
                        member.getJoinedAt().atZone(zone).toLocalDate().toString()))
            .toList());
  }
}
