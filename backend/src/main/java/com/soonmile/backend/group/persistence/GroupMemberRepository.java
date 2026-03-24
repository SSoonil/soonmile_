package com.soonmile.backend.group.persistence;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface GroupMemberRepository extends JpaRepository<GroupMemberEntity, UUID> {
    List<GroupMemberEntity> findByGroup_Id(UUID groupId);

    Optional<GroupMemberEntity> findByGroup_IdAndUser_Id(UUID groupId, UUID userId);

    List<GroupMemberEntity> findByUser_Id(UUID userId);

    long countByGroup_Id(UUID groupId);
}
