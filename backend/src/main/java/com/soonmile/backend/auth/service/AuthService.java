package com.soonmile.backend.auth.service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soonmile.backend.auth.persistence.AuthAccessSessionEntity;
import com.soonmile.backend.auth.persistence.AuthAccessSessionRepository;
import com.soonmile.backend.auth.persistence.AuthIdentityEntity;
import com.soonmile.backend.auth.persistence.AuthIdentityRepository;
import com.soonmile.backend.auth.persistence.AuthProvider;
import com.soonmile.backend.auth.persistence.AuthRefreshSessionEntity;
import com.soonmile.backend.auth.persistence.AuthRefreshSessionRepository;
import com.soonmile.backend.auth.persistence.UserEntity;
import com.soonmile.backend.auth.persistence.UserRole;
import com.soonmile.backend.auth.persistence.UserStatus;
import com.soonmile.backend.auth.persistence.UserRepository;
import com.soonmile.backend.common.ApiException;

@Service
public class AuthService {
    private static final Duration ACCESS_TOKEN_TTL = Duration.ofMinutes(30);
    private static final Duration REFRESH_TOKEN_TTL = Duration.ofDays(14);
    private static final Duration GOOGLE_HTTP_TIMEOUT = Duration.ofSeconds(5);
    private static final String GOOGLE_ISSUER = "accounts.google.com";
    private static final String GOOGLE_ISSUER_HTTPS = "https://accounts.google.com";
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final UserRepository userRepository;
    private final AuthIdentityRepository authIdentityRepository;
    private final AuthAccessSessionRepository authAccessSessionRepository;
    private final AuthRefreshSessionRepository authRefreshSessionRepository;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;
    private final String googleClientId;

    public AuthService(
            UserRepository userRepository,
            AuthIdentityRepository authIdentityRepository,
            AuthAccessSessionRepository authAccessSessionRepository,
            AuthRefreshSessionRepository authRefreshSessionRepository,
            ObjectMapper objectMapper,
            @Value("${auth.google.client-id:}") String googleClientId) {
        this.userRepository = userRepository;
        this.authIdentityRepository = authIdentityRepository;
        this.authAccessSessionRepository = authAccessSessionRepository;
        this.authRefreshSessionRepository = authRefreshSessionRepository;
        this.objectMapper = objectMapper;
        this.googleClientId = googleClientId == null ? "" : googleClientId.trim();
        this.httpClient = HttpClient.newBuilder().connectTimeout(GOOGLE_HTTP_TIMEOUT).build();
    }



    @Transactional
    public AuthResponse refresh(String refreshToken) {
        AuthRefreshSessionEntity refreshSession = requireValidRefreshSession(refreshToken);
        UserEntity user = refreshSession.getUser();
        revokeRefreshSession(refreshSession);
        return issueTokens(user);
    }

