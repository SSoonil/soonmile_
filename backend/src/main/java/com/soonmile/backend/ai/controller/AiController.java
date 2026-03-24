package com.soonmile.backend.ai.controller;

import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.soonmile.backend.auth.service.AuthService;
import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.ai.service.AiService;
import com.soonmile.backend.ai.service.AiNarrationService;

@RestController
@Validated
@RequestMapping("/api/v1")
public class AiController {
    private final AiService aiService;
    private final AuthService authService;

    public AiController(AiService aiService, AuthService authService) {
        this.aiService = aiService;
        this.authService = authService;
    }

    @PostMapping("/trips/{tripId}/ai-jobs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public AiService.AiJobResult createAiJob(
            @PathVariable UUID tripId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody CreateAiJobRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return aiService.createAiJob(tripId, user.userId(), request.type());
    }

    @GetMapping("/ai-jobs/{jobId}")
    public AiService.AiJobResult getAiJob(
            @PathVariable UUID jobId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return aiService.getAiJob(jobId, user.userId());
    }

    @GetMapping("/ai-jobs/{jobId}/result")
    public AiService.AiResult getAiResult(
            @PathVariable UUID jobId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return aiService.getAiResult(jobId, user.userId());
    }

    @GetMapping("/ai/llm/readiness")
    public AiNarrationService.LlmReadiness getLlmReadiness(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        requireAuthenticatedUser(authorizationHeader);
        return aiService.getLlmReadiness();
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
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bearer token is required.");
        }
        return token;
    }

    public record CreateAiJobRequest(@NotBlank(message = "type은 필수입니다.") String type) {
    }
}
