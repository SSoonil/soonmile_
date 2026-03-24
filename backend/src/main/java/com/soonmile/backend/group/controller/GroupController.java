package com.soonmile.backend.group.controller;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

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
import com.soonmile.backend.group.service.GroupService;

@RestController
@Validated
@RequestMapping("/api/v1")
public class GroupController {
    private final GroupService groupService;
    private final AuthService authService;

    public GroupController(GroupService groupService, AuthService authService) {
        this.groupService = groupService;
        this.authService = authService;
    }

    @PostMapping("/groups")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupService.CreateGroupResult createGroup(
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody CreateGroupRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return groupService.createGroup(
                request.name(),
                request.description(),
                request.consent().type(),
                request.consent().agreedVersion(),
                user.userId(),
                user.name());
    }

    @PostMapping("/groups/{groupId}/invites")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupService.CreateInviteResult createInvite(
            @PathVariable UUID groupId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody CreateInviteRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return groupService.createInvite(groupId, user.userId(), request.invitedEmail(), request.expiresInHours());
    }

    @PostMapping("/groups/{groupId}/members/by-email")
    @ResponseStatus(HttpStatus.CREATED)
    public GroupService.AddMemberByEmailResult addMemberByEmail(
            @PathVariable UUID groupId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
            @Valid @RequestBody AddMemberByEmailRequest request) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return groupService.addMemberByEmail(groupId, user.userId(), request.email());
    }

    @PostMapping("/invites/{inviteCode}/accept")
    public GroupService.AcceptInviteResult acceptInvite(
            @PathVariable String inviteCode,
            @Valid @RequestBody AcceptInviteRequest request) {
        return groupService.acceptInvite(inviteCode, request.consent().type(), request.consent().agreedVersion());
    }

    @GetMapping("/groups/{groupId}/members")
    public MembersResponse getMembers(
            @PathVariable UUID groupId,
            @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
        AuthService.UserProfile user = requireAuthenticatedUser(authorizationHeader);
        return new MembersResponse(groupService.getMembers(groupId, user.userId()));
    }

    private AuthService.UserProfile requireAuthenticatedUser(String authorizationHeader) {
        String accessToken = extractBearerToken(authorizationHeader);
        return authService.me(accessToken);
    }

    private String extractBearerToken(String authorizationHeader) {
        if (authorizationHeader == null || authorizationHeader.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "濡쒓렇?몄씠 ?꾩슂?⑸땲??");
        }
        String value = authorizationHeader.trim();
        if (!value.startsWith("Bearer ")) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Bearer ?좏겙 ?뺤떇???꾩슂?⑸땲??");
        }
        String token = value.substring("Bearer ".length()).trim();
        if (token.isBlank()) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?좏겙??鍮꾩뼱 ?덉뒿?덈떎.");
        }
        return token;
    }

    public record ConsentRequest(
            @NotBlank(message = "consent.type? ?꾩닔?낅땲??") String type,
            @NotBlank(message = "consent.agreedVersion? ?꾩닔?낅땲??") String agreedVersion) {
    }

    public record CreateGroupRequest(
            @NotBlank(message = "name? ?꾩닔?낅땲??") String name,
            String description,
            @NotNull(message = "consent???꾩닔?낅땲??") @Valid ConsentRequest consent) {
    }

    public record CreateInviteRequest(
            @NotBlank(message = "invitedEmail is required")
            @Email(message = "invitedEmail ?뺤떇???щ컮瑜댁? ?딆뒿?덈떎.") String invitedEmail,
            Integer expiresInHours) {
    }

    public record AddMemberByEmailRequest(
            @NotBlank(message = "email is required")
            @Email(message = "email format is invalid") String email) {
    }

    public record AcceptInviteRequest(
            @NotNull(message = "consent???꾩닔?낅땲??") @Valid ConsentRequest consent) {
    }

    public record MembersResponse(List<GroupService.MemberItem> items) {
    }
}