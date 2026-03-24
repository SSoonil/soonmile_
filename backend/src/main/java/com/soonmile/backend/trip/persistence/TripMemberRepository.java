package com.soonmile.backend.trip.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TripMemberRepository extends JpaRepository<TripMemberEntity, UUID> {
    List<TripMemberEntity> findByUser_Id(UUID userId);

    Optional<TripMemberEntity> findByTrip_IdAndUser_Id(UUID tripId, UUID userId);

    List<TripMemberEntity> findByTrip_IdOrderByJoinedAtAsc(UUID tripId);

    long countByTrip_Id(UUID tripId);
}
