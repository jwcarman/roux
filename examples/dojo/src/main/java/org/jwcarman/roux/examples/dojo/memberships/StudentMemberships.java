package org.jwcarman.roux.examples.dojo.memberships;

import java.util.List;

/**
 * A student's current membership (null if they have never had one) and the ended ones, newest
 * first.
 */
public record StudentMemberships(MembershipView current, List<MembershipView> past) {}
