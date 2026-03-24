package com.soonmile.backend.auth.persistence;

import java.util.Locale;

public enum AuthProvider {
    LOCAL,
    GOOGLE,
    APPLE,
    KAKAO,
    NAVER;

    public static AuthProvider from(String rawProvider) {
        String normalized = rawProvider == null ? "" : rawProvider.trim();
        if (normalized.isEmpty()) {
            throw new IllegalArgumentException("provider is required");
        }
        return AuthProvider.valueOf(normalized.toUpperCase(Locale.ROOT));
    }
}
