package com.soonmile.backend.trip.controller;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.soonmile.backend.auth.service.AuthService;
import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.trip.service.TripService;

@RestController
@Validated
@RequestMapping("/api/v1")
public class TripController {
    private final TripService tripService;
    private final AuthService authService;

    public TripController(TripService tripService, AuthService authService) {
        this.tripService = tripService;
        this.authService = authService;
    }

    @PostMapping("/groups/{groupId}/trips")
    @ResponseStatus(HttpStatus.CREATED)
    public TripService.CreateTripResult createTrip(
            @PathVariable UUID groupId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody CreateTripRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return tripService.createTrip(
                groupId,
                request.name(),
                request.startDate(),
                request.endDate(),
                request.pinColor(),
                user.userId());
    }

    @GetMapping("/trips")
    public TripSummariesResponse getMyTrips(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return new TripSummariesResponse(tripService.listTripsByUser(user.userId()));
    }

    @GetMapping("/trips/{tripId}/members")
    public TripService.TripMembersResponse getTripMembers(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return tripService.listTripMembers(tripId, user.userId());
    }

    @PatchMapping("/trips/{tripId}")
    public TripService.UpdateTripResult updateTrip(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody UpdateTripRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return tripService.updateTrip(
                tripId,
                request.name(),
                request.startDate(),
                request.endDate(),
                request.pinColor(),
                user.userId());
    }

    @DeleteMapping("/trips/{tripId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTrip(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.deleteTrip(tripId, user.userId());
    }

    @PostMapping(value = "/trips/{tripId}/photos", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.ACCEPTED)
    public TripService.UploadPhotosResult uploadPhotos(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestPart("files") List<MultipartFile> files) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return tripService.uploadPhotos(tripId, user.userId(), files);
    }

    @GetMapping("/trips/{tripId}/pins")
    public TripService.PinsResult getPins(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @RequestParam(defaultValue = "true") boolean includeRoute) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.validateTripAccess(tripId, user.userId());
        return tripService.getPins(tripId, includeRoute);
    }

    @GetMapping("/trips/{tripId}/pins/{pinId}/photos")
    public TripService.PinPhotosResult getPinPhotos(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @PathVariable UUID pinId) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.validateTripAccess(tripId, user.userId());
        return tripService.getPinPhotos(tripId, pinId);
    }

    @GetMapping("/trips/{tripId}/photos/unresolved")
    public TripService.UnresolvedResult getUnresolvedPhotos(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.validateTripAccess(tripId, user.userId());
        return tripService.getUnresolvedPhotos(tripId);
    }

    @PostMapping("/trips/{tripId}/photos/manual-assignment")
    public TripService.ManualAssignmentResult assignPhotos(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody ManualAssignmentRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.validateTripAccess(tripId, user.userId());
        return tripService.assignPhotos(
                tripId,
                request.photoIds(),
                new TripService.ManualTarget(
                        request.target().type(),
                        request.target().pinId(),
                        request.target().lat(),
                        request.target().lng(),
                        request.target().title()));
    }

    @PatchMapping("/trips/{tripId}/pins/{pinId}")
    public TripService.UpdatePinResult updatePin(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @PathVariable UUID pinId,
            @RequestBody UpdatePinRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        tripService.validateTripAccess(tripId, user.userId());
        return tripService.updatePin(tripId, pinId, request.title(), request.caption());
    }

    @PostMapping("/trips/{tripId}/members/by-email")
    public TripService.AddTripMemberResult addTripMemberByEmail(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody AddTripMemberRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return tripService.addMemberByEmail(tripId, user.userId(), request.email());
    }

    private AuthService.UserProfile requireAuthenticatedUser(String authorizationHeader) {
        String accessToken = extractBearerToken(authorizationHeader);
        return authService.me(accessToken);
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Authentication is required.");
        }
        String value = authorizationHeader.trim();
        if (!value.startsWith("Bearer ")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bearer token is required.");
        }
        String token = value.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bearer token must not be blank.");
        }
        return token;
    }

    public record CreateTripRequest(
            @NotBlank(message = "name is required") String name,
            LocalDate startDate,
            LocalDate endDate,
            String pinColor) {
    }

    public record TripSummariesResponse(List<TripService.TripSummary> items) {
    }

    public record UpdateTripRequest(
            @NotBlank(message = "name is required") String name,
            LocalDate startDate,
            LocalDate endDate,
            String pinColor) {
    }

    public record ManualAssignmentRequest(
            @NotEmpty(message = "photoIds must not be empty") List<UUID> photoIds,
            @NotNull(message = "target is required") @Valid ManualAssignmentTarget target) {
    }

    public record ManualAssignmentTarget(
            @NotBlank(message = "target.type is required") String type,
            UUID pinId,
            Double lat,
            Double lng,
            String title) {
    }

    public record UpdatePinRequest(String title, String caption) {
    }

    public record AddTripMemberRequest(
            @NotBlank(message = "email is required")
            @Email(message = "email format is invalid") String email) {
    }
}
