package com.soonmile.backend.place.persistence;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface RecommendedPlaceRepository extends JpaRepository<RecommendedPlaceEntity, String> {
    List<RecommendedPlaceEntity> findAllByOrderByCreatedAtDesc();
}
