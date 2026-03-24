package com.soonmile.backend.place.service;

import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.place.persistence.RecommendedPlaceEntity;
import com.soonmile.backend.place.persistence.RecommendedPlaceRepository;

@Service
public class RecommendedPlaceService {
    private final RecommendedPlaceRepository recommendedPlaceRepository;

    public RecommendedPlaceService(RecommendedPlaceRepository recommendedPlaceRepository) {
        this.recommendedPlaceRepository = recommendedPlaceRepository;
    }

    @Transactional(readOnly = true)
    public List<RecommendedPlaceView> listPlaces() {
        return recommendedPlaceRepository.findAllByOrderByCreatedAtDesc().stream()
                .map(this::toView)
                .toList();
    }

    @Transactional
    public RecommendedPlaceView createPlace(CreatePlaceCommand command) {
        Instant now = Instant.now();
        RecommendedPlaceEntity entity = new RecommendedPlaceEntity();
        entity.setId("place-" + UUID.randomUUID());
        entity.setName(requireText(command.name(), "name"));
        entity.setRegion(defaultText(command.region(), "기타"));
        entity.setDescription(defaultText(command.description(), "설명이 아직 등록되지 않았습니다."));
        entity.setKeywords(toKeywordsCsv(command.keywords()));
        entity.setImageUrl(requireText(command.image(), "image"));
        entity.setVisible(command.isVisible());
        entity.setSponsored(command.isSponsored());
        entity.setCreatedAt(now);
        entity.setUpdatedAt(now);
        return toView(recommendedPlaceRepository.save(entity));
    }

    @Transactional
    public RecommendedPlaceView updateVisibility(String placeId, boolean isVisible) {
        RecommendedPlaceEntity entity = requirePlace(placeId);
        entity.setVisible(isVisible);
        entity.setUpdatedAt(Instant.now());
        return toView(recommendedPlaceRepository.save(entity));
    }

    @Transactional
    public void deletePlace(String placeId) {
        RecommendedPlaceEntity entity = requirePlace(placeId);
        recommendedPlaceRepository.delete(entity);
    }

    private RecommendedPlaceEntity requirePlace(String placeId) {
        String normalizedPlaceId = requireText(placeId, "placeId");
        return recommendedPlaceRepository.findById(normalizedPlaceId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Place not found."));
    }

    private String requireText(String value, String fieldName) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", fieldName + " is required.");
        }
        return normalized;
    }

    private String defaultText(String value, String fallback) {
        String normalized = value == null ? "" : value.trim();
        return normalized.isBlank() ? fallback : normalized;
    }

    private String toKeywordsCsv(List<String> keywords) {
        if (keywords == null || keywords.isEmpty()) {
            return "";
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String keyword : keywords) {
            String value = keyword == null ? "" : keyword.trim();
            if (!value.isBlank()) {
                normalized.add(value.toLowerCase(Locale.ROOT));
            }
        }
        return String.join(",", normalized);
    }

    private List<String> parseKeywords(String keywordsCsv) {
        String raw = keywordsCsv == null ? "" : keywordsCsv.trim();
        if (raw.isBlank()) {
            return List.of();
        }
        Set<String> normalized = new LinkedHashSet<>();
        for (String keyword : raw.split(",")) {
            String value = keyword.trim();
            if (!value.isBlank()) {
                normalized.add(value);
            }
        }
        return normalized.stream().toList();
    }

    private RecommendedPlaceView toView(RecommendedPlaceEntity entity) {
        return new RecommendedPlaceView(
                entity.getId(),
                entity.getName(),
                entity.getRegion(),
                entity.getDescription(),
                parseKeywords(entity.getKeywords()),
                entity.getImageUrl(),
                entity.isVisible(),
                entity.isSponsored(),
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }

    public record CreatePlaceCommand(
            String name,
            String region,
            String description,
            List<String> keywords,
            String image,
            boolean isVisible,
            boolean isSponsored) {
    }

    public record RecommendedPlaceView(
            String id,
            String name,
            String region,
            String description,
            List<String> keywords,
            String image,
            boolean isVisible,
            boolean isSponsored,
            Instant createdAt,
            Instant updatedAt) {
    }
}
