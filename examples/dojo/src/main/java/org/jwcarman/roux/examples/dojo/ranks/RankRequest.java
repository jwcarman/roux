package org.jwcarman.roux.examples.dojo.ranks;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * A new rank, or new values for one. {@code version} is the version being edited, and is ignored
 * when creating.
 */
public record RankRequest(
    @NotBlank @Size(max = RankEntity.MAX_NAME) String name,
    @NotNull BeltColour colour,
    Long version) {}
