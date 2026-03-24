package com.soonmile.backend.auth.controller;

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

@RestController
@Validated
@RequestMapping("/api/v1/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/google")
    public AuthService.AuthResponse googleLogin(@Valid @RequestBody SocialLoginRequest request) {
        return authService.loginWithGoogle(request.idToken());
    }

    @PostMapping("/social/{provider}")
    public AuthService.AuthResponse socialLogin(
            @PathVariable String provider,
            @Valid @RequestBody SocialLoginRequest request) {
        return authService.loginWithSocial(provider, request.idToken());
    }

    @PostMapping("/refresh")
    public AuthService.AuthResponse refresh(@Valid @RequestBody RefreshRequest request) {
        return authService.refresh(request.refreshToken());
    }

    @GetMapping("/me")
    public MeResponse me(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        return new MeResponse(authService.me(token));
    }

    @PostMapping("/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void logout(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        String token = extractBearerToken(authorizationHeader);
        authService.logout(token);
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
        }
        String value = authorizationHeader.trim();
        if (!value.startsWith("Bearer ")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bearer 토큰 형식이 필요합니다.");
        }
        String token = value.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "토큰이 비어 있습니다.");
        }
        return token;
    }

    public record RefreshRequest(@NotBlank(message = "refreshToken은 필수입니다.") String refreshToken) {
    }

    public record SocialLoginRequest(@NotBlank(message = "idToken is required.") String idToken) {
    }

    public record MeResponse(AuthService.UserProfile user) {
    }
}
