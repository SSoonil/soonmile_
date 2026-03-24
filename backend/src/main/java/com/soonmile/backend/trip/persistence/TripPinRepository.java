package com.soonmile.backend.trip.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TripPinRepository extends JpaRepository<TripPinEntity, UUID> {
    List<TripPinEntity> findByTrip_IdOrderByCreatedAtAsc(UUID tripId);

    Optional<TripPinEntity> findByIdAndTrip_Id(UUID id, UUID tripId);
}
