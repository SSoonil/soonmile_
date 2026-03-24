package com.soonmile.backend.place.controller;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.soonmile.backend.place.service.RecommendedPlaceService;

@RestController
@Validated
@RequestMapping("/api/v1/admin/places")
public class RecommendedPlaceController {
    private final RecommendedPlaceService recommendedPlaceService;

    public RecommendedPlaceController(RecommendedPlaceService recommendedPlaceService) {
        this.recommendedPlaceService = recommendedPlaceService;
    }

    @GetMapping
    public PlacesResponse listPlaces() {
        return new PlacesResponse(recommendedPlaceService.listPlaces());
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public RecommendedPlaceService.RecommendedPlaceView createPlace(
            @Valid @RequestBody CreatePlaceRequest request) {
        return recommendedPlaceService.createPlace(new RecommendedPlaceService.CreatePlaceCommand(
                request.name(),
                request.region(),
                request.description(),
                request.keywords(),
                request.image(),
                request.isVisible(),
                request.isSponsored()));
    }

    @PatchMapping("/{placeId}/visibility")
    public RecommendedPlaceService.RecommendedPlaceView updateVisibility(
            @PathVariable String placeId,
            @Valid @RequestBody UpdatePlaceVisibilityRequest request) {
        return recommendedPlaceService.updateVisibility(placeId, request.isVisible());
    }

    @DeleteMapping("/{placeId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deletePlace(@PathVariable String placeId) {
        recommendedPlaceService.deletePlace(placeId);
    }

    public record PlacesResponse(List<RecommendedPlaceService.RecommendedPlaceView> items) {
    }

    public record CreatePlaceRequest(
            @NotBlank(message = "name is required") String name,
            String region,
            String description,
            List<String> keywords,
            @NotBlank(message = "image is required") String image,
            boolean isVisible,
            boolean isSponsored) {
    }

    public record UpdatePlaceVisibilityRequest(boolean isVisible) {
    }
}
