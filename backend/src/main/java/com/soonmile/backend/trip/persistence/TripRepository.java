package com.soonmile.backend.trip.persistence;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TripRepository extends JpaRepository<TripEntity, UUID> {
    List<TripEntity> findByGroup_IdInOrderByUpdatedAtDesc(List<UUID> groupIds);

    List<TripEntity> findByCreatedByUser_IdOrderByUpdatedAtDesc(UUID userId);

    List<TripEntity> findByIdInOrderByUpdatedAtDesc(List<UUID> tripIds);
}
