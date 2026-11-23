package org.jwcarman.roux.examples.dojo.ranks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** What the database itself holds to, behind the checks the service makes first. */
@AppTest
class RankConstraintsTest {

  @Autowired TestUsers users;
  @Autowired JdbcTemplate jdbc;
  @Autowired RankRepository repository;

  @BeforeEach
  void cleanSlate() {
    users.reset();
  }

  @Test
  void twoRanksCannotShareAPosition() {
    insert("White", 1);

    assertThatThrownBy(() -> insert("Yellow", 1))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  @Test
  void aSwapOfPositionsInOneTransactionIsAllowed() {
    insert("White", 1);
    insert("Yellow", 2);

    jdbc.execute(
        "do $$ begin update rank set position = 2 where name = 'White';"
            + " update rank set position = 1 where name = 'Yellow'; end $$");

    assertThat(jdbc.queryForList("select name from rank order by position", String.class))
        .containsExactly("Yellow", "White");
  }

  @Test
  void theDatabasesViolationOfTheNameIndexIsNamedAsTheServiceExpects() {
    insert("White", 1);

    assertThatThrownBy(() -> repository.saveAndFlush(new RankEntity(" white", BeltColour.WHITE, 2)))
        .isInstanceOf(DataIntegrityViolationException.class)
        .cause()
        .isInstanceOfSatisfying(
            org.hibernate.exception.ConstraintViolationException.class,
            violation ->
                assertThat(violation.getConstraintName()).isEqualTo(RankService.NAME_INDEX));
  }

  @Test
  void aNameTakenInTheMeantimeIsRefusedUnderName() {
    // The check before saving found no one with the name; the index then does.
    RankRepository ranks = mock(RankRepository.class);
    when(ranks.findByNameIgnoreCase(any())).thenReturn(Optional.empty());
    when(ranks.maxPosition()).thenReturn(0);
    when(ranks.saveAndFlush(any()))
        .thenThrow(
            new DataIntegrityViolationException(
                "duplicate",
                new org.hibernate.exception.ConstraintViolationException(
                    "duplicate",
                    new SQLException("duplicate key"),
                    "insert",
                    RankService.NAME_INDEX)));
    RankService service = new RankService(ranks, List.of());

    assertThatThrownBy(() -> service.create(new RankRequest("White", BeltColour.WHITE, null)))
        .isInstanceOf(InvalidFieldException.class)
        .hasMessage("Another rank has this name");
  }

  @Test
  void anyOtherIntegrityViolationIsLeftToRoux() {
    RankRepository ranks = mock(RankRepository.class);
    when(ranks.findByNameIgnoreCase(any())).thenReturn(Optional.empty());
    when(ranks.saveAndFlush(any())).thenThrow(new DataIntegrityViolationException("other"));
    RankService service = new RankService(ranks, List.of());

    assertThatThrownBy(() -> service.create(new RankRequest("White", BeltColour.WHITE, null)))
        .isInstanceOf(DataIntegrityViolationException.class);
  }

  private void insert(String name, int position) {
    jdbc.update(
        "insert into rank (id, version, name, colour, position) values (gen_random_uuid(), 0, ?,"
            + " 'WHITE', ?)",
        name,
        position);
  }
}
