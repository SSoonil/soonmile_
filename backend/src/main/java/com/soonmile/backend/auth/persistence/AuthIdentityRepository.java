package com.soonmile.backend.auth.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentityEntity, UUID> {
    Optional<AuthIdentityEntity> findByProviderAndProviderUserId(AuthProvider provider, String providerUserId);
}
