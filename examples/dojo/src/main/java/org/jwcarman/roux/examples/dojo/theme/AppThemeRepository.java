package org.jwcarman.roux.examples.dojo.theme;

import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

/** The one theme row, if the owner has saved one. */
public interface AppThemeRepository extends JpaRepository<AppTheme, UUID> {}
