package com.soonmile.backend.admin.service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.soonmile.backend.auth.persistence.UserEntity;
import com.soonmile.backend.auth.persistence.UserRepository;
import com.soonmile.backend.auth.persistence.UserRole;
import com.soonmile.backend.auth.persistence.UserStatus;
import com.soonmile.backend.common.ApiException;

@Service
public class AdminUserService {
    private final UserRepository userRepository;

    public AdminUserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public List<AdminUserView> listUsers() {
        return userRepository.findAll(Sort.by(Sort.Direction.ASC, "createdAt")).stream()
                .map(this::toView)
                .toList();
    }

    @Transactional
    public AdminUserView updateRole(UUID userId, UserRole role) {
        UserEntity user = requireUser(userId);
        user.setRole(role);
        user.setUpdatedAt(Instant.now());
        return toView(userRepository.save(user));
    }

    @Transactional
    public AdminUserView updateStatus(UUID userId, UserStatus status) {
        UserEntity user = requireUser(userId);
        user.setStatus(status);
        user.setUpdatedAt(Instant.now());
        return toView(userRepository.save(user));
    }

    private UserEntity requireUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "User not found."));
    }

    private AdminUserView toView(UserEntity entity) {
        return new AdminUserView(
                entity.getId(),
                entity.getName(),
                entity.getEmail(),
                entity.getRole(),
                entity.getStatus(),
                entity.getCreatedAt(),
                entity.getUpdatedAt());
    }

    public record AdminUserView(
            UUID userId,
            String name,
            String email,
            UserRole role,
            UserStatus status,
            Instant createdAt,
            Instant updatedAt) {
    }
}
