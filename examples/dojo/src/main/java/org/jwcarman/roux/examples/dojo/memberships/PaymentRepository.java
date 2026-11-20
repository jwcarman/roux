package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface PaymentRepository extends JpaRepository<PaymentEntity, UUID> {

  List<PaymentEntity> findAllByMembershipIdInOrderByTakenOnDescCreatedDateDesc(
      Collection<UUID> membershipIds);

  /** Payments taken from {@code from} up to, not including, {@code until}. */
  Page<PaymentEntity> findByTakenOnGreaterThanEqualAndTakenOnLessThan(
      LocalDate from, LocalDate until, Pageable pageable);

  /** Minor units taken per month ({@code "2026-04"}) from {@code from} up to {@code until}. */
  @Query(
      value =
          "select to_char(date_trunc('month', taken_on), 'YYYY-MM') as month,"
              + " sum(amount_minor_units) as total from payment"
              + " where taken_on >= :from and taken_on < :until group by 1",
      nativeQuery = true)
  List<MonthSum> sumByMonth(LocalDate from, LocalDate until);

  /** One month's total, in minor units. */
  interface MonthSum {
    String getMonth();

    long getTotal();
  }
}
