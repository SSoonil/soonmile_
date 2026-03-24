package com.soonmile.backend.admin.controller;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.HttpStatus;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.soonmile.backend.admin.service.AdminUserService;
import com.soonmile.backend.auth.persistence.UserRole;
import com.soonmile.backend.auth.persistence.UserStatus;
import com.soonmile.backend.common.ApiException;

@RestController
@Validated
@RequestMapping("/api/v1/admin/users")
public class AdminUserController {
    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    @GetMapping
    public AdminUsersResponse listUsers() {
        return new AdminUsersResponse(adminUserService.listUsers());
    }

    @PatchMapping("/{userId}/role")
    public AdminUserService.AdminUserView updateRole(
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateUserRoleRequest request) {
        return adminUserService.updateRole(userId, parseRole(request.role()));
    }

    @PatchMapping("/{userId}/status")
    public AdminUserService.AdminUserView updateStatus(
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateUserStatusRequest request) {
        return adminUserService.updateStatus(userId, parseStatus(request.status()));
    }

    private UserRole parseRole(String rawRole) {
        try {
            return UserRole.valueOf(rawRole.trim().toUpperCase(Locale.ROOT));
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Unsupported role value.");
        }
    }

    private UserStatus parseStatus(String rawStatus) {
        try {
            return UserStatus.valueOf(rawStatus.trim().toUpperCase(Locale.ROOT));
        } catch (Exception exception) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "Unsupported status value.");
        }
    }

    public record AdminUsersResponse(List<AdminUserService.AdminUserView> items) {
    }

    public record UpdateUserRoleRequest(@NotBlank(message = "role is required") String role) {
    }

    public record UpdateUserStatusRequest(@NotBlank(message = "status is required") String status) {
    }
}