    @Transactional
    public AuthResponse loginWithSocial(String provider, String idToken) {
        AuthProvider authProvider;
        try {
            authProvider = AuthProvider.from(provider);
        } catch (IllegalArgumentException exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_SOCIAL_PROVIDER", "지원하지 않는 소셜 로그인 제공자입니다.");
        }

        switch (authProvider) {
            case GOOGLE:
                return loginWithGoogle(idToken);
            case APPLE:
            case KAKAO:
            case NAVER:
                    throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "SOCIAL_PROVIDER_NOT_READY", "아직 연동되지 않은 소셜 로그인 제공자입니다.");
            case LOCAL:
                    throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_SOCIAL_PROVIDER", "로컬 로그인은 비활성화되었습니다.");
            default:
                throw new ApiException(HttpStatus.BAD_REQUEST, "UNSUPPORTED_SOCIAL_PROVIDER", "Unsupported social provider.");
        }
    }

    @Transactional
    public AuthResponse loginWithGoogle(String idToken) {
        if (googleClientId.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GOOGLE_LOGIN_NOT_CONFIGURED", "Google 濡쒓렇???ㅼ젙??鍮꾩뼱 ?덉뒿?덈떎.");
        }

        GoogleTokenInfo googleTokenInfo = fetchGoogleTokenInfo(idToken);
        if (!googleClientId.equals(googleTokenInfo.audience())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GOOGLE_TOKEN", "Google ?좏겙??????대씪?댁뼵?멸? ?쇱튂?섏? ?딆뒿?덈떎.");
        }
        if (!GOOGLE_ISSUER.equals(googleTokenInfo.issuer()) && !GOOGLE_ISSUER_HTTPS.equals(googleTokenInfo.issuer())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GOOGLE_TOKEN", "Google ?좏겙 諛쒓툒?먭? ?щ컮瑜댁? ?딆뒿?덈떎.");
        }
        if (!googleTokenInfo.emailVerified()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GOOGLE_TOKEN", "Google ?대찓???몄쬆???꾩슂?⑸땲??");
        }

        String googleSubject = requireText(googleTokenInfo.subject(), "google.sub");
        AuthIdentityEntity googleIdentity = authIdentityRepository
                .findByProviderAndProviderUserId(AuthProvider.GOOGLE, googleSubject)
                .orElse(null);

        UserEntity user;
        if (googleIdentity != null) {
            user = googleIdentity.getUser();
            String normalizedEmail = normalizeEmail(googleTokenInfo.email());
            String normalizedDisplayName = nullableTrim(googleTokenInfo.name());
            boolean identityUpdated = false;
            if (!normalizedEmail.equals(nullableTrim(googleIdentity.getProviderEmail()))) {
                googleIdentity.setProviderEmail(normalizedEmail);
                identityUpdated = true;
            }
            if (!normalizedDisplayName.equals(nullableTrim(googleIdentity.getProviderDisplayName()))) {
                googleIdentity.setProviderDisplayName(normalizedDisplayName);
                identityUpdated = true;
            }
            if (identityUpdated) {
                authIdentityRepository.save(googleIdentity);
            }
        } else {
            Instant now = Instant.now();
            String normalizedEmail = normalizeEmail(googleTokenInfo.email());
            user = userRepository.findByEmail(normalizedEmail)
                    .orElseGet(() -> userRepository.save(createUser(resolveGoogleDisplayName(googleTokenInfo), normalizedEmail, now)));

            AuthIdentityEntity newGoogleIdentity = new AuthIdentityEntity();
            newGoogleIdentity.setId(UUID.randomUUID());
            newGoogleIdentity.setUser(user);
            newGoogleIdentity.setProvider(AuthProvider.GOOGLE);
            newGoogleIdentity.setProviderUserId(googleSubject);
            newGoogleIdentity.setProviderEmail(normalizedEmail);
            newGoogleIdentity.setProviderDisplayName(nullableTrim(googleTokenInfo.name()));
            newGoogleIdentity.setCreatedAt(now);
            authIdentityRepository.save(newGoogleIdentity);
        }

        return issueTokens(user);
    }

    @Transactional
    public UserProfile me(String accessToken) {
        AuthAccessSessionEntity accessSession = requireValidAccessSession(accessToken);
        UserEntity user = accessSession.getUser();
        return new UserProfile(user.getId(), user.getName(), user.getEmail());
    }

    @Transactional
    public void logout(String accessToken) {
        String normalizedAccessToken = nullableTrim(accessToken);
        if (normalizedAccessToken.isBlank()) {
            return;
        }

        String tokenHash = hashToken(normalizedAccessToken);
        AuthAccessSessionEntity accessSession = authAccessSessionRepository.findByTokenHash(tokenHash).orElse(null);
        if (accessSession == null) {
            return;
        }

        AuthRefreshSessionEntity refreshSession = accessSession.getRefreshSession();
        if (refreshSession != null) {
            revokeRefreshSession(refreshSession);
        }

        authAccessSessionRepository.delete(accessSession);
    }

    private AuthResponse issueTokens(UserEntity user) {
        Instant now = Instant.now();

        String refreshToken = "smr_" + UUID.randomUUID().toString().replace("-", "");
        Instant refreshTokenExpiresAt = now.plus(REFRESH_TOKEN_TTL);
        AuthRefreshSessionEntity refreshSession = new AuthRefreshSessionEntity();
        refreshSession.setId(UUID.randomUUID());
        refreshSession.setUser(user);
        refreshSession.setTokenHash(hashToken(refreshToken));
        refreshSession.setExpiresAt(refreshTokenExpiresAt);
        refreshSession.setRevoked(false);
        refreshSession.setCreatedAt(now);
        authRefreshSessionRepository.save(refreshSession);

        String accessToken = "sma_" + UUID.randomUUID().toString().replace("-", "");
        Instant accessTokenExpiresAt = now.plus(ACCESS_TOKEN_TTL);
        AuthAccessSessionEntity accessSession = new AuthAccessSessionEntity();
        accessSession.setId(UUID.randomUUID());
        accessSession.setUser(user);
        accessSession.setRefreshSession(refreshSession);
        accessSession.setTokenHash(hashToken(accessToken));
        accessSession.setExpiresAt(accessTokenExpiresAt);
        accessSession.setCreatedAt(now);
        authAccessSessionRepository.save(accessSession);

        return new AuthResponse(
                accessToken,
                accessTokenExpiresAt,
                refreshToken,
                refreshTokenExpiresAt,
                new UserProfile(user.getId(), user.getName(), user.getEmail()));
    }

    private AuthAccessSessionEntity requireValidAccessSession(String accessToken) {
        String normalizedToken = nullableTrim(accessToken);
        if (normalizedToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "濡쒓렇?몄씠 ?꾩슂?⑸땲??");
        }

        String tokenHash = hashToken(normalizedToken);
        AuthAccessSessionEntity accessSession = authAccessSessionRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "濡쒓렇?몄씠 ?꾩슂?⑸땲??"));

        if (accessSession.getExpiresAt().isBefore(Instant.now())) {
            authAccessSessionRepository.delete(accessSession);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_EXPIRED", "?≪꽭???좏겙??留뚮즺?섏뿀?듬땲??");
        }
        return accessSession;
    }

    private AuthRefreshSessionEntity requireValidRefreshSession(String refreshToken) {
        String normalizedRefreshToken = nullableTrim(refreshToken);
        if (normalizedRefreshToken.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "由ы봽?덉떆 ?좏겙???꾩슂?⑸땲??");
        }

        String tokenHash = hashToken(normalizedRefreshToken);
        AuthRefreshSessionEntity refreshSession = authRefreshSessionRepository.findByTokenHash(tokenHash)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "由ы봽?덉떆 ?좏겙???좏슚?섏? ?딆뒿?덈떎."));

        if (refreshSession.isRevoked()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "由ы봽?덉떆 ?좏겙???좏슚?섏? ?딆뒿?덈떎.");
        }
        if (refreshSession.getExpiresAt().isBefore(Instant.now())) {
            refreshSession.setRevoked(true);
            authRefreshSessionRepository.save(refreshSession);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_EXPIRED", "由ы봽?덉떆 ?좏겙??留뚮즺?섏뿀?듬땲??");
        }
        return refreshSession;
    }

    private void revokeRefreshSession(AuthRefreshSessionEntity refreshSession) {
        if (refreshSession == null) {
            return;
        }
        if (!refreshSession.isRevoked()) {
            refreshSession.setRevoked(true);
            authRefreshSessionRepository.save(refreshSession);
        }
        authAccessSessionRepository.deleteByRefreshSessionId(refreshSession.getId());
    }

    private UserEntity createUser(String name, String email, Instant now) {
        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID());
        user.setName(name);
        user.setEmail(email);
        user.setRole(UserRole.USER);
        user.setStatus(UserStatus.ACTIVE);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        return user;
    }


    private String resolveGoogleDisplayName(GoogleTokenInfo tokenInfo) {
        String preferred = nullableTrim(tokenInfo.name());
        if (!preferred.isBlank()) {
            return preferred;
        }
        String normalizedEmail = normalizeEmail(tokenInfo.email());
        return normalizedEmail.split("@")[0];
    }

    private GoogleTokenInfo fetchGoogleTokenInfo(String idToken) {
        String normalizedIdToken = requireText(idToken, "idToken");
        String url = "https://oauth2.googleapis.com/tokeninfo?id_token="
                + URLEncoder.encode(normalizedIdToken, StandardCharsets.UTF_8);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(GOOGLE_HTTP_TIMEOUT)
                .GET()
                .build();

        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_AUTH_UNAVAILABLE", "Google ?몄쬆 ?쒕쾭???곌껐?????놁뒿?덈떎.");
        }

        if (response.statusCode() != 200) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "INVALID_GOOGLE_TOKEN", "Google ?좏겙 寃利앹뿉 ?ㅽ뙣?덉뒿?덈떎.");
        }

        try {
            JsonNode payload = objectMapper.readTree(response.body());
            String subject = payload.path("sub").asText("");
            String audience = payload.path("aud").asText("");
            String issuer = payload.path("iss").asText("");
            String email = payload.path("email").asText("");
            boolean emailVerified = parseBoolean(payload.path("email_verified").asText("false"));
            String name = payload.path("name").asText("");
            return new GoogleTokenInfo(subject, audience, issuer, email, emailVerified, name);
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "GOOGLE_AUTH_UNAVAILABLE", "Google ?묐떟???댁꽍?섏? 紐삵뻽?듬땲??");
        }
    }

    private String normalizeEmail(String email) {
        String normalized = nullableTrim(email).toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(normalized).matches()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "?щ컮瑜??대찓???뺤떇???꾩슂?⑸땲??");
        }
        return normalized;
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 not available", exception);
        }
    }

    private String requireText(String value, String fieldName) {
        String normalized = nullableTrim(value);
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", fieldName + " 媛믪씠 ?꾩슂?⑸땲??");
        }
        return normalized;
    }

    private String nullableTrim(String value) {
        return value == null ? "" : value.trim();
    }

    private boolean parseBoolean(String rawValue) {
        return "true".equalsIgnoreCase(nullableTrim(rawValue));
    }



    public record UserProfile(UUID userId, String name, String email) {
    }

    public record AuthResponse(
            String accessToken,
            Instant accessTokenExpiresAt,
            String refreshToken,
            Instant refreshTokenExpiresAt,
            UserProfile user) {
    }

    private record GoogleTokenInfo(
            String subject,
            String audience,
            String issuer,
            String email,
            boolean emailVerified,
            String name) {
    }
}
