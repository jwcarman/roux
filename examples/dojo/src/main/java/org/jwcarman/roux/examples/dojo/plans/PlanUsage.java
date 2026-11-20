package org.jwcarman.roux.examples.dojo.plans;

import java.util.UUID;

/**
 * Whether another feature holds a plan (a membership on it). A used plan keeps its period and
 * cannot be removed; it can be made inactive. Each feature that uses plans supplies one.
 */
@FunctionalInterface
public interface PlanUsage {

  boolean isInUse(UUID planId);
}
