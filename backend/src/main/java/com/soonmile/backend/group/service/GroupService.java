package com.soonmile.backend.group.service;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.soonmile.backend.auth.persistence.UserEntity;
import com.soonmile.backend.auth.persistence.UserRepository;
import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.group.persistence.GroupInviteEntity;
import com.soonmile.backend.group.persistence.GroupInviteRepository;
import com.soonmile.backend.group.persistence.GroupMemberEntity;
import com.soonmile.backend.group.persistence.GroupMemberRepository;
import com.soonmile.backend.group.persistence.TravelGroupEntity;
import com.soonmile.backend.group.persistence.TravelGroupRepository;

@Service
public class GroupService {
    private static final String CONSENT_TYPE = "LOCATION_PHOTO_PROCESSING";

    private final SecureRandom random = new SecureRandom();
    private final TravelGroupRepository travelGroupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupInviteRepository groupInviteRepository;
    private final UserRepository userRepository;

    public GroupService(
            TravelGroupRepository travelGroupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupInviteRepository groupInviteRepository,
            UserRepository userRepository) {
        this.travelGroupRepository = travelGroupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.groupInviteRepository = groupInviteRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public CreateGroupResult createGroup(
            String name,
            String description,
            String consentType,
            String agreedVersion,
            UUID ownerUserId,
            String ownerDisplayName) {
        requireConsent(consentType, agreedVersion);
        String normalizedName = requireText(name, "name");
        String normalizedOwnerName = nullableTrim(ownerDisplayName);
        if (ownerUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
        }

        UserEntity owner = userRepository.findById(ownerUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다."));
        Instant now = Instant.now();

        TravelGroupEntity group = new TravelGroupEntity();
        group.setId(UUID.randomUUID());
        group.setName(normalizedName);
        group.setDescription(nullableTrim(description));
        group.setCreatedByUser(owner);
        group.setCreatedAt(now);
        travelGroupRepository.save(group);

        GroupMemberEntity ownerMembership = new GroupMemberEntity();
        ownerMembership.setId(UUID.randomUUID());
        ownerMembership.setGroup(group);
        ownerMembership.setUser(owner);
        ownerMembership.setDisplayName(normalizedOwnerName.isBlank() ? owner.getName() : normalizedOwnerName);
        ownerMembership.setRole("OWNER");
        ownerMembership.setJoinedAt(now);
        groupMemberRepository.save(ownerMembership);

        return new CreateGroupResult(group.getId(), group.getName(), "OWNER");
    }

    @Transactional
    public CreateInviteResult createInvite(UUID groupId, UUID requestedByUserId, String invitedEmail, Integer expiresInHours) {
        if (requestedByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "濡쒓렇?몄씠 ?꾩슂?⑸땲??");
        }
        groupMemberRepository.findByGroup_IdAndUser_Id(groupId, requestedByUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "洹몃９ 珥덈?瑜?留뚮뱾 沅뚰븳???놁뒿?덈떎."));

        TravelGroupEntity group = requireGroup(groupId);
        String normalizedEmail = normalizeEmail(invitedEmail);
        int expiresHours = expiresInHours == null || expiresInHours <= 0 ? 72 : expiresInHours;
        Instant expiresAt = Instant.now().plus(Duration.ofHours(expiresHours));

        GroupInviteEntity invite = new GroupInviteEntity();
        invite.setId(UUID.randomUUID());
        invite.setGroup(group);
        invite.setInvitedEmail(normalizedEmail);
        invite.setInviteCode(generateInviteCode());
        invite.setExpiresAt(expiresAt);
        invite.setAccepted(false);
        groupInviteRepository.save(invite);

        return new CreateInviteResult(
                invite.getId(),
                invite.getInviteCode(),
                "https://soonmile.app/invite/" + invite.getInviteCode(),
                invite.getExpiresAt());
    }

    @Transactional
    public AddMemberByEmailResult addMemberByEmail(UUID groupId, UUID requestedByUserId, String memberEmail) {
        if (requestedByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "로그인이 필요합니다.");
        }

