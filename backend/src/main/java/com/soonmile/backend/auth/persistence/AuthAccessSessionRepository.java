package com.soonmile.backend.auth.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthAccessSessionRepository extends JpaRepository<AuthAccessSessionEntity, UUID> {
    Optional<AuthAccessSessionEntity> findByTokenHash(String tokenHash);

    void deleteByRefreshSessionId(UUID refreshSessionId);
}
