package com.soonmile.backend.trip.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TripPhotoRepository extends JpaRepository<TripPhotoEntity, UUID> {
    List<TripPhotoEntity> findByTrip_IdOrderByCreatedAtAsc(UUID tripId);

    Optional<TripPhotoEntity> findByIdAndTrip_Id(UUID id, UUID tripId);
}
