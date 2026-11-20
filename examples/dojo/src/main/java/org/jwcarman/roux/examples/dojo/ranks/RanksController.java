package org.jwcarman.roux.examples.dojo.ranks;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The school's ranks: everyone signed in to the school reads them, the owner changes them. */
@RestController
@RequestMapping("/api/ranks")
public class RanksController {

  private final RankService ranks;

  public RanksController(RankService ranks) {
    this.ranks = ranks;
  }

  @GetMapping
  @RequiresPermission(Permissions.RANKS_READ)
  public List<Rank> list() {
    return ranks.list();
  }

  @PostMapping
  @ResponseStatus(HttpStatus.CREATED)
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public Rank create(@Valid @RequestBody RankRequest request) {
    return ranks.create(request);
  }

  @PutMapping("/{id}")
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public Rank update(@PathVariable UUID id, @Valid @RequestBody RankRequest request) {
    return ranks.update(id, request);
  }

  @PostMapping("/{id}/move-up")
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public List<Rank> moveUp(@PathVariable UUID id) {
    return ranks.moveUp(id);
  }

  @PostMapping("/{id}/move-down")
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public List<Rank> moveDown(@PathVariable UUID id) {
    return ranks.moveDown(id);
  }

  @DeleteMapping("/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @RequiresPermission(Permissions.RANKS_MANAGE)
  public void remove(@PathVariable UUID id) {
    ranks.remove(id);
  }
}
