package com.soonmile.backend.auth.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthRefreshSessionRepository extends JpaRepository<AuthRefreshSessionEntity, UUID> {
    Optional<AuthRefreshSessionEntity> findByTokenHash(String tokenHash);
}