        TravelGroupEntity group = requireGroup(groupId);
        groupMemberRepository.findByGroup_IdAndUser_Id(groupId, requestedByUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "해당 그룹에 멤버를 추가할 권한이 없습니다."));

        String normalizedEmail = normalizeEmail(memberEmail);
        UserEntity targetUser = userRepository.findByEmail(normalizedEmail)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "서비스에 가입된 이메일이 아닙니다."));

        GroupMemberEntity membership = groupMemberRepository.findByGroup_IdAndUser_Id(groupId, targetUser.getId())
                .orElse(null);
        boolean alreadyMember = membership != null;

        if (!alreadyMember) {
            membership = new GroupMemberEntity();
            membership.setId(UUID.randomUUID());
            membership.setGroup(group);
            membership.setUser(targetUser);
            membership.setDisplayName(nullableTrim(targetUser.getName()).isBlank() ? deriveDisplayName(targetUser.getEmail()) : targetUser.getName());
            membership.setRole("MEMBER");
            membership.setJoinedAt(Instant.now());
            membership = groupMemberRepository.save(membership);
        }

        int memberCount = Math.toIntExact(groupMemberRepository.countByGroup_Id(groupId));
        return new AddMemberByEmailResult(
                targetUser.getId(),
                nullableTrim(membership.getDisplayName()).isBlank() ? targetUser.getName() : membership.getDisplayName(),
                targetUser.getEmail(),
                membership.getRole(),
                alreadyMember,
                memberCount);
    }

    @Transactional
    public AcceptInviteResult acceptInvite(String inviteCode, String consentType, String agreedVersion) {
        requireConsent(consentType, agreedVersion);
        GroupInviteEntity invite = groupInviteRepository.findByInviteCode(requireText(inviteCode, "inviteCode"))
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "초대 코드를 찾을 수 없습니다."));

        if (invite.getExpiresAt().isBefore(Instant.now())) {
            throw new ApiException(HttpStatus.CONFLICT, "INVITE_EXPIRED", "초대가 만료되었습니다.");
        }

        if (!invite.isAccepted()) {
            UserEntity invitee = upsertInvitee(invite.getInvitedEmail());
            boolean alreadyJoined = groupMemberRepository
                    .findByGroup_IdAndUser_Id(invite.getGroup().getId(), invitee.getId())
                    .isPresent();
            if (!alreadyJoined) {
                GroupMemberEntity membership = new GroupMemberEntity();
                membership.setId(UUID.randomUUID());
                membership.setGroup(invite.getGroup());
                membership.setUser(invitee);
                membership.setDisplayName(invitee.getName());
                membership.setRole("MEMBER");
                membership.setJoinedAt(Instant.now());
                groupMemberRepository.save(membership);
            }
            invite.setAccepted(true);
            invite.setAcceptedAt(Instant.now());
            invite.setAcceptedUser(invitee);
            groupInviteRepository.save(invite);
        }

        return new AcceptInviteResult(invite.getGroup().getId(), "MEMBER", invite.getAcceptedAt());
    }

    @Transactional(readOnly = true)
    public List<MemberItem> getMembers(UUID groupId, UUID requestedByUserId) {
        if (requestedByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "濡쒓렇?몄씠 ?꾩슂?⑸땲??");
        }
        groupMemberRepository.findByGroup_IdAndUser_Id(groupId, requestedByUserId)
                .orElseThrow(() -> new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "洹몃９ 硫ㅻ쾭 紐⑸줉???덉쓣 沅뚰븳???놁뒿?덈떎."));

        requireGroup(groupId);
        return groupMemberRepository.findByGroup_Id(groupId).stream()
                .sorted(Comparator.comparing(GroupMemberEntity::getRole).thenComparing(GroupMemberEntity::getDisplayName))
                .map(member -> new MemberItem(member.getUser().getId(), member.getDisplayName(), member.getRole()))
                .toList();
    }

    @Transactional(readOnly = true)
    public void validateGroupExists(UUID groupId) {
        if (!travelGroupRepository.existsById(groupId)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "groupId를 찾을 수 없습니다.");
        }
    }

    private TravelGroupEntity requireGroup(UUID groupId) {
        return travelGroupRepository.findById(groupId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "groupId를 찾을 수 없습니다."));
    }

    private UserEntity upsertInvitee(String invitedEmail) {
        String normalizedEmail = nullableTrim(invitedEmail).toLowerCase(Locale.ROOT);
        return userRepository.findByEmail(normalizedEmail)
                .orElseGet(() -> {
                    Instant now = Instant.now();
                    UserEntity user = new UserEntity();
                    user.setId(UUID.randomUUID());
                    user.setEmail(normalizedEmail);
                    user.setName(deriveDisplayName(normalizedEmail));
                    user.setCreatedAt(now);
                    user.setUpdatedAt(now);
                    return userRepository.save(user);
                });
    }

    private String generateInviteCode() {
        final String chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        String code;
        do {
            StringBuilder builder = new StringBuilder();
            for (int index = 0; index < 10; index++) {
                builder.append(chars.charAt(random.nextInt(chars.length())));
            }
            code = builder.toString();
        } while (groupInviteRepository.existsByInviteCode(code));
        return code;
    }

    private String deriveDisplayName(String email) {
        if (email == null || !email.contains("@")) {
            return "Member";
        }
        String local = email.substring(0, email.indexOf('@')).trim();
        if (local.isBlank()) {
            return "Member";
        }
        return Character.toUpperCase(local.charAt(0)) + local.substring(1);
    }

    private String normalizeEmail(String email) {
        String normalized = nullableTrim(email).toLowerCase(Locale.ROOT);
        if (normalized.isBlank() || !normalized.contains("@")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "이메일 형식이 올바르지 않습니다.");
        }
        return normalized;
    }

    private void requireConsent(String consentType, String agreedVersion) {
        String normalizedType = nullableTrim(consentType);
        String normalizedVersion = nullableTrim(agreedVersion);
        if (normalizedType.isBlank() || normalizedVersion.isBlank()) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CONSENT_REQUIRED", "동의 정보가 필요합니다.");
        }
        if (!CONSENT_TYPE.equals(normalizedType)) {
            throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, "CONSENT_REQUIRED", "지원하지 않는 동의 타입입니다.");
        }
    }

    private String requireText(String value, String fieldName) {
        String normalized = nullableTrim(value);
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", fieldName + " 값이 필요합니다.");
        }
        return normalized;
    }

    private String nullableTrim(String value) {
        return value == null ? "" : value.trim();
    }

    public record CreateGroupResult(UUID groupId, String name, String myRole) {
    }

    public record CreateInviteResult(UUID inviteId, String inviteCode, String inviteUrl, Instant expiresAt) {
    }

    public record AddMemberByEmailResult(
            UUID memberUserId,
            String memberName,
            String memberEmail,
            String memberRole,
            boolean alreadyMember,
            int memberCount) {
    }

    public record AcceptInviteResult(UUID groupId, String myRole, Instant joinedAt) {
    }

    public record MemberItem(UUID userId, String displayName, String role) {
    }
}
