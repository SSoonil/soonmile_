package com.soonmile.backend.group.persistence;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupInviteRepository extends JpaRepository<GroupInviteEntity, UUID> {
    boolean existsByInviteCode(String inviteCode);

    Optional<GroupInviteEntity> findByInviteCode(String inviteCode);
}
