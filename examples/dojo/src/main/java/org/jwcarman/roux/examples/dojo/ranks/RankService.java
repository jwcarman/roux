package org.jwcarman.roux.examples.dojo.ranks;

import java.util.List;
import java.util.UUID;

import org.hibernate.exception.ConstraintViolationException;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The school's rank ladder: add, change, reorder and remove ranks. */
@Service
@Transactional
public class RankService {

  /** The unique index on {@code lower(name)} (ranks.xml). */
  static final String NAME_INDEX = "rank_name_key";

  private static final String NAME_TAKEN = "Another rank has this name";

  private final RankRepository ranks;
  private final List<RankRemovalCheck> removalChecks;

  public RankService(RankRepository ranks, List<RankRemovalCheck> removalChecks) {
    this.ranks = ranks;
    this.removalChecks = removalChecks;
  }

  /** The ladder, lowest rank first. */
  @Transactional(readOnly = true)
  public List<Rank> list() {
    return ranks.findAllByOrderByPositionAsc().stream().map(Rank::of).toList();
  }

  /**
   * Adds a rank at the top of the ladder.
   *
   * @throws InvalidFieldException on {@code name} if another rank has it, ignoring case
   */
  public Rank create(RankRequest request) {
    requireUniqueName(request.name(), null);
    RankEntity rank = new RankEntity(request.name(), request.colour(), ranks.maxPosition() + 1);
    return Rank.of(saveAndFlush(rank));
  }

  /**
   * Renames and recolours a rank read at {@code request.version()}.
   *
   * @throws RankNotFoundException if there is no such rank
   * @throws InvalidFieldException on {@code version} if none is given, or on {@code name} if
   *     another rank has it
   * @throws ObjectOptimisticLockingFailureException if the rank changed since it was read
   */
  public Rank update(UUID id, RankRequest request) {
    if (request.version() == null) {
      throw new InvalidFieldException("version", "Must not be empty");
    }
    RankEntity rank = find(id);
    if (!rank.getVersion().equals(request.version())) {
      throw new ObjectOptimisticLockingFailureException(RankEntity.class, id);
    }
    requireUniqueName(request.name(), id);
    rank.change(request.name(), request.colour());
    return Rank.of(saveAndFlush(rank));
  }

  /**
   * Swaps a rank with the one below it.
   *
   * @return the ladder after the move
   * @throws ConflictException if the rank is already the lowest
   */
  public List<Rank> moveDown(UUID id) {
    return move(id, -1, "%s is already the lowest rank");
  }

  /**
   * Swaps a rank with the one above it.
   *
   * @return the ladder after the move
   * @throws ConflictException if the rank is already the highest
   */
  public List<Rank> moveUp(UUID id) {
    return move(id, 1, "%s is already the highest rank");
  }

  /**
   * Removes a rank and closes the gap it leaves.
   *
   * @throws RankNotFoundException if there is no such rank
   * @throws ConflictException if a {@link RankRemovalCheck} refuses (students hold or held it)
   */
  public void remove(UUID id) {
    RankEntity rank = find(id);
    removalChecks.forEach(check -> check.check(rank));
    ranks.delete(rank);
    ranks.flush();
    renumber();
  }

  private List<Rank> move(UUID id, int step, String refusal) {
    List<RankEntity> ladder = ranks.findAllByOrderByPositionAsc();
    RankEntity rank = find(id);
    int index = ladder.indexOf(rank);
    int other = index + step;
    if (other < 0 || other >= ladder.size()) {
      throw new ConflictException(refusal, rank.getName());
    }
    RankEntity neighbour = ladder.get(other);
    int position = rank.getPosition();
    rank.moveTo(neighbour.getPosition());
    neighbour.moveTo(position);
    ranks.flush();
    return list();
  }

  /**
   * Saves the rank and writes it to the database now. The name check before it can lose a race with
   * another request adding the same name; the unique index {@value #NAME_INDEX} decides, and its
   * violation is answered as the same refusal.
   */
  private RankEntity saveAndFlush(RankEntity rank) {
    try {
      return ranks.saveAndFlush(rank);
    } catch (DataIntegrityViolationException e) {
      if (e.getCause() instanceof ConstraintViolationException violation
          && NAME_INDEX.equals(violation.getConstraintName())) {
        throw new InvalidFieldException("name", NAME_TAKEN);
      }
      throw e;
    }
  }

  private void renumber() {
    List<RankEntity> ladder = ranks.findAllByOrderByPositionAsc();
    for (int i = 0; i < ladder.size(); i++) {
      ladder.get(i).moveTo(i + 1);
    }
    ranks.flush();
  }

  private void requireUniqueName(String name, UUID self) {
    ranks
        .findByNameIgnoreCase(name.strip())
        .filter(other -> !other.getId().equals(self))
        .ifPresent(
            other -> {
              throw new InvalidFieldException("name", NAME_TAKEN);
            });
  }

  private RankEntity find(UUID id) {
    return ranks.findById(id).orElseThrow(() -> new RankNotFoundException(id));
  }
}
