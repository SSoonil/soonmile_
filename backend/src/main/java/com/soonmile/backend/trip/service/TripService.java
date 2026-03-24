/*
 * Decompiled with CFR 0.152.
 * 
 * Could not load the following classes:
 *  com.drew.imaging.ImageMetadataReader
 *  com.drew.lang.GeoLocation
 *  com.drew.metadata.Metadata
 *  com.drew.metadata.exif.ExifIFD0Directory
 *  com.drew.metadata.exif.ExifSubIFDDirectory
 *  com.drew.metadata.exif.GpsDirectory
 *  org.springframework.http.HttpStatus
 *  org.springframework.stereotype.Service
 *  org.springframework.transaction.annotation.Transactional
 *  org.springframework.web.multipart.MultipartFile
 */
package com.soonmile.backend.trip.service;

import com.drew.imaging.ImageMetadataReader;
import com.drew.lang.GeoLocation;
import com.drew.metadata.Metadata;
import com.drew.metadata.exif.ExifIFD0Directory;
import com.drew.metadata.exif.ExifSubIFDDirectory;
import com.drew.metadata.exif.GpsDirectory;
import com.soonmile.backend.auth.persistence.UserEntity;
import com.soonmile.backend.auth.persistence.UserRole;
import com.soonmile.backend.auth.persistence.UserRepository;
import com.soonmile.backend.auth.persistence.UserStatus;
import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.group.persistence.GroupMemberRepository;
import com.soonmile.backend.group.persistence.TravelGroupEntity;
import com.soonmile.backend.group.persistence.TravelGroupRepository;
import com.soonmile.backend.group.service.GroupService;
import com.soonmile.backend.trip.persistence.TripEntity;
import com.soonmile.backend.trip.persistence.TripMemberEntity;
import com.soonmile.backend.trip.persistence.TripMemberRepository;
import com.soonmile.backend.trip.persistence.TripPhotoEntity;
import com.soonmile.backend.trip.persistence.TripPhotoRepository;
import com.soonmile.backend.trip.persistence.TripPinEntity;
import com.soonmile.backend.trip.persistence.TripPinRepository;
import com.soonmile.backend.trip.persistence.TripRepository;
import java.io.InputStream;
import java.nio.file.FileVisitOption;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileAttribute;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Date;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class TripService {
    private static final int CLUSTER_RULE_METERS = 300;
    private static final String DEFAULT_TRIP_PIN_COLOR = "#FF8B24";
    private static final DateTimeFormatter PIN_TITLE_TIME_FORMAT = DateTimeFormatter.ofPattern("MM.dd HH:mm").withZone(ZoneId.systemDefault());
    private final GroupService groupService;
    private final GroupMemberRepository groupMemberRepository;
    private final TravelGroupRepository travelGroupRepository;
    private final TripPinRepository tripPinRepository;
    private final TripPhotoRepository tripPhotoRepository;
    private final TripRepository tripRepository;
    private final TripMemberRepository tripMemberRepository;
    private final UserRepository userRepository;
    private final Path photoStorageRoot;
    private final Map<UUID, TripState> trips = new LinkedHashMap<UUID, TripState>();

    public TripService(GroupService groupService, GroupMemberRepository groupMemberRepository, TravelGroupRepository travelGroupRepository, TripPinRepository tripPinRepository, TripPhotoRepository tripPhotoRepository, TripRepository tripRepository, TripMemberRepository tripMemberRepository, UserRepository userRepository) {
        this.groupService = groupService;
        this.groupMemberRepository = groupMemberRepository;
        this.travelGroupRepository = travelGroupRepository;
        this.tripPinRepository = tripPinRepository;
        this.tripPhotoRepository = tripPhotoRepository;
        this.tripRepository = tripRepository;
        this.tripMemberRepository = tripMemberRepository;
        this.userRepository = userRepository;
        this.photoStorageRoot = Paths.get("uploads", "trip-photos").toAbsolutePath().normalize();
        try {
            Files.createDirectories(this.photoStorageRoot, new FileAttribute[0]);
        }
        catch (Exception exception) {
            throw new IllegalStateException("Failed to initialize local photo storage directory.", exception);
        }
    }

    @Transactional
    public synchronized CreateTripResult createTrip(
            UUID groupId,
            String name,
            LocalDate startDate,
            LocalDate endDate,
            String pinColor,
            UUID createdByUserId) {
        this.groupService.validateGroupExists(groupId);
        String normalizedName = this.requireText(name, "name");
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "endDate??startDate ??????\ubc38\ube36????????\uafd4\uae82??????");
        }
        if (createdByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u7672??\uf9ab???\u8f45\ubdbd\ud2d3?????\ub431\uae62???????\u8adb\uba83\ub9c8????\uafd4\uae82??????");
        }
        TravelGroupEntity group = (TravelGroupEntity)this.travelGroupRepository.findById(groupId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "groupId???\u9954\ub085\ub5bd???????????????\uae45\uc9bd????????\ub181\uc844."));
        UserEntity creator = (UserEntity)this.userRepository.findById(createdByUserId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u7672??\uf9ab???\u8f45\ubdbd\ud2d3?????\ub431\uae62???????\u8adb\uba83\ub9c8????\uafd4\uae82??????"));
        if (this.groupMemberRepository.findByGroup_IdAndUser_Id(groupId, createdByUserId).isEmpty()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "You are not a member of this group.");
        }
        Instant now = Instant.now();
        UUID tripId = UUID.randomUUID();
        TripEntity tripEntity = new TripEntity();
        tripEntity.setId(tripId);
        tripEntity.setGroup(group);
        tripEntity.setName(normalizedName);
        tripEntity.setStartDate(startDate);
        tripEntity.setEndDate(endDate);
        tripEntity.setPinColor(this.normalizeTripPinColor(pinColor, DEFAULT_TRIP_PIN_COLOR));
        tripEntity.setCreatedByUser(creator);
        tripEntity.setCreatedAt(now);
        tripEntity.setUpdatedAt(now);
        this.tripRepository.save(tripEntity);
        TripMemberEntity ownerMembership = new TripMemberEntity();
        ownerMembership.setId(UUID.randomUUID());
        ownerMembership.setTrip(tripEntity);
        ownerMembership.setUser(creator);
        ownerMembership.setRole("OWNER");
        ownerMembership.setJoinedAt(now);
        this.tripMemberRepository.save(ownerMembership);
        this.trips.put(tripId, new TripState(tripId, groupId, normalizedName, startDate, endDate));
        return new CreateTripResult(tripId, normalizedName, tripEntity.getPinColor());
    }

    @Transactional(readOnly=true)
    public synchronized List<TripSummary> listTripsByUser(UUID userId) {
        if (userId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u7672??\uf9ab???\u8f45\ubdbd\ud2d3?????\ub431\uae62???????\u8adb\uba83\ub9c8????\uafd4\uae82??????");
        }
        this.userRepository.findById(userId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u7672??\uf9ab???\u8f45\ubdbd\ud2d3?????\ub431\uae62???????\u8adb\uba83\ub9c8????\uafd4\uae82??????"));
        List<TripMemberEntity> tripMemberships = this.tripMemberRepository.findByUser_Id(userId);
        Set<UUID> memberTripIds = tripMemberships.stream()
                .map(membership -> membership.getTrip().getId())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<UUID, String> myRoleByTripId = tripMemberships.stream()
                .collect(Collectors.toMap(
                        membership -> membership.getTrip().getId(),
                        TripMemberEntity::getRole,
                        (left, right) -> left,
                        LinkedHashMap::new));
        List<TripEntity> createdTrips = this.tripRepository.findByCreatedByUser_IdOrderByUpdatedAtDesc(userId);
        LinkedHashSet<UUID> tripIds = new LinkedHashSet<>();
        createdTrips.forEach(trip -> tripIds.add(trip.getId()));
        tripIds.addAll(memberTripIds);
        if (tripIds.isEmpty()) {
            return List.of();
        }
        List<TripEntity> entities = this.tripRepository.findByIdInOrderByUpdatedAtDesc(new ArrayList<UUID>(tripIds));
        Map<UUID, Integer> memberCountByTripId = entities.stream().collect(Collectors.toMap(TripEntity::getId, entity -> {
            long count = this.tripMemberRepository.countByTrip_Id(entity.getId());
            return count <= 0L ? 1 : Math.toIntExact(count);
        }, (left, right) -> left, LinkedHashMap::new));
        return entities.stream().map(entity -> new TripSummary(
                entity.getId(),
                entity.getGroup().getId(),
                entity.getName(),
                entity.getStartDate(),
                entity.getEndDate(),
                memberCountByTripId.getOrDefault(entity.getId(), 1),
                myRoleByTripId.getOrDefault(entity.getId(), Objects.equals(entity.getCreatedByUser().getId(), userId) ? "OWNER" : "MEMBER"),
                entity.getPinColor(),
                entity.getUpdatedAt(),
                entity.getCreatedAt())).toList();
    }

    @Transactional(readOnly=true)
    public synchronized TripMembersResponse listTripMembers(UUID tripId, UUID requestedByUserId) {
        this.requireTripAccess(tripId, requestedByUserId);
        List<TripMemberItem> items = this.tripMemberRepository.findByTrip_IdOrderByJoinedAtAsc(tripId).stream().map(member -> {
            UserEntity user = member.getUser();
            String email = this.nullableTrim(user.getEmail()).toLowerCase(Locale.ROOT);
            String fallbackName = email.isBlank() ? "member" : email.split("@")[0];
            String name = this.nullableTrim(user.getName()).isBlank() ? fallbackName : user.getName();
            return new TripMemberItem(user.getId(), name, email, this.nullableTrim(member.getRole()), member.getJoinedAt());
        }).toList();
        return new TripMembersResponse(items);
    }

    @Transactional(readOnly=true)
    public synchronized void validateTripAccess(UUID tripId, UUID requestedByUserId) {
        this.requireTripAccess(tripId, requestedByUserId);
    }

    @Transactional
    public synchronized UpdateTripResult updateTrip(
            UUID tripId,
            String name,
            LocalDate startDate,
            LocalDate endDate,
            String pinColor,
            UUID updatedByUserId) {
        String normalizedName = this.requireText(name, "name");
        if (startDate != null && endDate != null && endDate.isBefore(startDate)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "endDate must be on or after startDate.");
        }
        TripEntity tripEntity = this.requireTripAccess(tripId, updatedByUserId);
        String normalizedPinColor = this.normalizeTripPinColor(pinColor, tripEntity.getPinColor());
        tripEntity.setName(normalizedName);
        tripEntity.setStartDate(startDate);
        tripEntity.setEndDate(endDate);
        tripEntity.setPinColor(normalizedPinColor);
        Instant now = Instant.now();
        tripEntity.setUpdatedAt(now);
        this.tripRepository.save(tripEntity);
        TripState existing = this.trips.get(tripId);
        if (existing != null) {
            TripState updated = new TripState(existing.id, existing.groupId, normalizedName, startDate, endDate);
            updated.photos.putAll(existing.photos);
            updated.pins.putAll(existing.pins);
            this.trips.put(tripId, updated);
        }
        return new UpdateTripResult(
                tripEntity.getId(),
                tripEntity.getName(),
                tripEntity.getStartDate(),
                tripEntity.getEndDate(),
                tripEntity.getPinColor(),
                now);
    }

    @Transactional
    public synchronized void deleteTrip(UUID tripId, UUID requestedByUserId) {
        if (requestedByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u03b2\ub3e6\u88d5??\u7b4c\ub93e\uc474\u903e??\u71ac\uace3\ubad7???\uf9cf\uaeca\ud275??");
        }
        if (!this.userRepository.existsById(requestedByUserId)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u03b2\ub3e6\u88d5??\u7b4c\ub93e\uc474\u903e??\u71ac\uace3\ubad7???\uf9cf\uaeca\ud275??");
        }
        TripEntity tripEntity = (TripEntity)this.tripRepository.findById(tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "tripId not found."));
        TripMemberEntity membership = this.tripMemberRepository.findByTrip_IdAndUser_Id(tripId, requestedByUserId).orElse(null);
        boolean isOwner = membership != null && "OWNER".equalsIgnoreCase(this.nullableTrim(membership.getRole()));
        boolean isCreator = Objects.equals(tripEntity.getCreatedByUser().getId(), requestedByUserId);
        if (!isOwner && !isCreator) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "??\u7b4c???????\u96c5?\uad5d??\ub1e1????\u6028\ub8f8????\ub348\ud3b2.");
        }
        this.tripRepository.delete(tripEntity);
        this.trips.remove(tripId);
        this.deleteTripPhotoDirectory(tripId);
    }

    @Transactional
    public synchronized AddTripMemberResult addMemberByEmail(UUID tripId, UUID requestedByUserId, String memberEmail) {
        long memberCountRaw;
        boolean alreadyMember;
        boolean isOwner;
        if (requestedByUserId == null) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "?\u03b2\ub3e6\u88d5??\u7b4c\ub93e\uc474\u903e??\u71ac\uace3\ubad7???\uf9cf\uaeca\ud275??");
        }
        TripEntity tripEntity = (TripEntity)this.tripRepository.findById(tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "tripId not found."));
        TripMemberEntity requesterMembership = this.tripMemberRepository.findByTrip_IdAndUser_Id(tripId, requestedByUserId).orElse(null);
        boolean isCreator = Objects.equals(tripEntity.getCreatedByUser().getId(), requestedByUserId);
        boolean bl = isOwner = requesterMembership != null && "OWNER".equalsIgnoreCase(this.nullableTrim(requesterMembership.getRole()));
        if (!isCreator && !isOwner) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "???????\u7b4c????????\u8cab????\u96c5?\uad5d??\ub1e1????\u6028\ub8f8????\ub348\ud3b2.");
        }
        String normalizedEmail = this.nullableTrim(memberEmail).toLowerCase(Locale.ROOT);
        if (normalizedEmail.isBlank() || !normalizedEmail.contains("@")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "???\u7b4c???\u7b4c\uba26\ub047\uf9d1??????\uf9cf?? ???\uc6a9????\ub348\ud3b2.");
        }
        UserEntity targetUser = this.userRepository.findByEmail(normalizedEmail).orElseGet(() -> this.createPlaceholderUser(normalizedEmail));
        TripMemberEntity membership = this.tripMemberRepository.findByTrip_IdAndUser_Id(tripId, targetUser.getId()).orElse(null);
        boolean bl2 = alreadyMember = membership != null;
        if (!alreadyMember) {
            membership = new TripMemberEntity();
            membership.setId(UUID.randomUUID());
            membership.setTrip(tripEntity);
            membership.setUser(targetUser);
            membership.setRole("MEMBER");
            membership.setJoinedAt(Instant.now());
            membership = (TripMemberEntity)this.tripMemberRepository.save(membership);
        }
        int memberCount = (memberCountRaw = this.tripMemberRepository.countByTrip_Id(tripId)) <= 0L ? 1 : Math.toIntExact(memberCountRaw);
        return new AddTripMemberResult(targetUser.getId(), this.nullableTrim(targetUser.getName()).isBlank() ? normalizedEmail : targetUser.getName(), targetUser.getEmail(), membership.getRole(), alreadyMember, memberCount);
    }

    @Transactional
    public synchronized UploadPhotosResult uploadPhotos(UUID tripId, UUID requestedByUserId, List<MultipartFile> files) {
        String uploadedBy;
        TripState trip = this.requireTrip(tripId);
        TripEntity tripEntity = this.requireTripAccess(tripId, requestedByUserId);
        UserEntity requestedByUser = (UserEntity)this.userRepository.findById(requestedByUserId).orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Authentication is required."));
        String string = uploadedBy = this.nullableTrim(requestedByUser.getName()).isBlank() ? this.nullableTrim(requestedByUser.getEmail()) : requestedByUser.getName();
        if (uploadedBy.isBlank()) {
            uploadedBy = "Member";
        }
        if (files == null || files.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "????\u91ce?????????????\u8f45\ubdbd\ud2d3??????\u30eb\ubd3f?? ?????\uc6b1\ub8cf???????\ub086\uc835.");
        }
        Map pinEntityById = this.tripPinRepository.findByTrip_IdOrderByCreatedAtAsc(tripId).stream().collect(Collectors.toMap(TripPinEntity::getId, entity -> entity, (left, right) -> left, LinkedHashMap::new));
        ArrayList<UUID> photoIds = new ArrayList<UUID>();
        int pinIndexSeed = trip.pins.size();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty()) continue;
            UUID photoId = UUID.randomUUID();
            Instant fallbackTakenAt = Instant.now().minus(Duration.ofMinutes(photoIds.size()));
            PhotoMetadata metadata = this.extractPhotoMetadata(file, fallbackTakenAt);
            StoredPhoto storedPhoto = this.storePhotoFile(tripId, photoId, file);
            PhotoState photo = new PhotoState(photoId, storedPhoto.originalFileName(), storedPhoto.publicUrl(), metadata.takenAt(), uploadedBy);
            if (metadata.lat() != null && metadata.lng() != null) {
                PinState pin = this.findBestPinForPhoto(trip, metadata.lat(), metadata.lng()).orElse(null);
                if (pin == null) {
                    pin = this.createMetadataPin(trip, metadata.lat(), metadata.lng(), metadata.takenAt(), ++pinIndexSeed);
                }
                photo.pinId = pin.pinId;
                if (!pinEntityById.containsKey(pin.pinId)) {
                    TripPinEntity savedPinEntity = this.upsertPinEntity(tripEntity, pin, Instant.now());
                    pinEntityById.put(savedPinEntity.getId(), savedPinEntity);
                }
                photo.unresolved = false;
                photo.unresolvedReason = metadata.timeMissing() ? "NO_EXIF_CAPTURE_TIME" : null;
            } else {
                photo.unresolved = true;
                photo.unresolvedReason = metadata.parseFailed() ? "METADATA_PARSE_FAILED" : "NO_EXIF_GPS";
            }
            trip.photos.put(photoId, photo);
            photoIds.add(photoId);
            TripPhotoEntity photoEntity = new TripPhotoEntity();
            photoEntity.setId(photoId);
            photoEntity.setTrip(tripEntity);
            photoEntity.setPin(photo.pinId == null ? null : (TripPinEntity)pinEntityById.get(photo.pinId));
            photoEntity.setFileName(storedPhoto.originalFileName());
            photoEntity.setFilePath(storedPhoto.absolutePath());
            photoEntity.setThumbnailUrl(storedPhoto.publicUrl());
            photoEntity.setTakenAt(photo.takenAt);
            photoEntity.setUploadedBy(photo.uploadedBy);
            photoEntity.setUnresolved(photo.unresolved);
            photoEntity.setUnresolvedReason(photo.unresolvedReason);
            photoEntity.setCreatedAt(Instant.now());
            this.tripPhotoRepository.save(photoEntity);
        }
        this.recalculatePinAggregates(trip);
        return new UploadPhotosResult(photoIds.size(), photoIds, "?????\u8f45\ubdbd\ud2d3?????????????? ???\u6028\uc02b\ubb9d\uf98a??????????\u7672????\u6028\uc02b\ubb9d\uf98a?\u904a\ube00\ube4a???????????\ub086\uc835.");
    }

    public synchronized PinsResult getPins(UUID tripId, boolean includeRoute) {
        TripState trip = this.requireTrip(tripId);
        this.recalculatePinAggregates(trip);
        List<PinView> pins = trip.pins.values().stream().sorted(Comparator.comparing(pin -> pin.representativeTakenAt, Comparator.nullsLast(Comparator.naturalOrder()))).map(pin -> new PinView(pin.pinId, pin.lat, pin.lng, pin.photoCount, pin.representativeTakenAt, pin.title, pin.caption)).toList();
        List<RouteItem> route = includeRoute ? this.buildRoute(pins) : List.of();
        return new PinsResult(300, pins, route);
    }

    public synchronized PinPhotosResult getPinPhotos(UUID tripId, UUID pinId) {
        TripState trip = this.requireTrip(tripId);
        PinState pin = this.requirePin(trip, pinId);
        List<PinPhotoItem> items = trip.photos.values().stream().filter(photo -> Objects.equals(photo.pinId, pin.pinId)).sorted(Comparator.comparing(photo -> photo.takenAt, Comparator.nullsLast(Comparator.naturalOrder()))).map(photo -> new PinPhotoItem(photo.photoId, photo.thumbnailUrl, photo.takenAt, photo.uploadedBy)).toList();
        return new PinPhotosResult(pin.pinId, items);
    }

    public synchronized UnresolvedResult getUnresolvedPhotos(UUID tripId) {
        TripState trip = this.requireTrip(tripId);
        List<UnresolvedPhotoItem> items = trip.photos.values().stream().filter(photo -> photo.unresolved).map(photo -> new UnresolvedPhotoItem(photo.photoId, photo.thumbnailUrl, photo.unresolvedReason)).toList();
        return new UnresolvedResult(items);
    }

    @Transactional
    public synchronized ManualAssignmentResult assignPhotos(UUID tripId, List<UUID> photoIds, ManualTarget target) {
        PinState targetPin;
        TripState trip = this.requireTrip(tripId);
        TripEntity tripEntity = (TripEntity)this.tripRepository.findById(tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "tripId not found."));
        if (photoIds == null || photoIds.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "photoIds must not be empty.");
        }
        Map pinEntityById = this.tripPinRepository.findByTrip_IdOrderByCreatedAtAsc(tripId).stream().collect(Collectors.toMap(TripPinEntity::getId, entity -> entity, (left, right) -> left, LinkedHashMap::new));
        String type = this.requireText(target.type(), "target.type").toUpperCase(Locale.ROOT);
        if ("EXISTING_PIN".equals(type)) {
            if (target.pinId() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "pinId is required for EXISTING_PIN.");
            }
            targetPin = this.requirePin(trip, target.pinId());
            if (!pinEntityById.containsKey(targetPin.pinId)) {
                TripPinEntity loadedPinEntity = this.tripPinRepository.findByIdAndTrip_Id(targetPin.pinId, tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "pinId not found."));
                pinEntityById.put(loadedPinEntity.getId(), loadedPinEntity);
            }
        } else if ("NEW_PIN".equals(type)) {
            if (target.lat() == null || target.lng() == null) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "lat/lng is required for NEW_PIN.");
            }
            String targetTitle = this.nullableTrim(target.title());
            targetPin = new PinState(UUID.randomUUID(), target.lat(), target.lng(), targetTitle.isBlank() ? "Manual pin" : targetTitle, "Manually assigned");
            trip.pins.put(targetPin.pinId, targetPin);
            TripPinEntity savedPinEntity = this.upsertPinEntity(tripEntity, targetPin, Instant.now());
            pinEntityById.put(savedPinEntity.getId(), savedPinEntity);
        } else {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", "target.type must be EXISTING_PIN or NEW_PIN.");
        }
        int assignedCount = 0;
        for (UUID photoId : photoIds) {
            PhotoState photo2 = trip.photos.get(photoId);
            if (photo2 == null) {
                throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "photoId not found: " + String.valueOf(photoId));
            }
            photo2.pinId = targetPin.pinId;
            photo2.unresolved = false;
            photo2.unresolvedReason = null;
            ++assignedCount;
            TripPhotoEntity photoEntity = this.tripPhotoRepository.findByIdAndTrip_Id(photoId, tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "photoId not found: " + String.valueOf(photoId)));
            photoEntity.setPin((TripPinEntity)pinEntityById.get(targetPin.pinId));
            photoEntity.setUnresolved(false);
            photoEntity.setUnresolvedReason(null);
            this.tripPhotoRepository.save(photoEntity);
        }
        this.recalculatePinAggregates(trip);
        int unresolvedRemaining = (int)trip.photos.values().stream().filter(photo -> photo.unresolved).count();
        return new ManualAssignmentResult(assignedCount, unresolvedRemaining);
    }

    @Transactional
    public synchronized UpdatePinResult updatePin(UUID tripId, UUID pinId, String title, String caption) {
        String normalizedCaption;
        String normalizedTitle;
        TripState trip = this.requireTrip(tripId);
        PinState pin = this.requirePin(trip, pinId);
        if (title != null && !(normalizedTitle = this.nullableTrim(title)).isBlank()) {
            pin.title = normalizedTitle;
        }
        if (caption != null && !(normalizedCaption = this.nullableTrim(caption)).isBlank()) {
            pin.caption = normalizedCaption;
        }
        TripPinEntity pinEntity = this.tripPinRepository.findByIdAndTrip_Id(pinId, tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "pinId not found."));
        pinEntity.setTitle(pin.title);
        pinEntity.setCaption(pin.caption);
        pinEntity.setUpdatedAt(Instant.now());
        this.tripPinRepository.save(pinEntity);
        return new UpdatePinResult(pin.pinId, pin.title, pin.caption);
    }

    public synchronized AiContext getAiContext(UUID tripId) {
        TripState trip = this.requireTrip(tripId);
        this.recalculatePinAggregates(trip);
        List<PinView> pins = trip.pins.values().stream().sorted(Comparator.comparing(pin -> pin.representativeTakenAt, Comparator.nullsLast(Comparator.naturalOrder()))).map(pin -> new PinView(pin.pinId, pin.lat, pin.lng, pin.photoCount, pin.representativeTakenAt, pin.title, pin.caption)).toList();
        List<PhotoForAi> photos = trip.photos.values().stream().map(photo -> new PhotoForAi(photo.photoId, photo.pinId, photo.unresolved, photo.unresolvedReason)).toList();
        List<UnresolvedPhotoItem> unresolved = trip.photos.values().stream().filter(photo -> photo.unresolved).map(photo -> new UnresolvedPhotoItem(photo.photoId, photo.thumbnailUrl, photo.unresolvedReason)).toList();
        return new AiContext(trip.id, pins, photos, unresolved);
    }

    private PhotoMetadata extractPhotoMetadata(MultipartFile file, Instant fallbackTakenAt) {
        try (InputStream inputStream = file.getInputStream()) {
            GeoLocation geoLocation;
            Metadata metadata = ImageMetadataReader.readMetadata((InputStream)inputStream);
            Double lat = null;
            Double lng = null;
            GpsDirectory gpsDirectory = (GpsDirectory)metadata.getFirstDirectoryOfType(GpsDirectory.class);
            if (gpsDirectory != null && (geoLocation = gpsDirectory.getGeoLocation()) != null && !geoLocation.isZero()) {
                lat = geoLocation.getLatitude();
                lng = geoLocation.getLongitude();
            }
            Instant takenAt = this.extractTakenAt(metadata, fallbackTakenAt);
            boolean timeMissing = takenAt.equals(fallbackTakenAt);
            return new PhotoMetadata(lat, lng, takenAt, timeMissing, false);
        }
        catch (Exception exception) {
            return new PhotoMetadata(null, null, fallbackTakenAt, true, true);
        }
    }

    private Instant extractTakenAt(Metadata metadata, Instant fallback) {
        ExifIFD0Directory exifIFD0Directory;
        Date takenDate = null;
        ExifSubIFDDirectory exifSubIFDDirectory = (ExifSubIFDDirectory)metadata.getFirstDirectoryOfType(ExifSubIFDDirectory.class);
        if (exifSubIFDDirectory != null && (takenDate = exifSubIFDDirectory.getDateOriginal()) == null) {
            takenDate = exifSubIFDDirectory.getDateDigitized();
        }
        if (takenDate == null && (exifIFD0Directory = (ExifIFD0Directory)metadata.getFirstDirectoryOfType(ExifIFD0Directory.class)) != null) {
            takenDate = exifIFD0Directory.getDate(306);
        }
        return takenDate == null ? fallback : takenDate.toInstant();
    }

    private Optional<PinState> findBestPinForPhoto(TripState trip, double lat, double lng) {
        Map<UUID, Instant> earliestTakenAtByPin = this.collectEarliestTakenAtByPin(trip);
        return trip.pins.values()
                .stream()
                .filter(pin -> this.distanceMeters(pin.lat, pin.lng, lat, lng) <= 300.0)
                .min(Comparator
                        .comparing(
                                (PinState pin) -> earliestTakenAtByPin.get(pin.pinId),
                                Comparator.nullsLast(Comparator.naturalOrder()))
                        .thenComparingDouble(pin -> this.distanceMeters(pin.lat, pin.lng, lat, lng)));
    }

    private PinState createMetadataPin(TripState trip, double lat, double lng, Instant takenAt, int sequence) {
        String title = takenAt != null ? "Auto Pin " + PIN_TITLE_TIME_FORMAT.format(takenAt) : "Auto Pin " + sequence;
        PinState pin = new PinState(UUID.randomUUID(), lat, lng, title, "EXIF metadata based auto-cluster");
        trip.pins.put(pin.pinId, pin);
        return pin;
    }

    private double distanceMeters(double lat1, double lng1, double lat2, double lng2) {
        double earthRadius = 6371000.0;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.sin(dLng / 2.0) * Math.sin(dLng / 2.0);
        double c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
        return earthRadius * c;
    }

    private List<RouteItem> buildRoute(List<PinView> pins) {
        ArrayList<RouteItem> route = new ArrayList<RouteItem>();
        for (int index = 0; index < pins.size(); ++index) {
            route.add(new RouteItem(pins.get(index).pinId(), index + 1));
        }
        return route;
    }

    private Map<UUID, Instant> collectEarliestTakenAtByPin(TripState trip) {
        LinkedHashMap<UUID, Instant> earliestTakenAtByPin = new LinkedHashMap<UUID, Instant>();
        for (PhotoState photo : trip.photos.values()) {
            Instant current;
            if (photo.pinId == null || photo.unresolved || photo.takenAt == null || (current = (Instant)earliestTakenAtByPin.get(photo.pinId)) != null && !photo.takenAt.isBefore(current)) continue;
            earliestTakenAtByPin.put(photo.pinId, photo.takenAt);
        }
        return earliestTakenAtByPin;
    }

    private void mergeNearbyPinsByEarliestPhoto(TripState trip) {
        boolean merged;
        if (trip.pins.size() < 2) {
            return;
        }
        do {
            merged = false;
            Map<UUID, Instant> earliestTakenAtByPin = this.collectEarliestTakenAtByPin(trip);
            ArrayList<PinState> orderedPins = new ArrayList<PinState>(trip.pins.values());
            orderedPins.sort(Comparator
                    .comparing(
                            (PinState pin) -> earliestTakenAtByPin.get(pin.pinId),
                            Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(pin -> pin.pinId.toString()));
            for (PinState anchor : orderedPins) {
                Set<UUID> mergePinIds;
                if (!trip.pins.containsKey(anchor.pinId) || (mergePinIds = trip.pins.values()
                        .stream()
                        .filter(pin -> !pin.pinId.equals(anchor.pinId))
                        .filter(pin -> this.distanceMeters(anchor.lat, anchor.lng, pin.lat, pin.lng) <= 300.0)
                        .map(pin -> pin.pinId)
                        .collect(Collectors.toCollection(HashSet::new))).isEmpty()) continue;
                for (PhotoState photo : trip.photos.values()) {
                    if (photo.pinId == null || photo.unresolved || !mergePinIds.contains(photo.pinId)) continue;
                    photo.pinId = anchor.pinId;
                }
                mergePinIds.forEach(trip.pins::remove);
                merged = true;
            }
        } while (merged);
    }

    private void recalculatePinAggregates(TripState trip) {
        Map<UUID, List<PhotoState>> grouped = trip.photos.values().stream().filter(photo -> photo.pinId != null && !photo.unresolved).collect(Collectors.groupingBy(photo -> photo.pinId));
        trip.pins.values().forEach(pin -> {
            List<PhotoState> photos = grouped.getOrDefault(pin.pinId, List.of());
            pin.photoCount = photos.size();
            pin.representativeTakenAt = photos.stream().map(photo -> photo.takenAt).filter(Objects::nonNull).min(Comparator.naturalOrder()).orElse(null);
        });
    }

    private TripEntity requireTripEntity(UUID tripId) {
        return (TripEntity)this.tripRepository.findById(tripId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "tripId not found."));
    }

    private TripEntity requireTripAccess(UUID tripId, UUID requestedByUserId) {
        if (requestedByUserId == null || !this.userRepository.existsById(requestedByUserId)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Authentication is required.");
        }
        TripEntity tripEntity = this.requireTripEntity(tripId);
        boolean hasTripMembership = this.tripMemberRepository.findByTrip_IdAndUser_Id(tripId, requestedByUserId).isPresent();
        boolean isCreator = Objects.equals(tripEntity.getCreatedByUser().getId(), requestedByUserId);
        if (!hasTripMembership && !isCreator) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have access to this trip.");
        }
        return tripEntity;
    }

    private TripState requireTrip(UUID tripId) {
        TripEntity tripEntity = this.requireTripEntity(tripId);
        TripState restoredTrip = this.restoreTripState(tripEntity);
        this.trips.put(tripId, restoredTrip);
        return restoredTrip;
    }

    private TripState restoreTripState(TripEntity tripEntity) {
        TripState restoredTrip = new TripState(tripEntity.getId(), tripEntity.getGroup().getId(), tripEntity.getName(), tripEntity.getStartDate(), tripEntity.getEndDate());
        List<TripPinEntity> pinEntities = this.tripPinRepository.findByTrip_IdOrderByCreatedAtAsc(tripEntity.getId());
        pinEntities.forEach(pinEntity -> restoredTrip.pins.put(pinEntity.getId(), new PinState(pinEntity.getId(), pinEntity.getLat(), pinEntity.getLng(), this.nullableTrim(pinEntity.getTitle()).isBlank() ? "Pin" : pinEntity.getTitle(), this.nullableTrim(pinEntity.getCaption()))));
        List<TripPhotoEntity> photoEntities = this.tripPhotoRepository.findByTrip_IdOrderByCreatedAtAsc(tripEntity.getId());
        photoEntities.forEach(photoEntity -> {
            PhotoState photo = new PhotoState(photoEntity.getId(), photoEntity.getFileName(), photoEntity.getThumbnailUrl(), photoEntity.getTakenAt(), photoEntity.getUploadedBy());
            photo.pinId = photoEntity.getPin() == null ? null : photoEntity.getPin().getId();
            photo.unresolved = photoEntity.isUnresolved();
            photo.unresolvedReason = photoEntity.getUnresolvedReason();
            restoredTrip.photos.put(photo.photoId, photo);
        });
        return restoredTrip;
    }

    private TripPinEntity upsertPinEntity(TripEntity tripEntity, PinState pin, Instant now) {
        TripPinEntity pinEntity = this.tripPinRepository.findByIdAndTrip_Id(pin.pinId, tripEntity.getId()).orElse(null);
        if (pinEntity == null) {
            pinEntity = new TripPinEntity();
            pinEntity.setId(pin.pinId);
            pinEntity.setTrip(tripEntity);
            pinEntity.setCreatedAt(now);
        }
        pinEntity.setLat(pin.lat);
        pinEntity.setLng(pin.lng);
        pinEntity.setTitle(pin.title);
        pinEntity.setCaption(pin.caption);
        pinEntity.setUpdatedAt(now);
        return (TripPinEntity)this.tripPinRepository.save(pinEntity);
    }

    private StoredPhoto storePhotoFile(UUID tripId, UUID photoId, MultipartFile file) {
        Object originalFileName = this.nullableTrim(file.getOriginalFilename());
        if (((String)originalFileName).isBlank()) {
            originalFileName = String.valueOf(photoId) + ".bin";
        }
        String extension = this.getSafeFileExtension((String)originalFileName);
        Path tripDirectory = this.photoStorageRoot.resolve(tripId.toString()).normalize();
        try {
            Files.createDirectories(tripDirectory, new FileAttribute[0]);
        }
        catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to create photo directory.");
        }
        String storedFileName = String.valueOf(photoId) + extension;
        Path targetPath = tripDirectory.resolve(storedFileName).normalize();
        if (!targetPath.startsWith(this.photoStorageRoot)) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Invalid photo storage path.");
        }
        try (InputStream inputStream = file.getInputStream();){
            Files.copy(inputStream, targetPath, StandardCopyOption.REPLACE_EXISTING);
        }
        catch (Exception exception) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_SERVER_ERROR", "Failed to store uploaded photo.");
        }
        String publicUrl = "/uploads/trip-photos/" + String.valueOf(tripId) + "/" + storedFileName;
        return new StoredPhoto((String)originalFileName, targetPath.toString(), publicUrl);
    }

    private String getSafeFileExtension(String fileName) {
        String normalized = this.nullableTrim(fileName);
        int dotIndex = normalized.lastIndexOf(46);
        if (dotIndex < 0 || dotIndex == normalized.length() - 1) {
            return ".bin";
        }
        String extension = normalized.substring(dotIndex + 1).toLowerCase(Locale.ROOT);
        if (!extension.matches("[a-z0-9]{1,10}")) {
            return ".bin";
        }
        return "." + extension;
    }

    private void deleteTripPhotoDirectory(UUID tripId) {
        Path tripDirectory = this.photoStorageRoot.resolve(tripId.toString()).normalize();
        if (!tripDirectory.startsWith(this.photoStorageRoot) || Files.notExists(tripDirectory, new LinkOption[0])) {
            return;
        }
        try (Stream<Path> walk = Files.walk(tripDirectory, new FileVisitOption[0]);){
            walk.sorted(Comparator.reverseOrder()).forEach(path -> {
                try {
                    Files.deleteIfExists(path);
                }
                catch (Exception exception) {
                    // empty catch block
                }
            });
        }
        catch (Exception exception) {
            // empty catch block
        }
    }

    private PinState requirePin(TripState trip, UUID pinId) {
        PinState pin = trip.pins.get(pinId);
        if (pin == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "pinId???\u9954\ub085\ub5bd???????????????\uae45\uc9bd????????\ub181\uc844.");
        }
        return pin;
    }

    private UserEntity createPlaceholderUser(String email) {
        Instant now = Instant.now();
        String normalizedEmail = this.nullableTrim(email).toLowerCase(Locale.ROOT);
        String nickname = normalizedEmail.contains("@") ? normalizedEmail.split("@")[0] : normalizedEmail;
        UserEntity user = new UserEntity();
        user.setId(UUID.randomUUID());
        user.setEmail(normalizedEmail);
        user.setName(nickname.isBlank() ? "member" : nickname);
        user.setRole(UserRole.USER);
        user.setStatus(UserStatus.ACTIVE);
        user.setCreatedAt(now);
        user.setUpdatedAt(now);
        return (UserEntity)this.userRepository.save(user);
    }

    private String normalizeTripPinColor(String pinColor, String fallbackColor) {
        String normalized = this.nullableTrim(pinColor).toUpperCase(Locale.ROOT);
        if (normalized.matches("^#[0-9A-F]{6}$")) {
            return normalized;
        }
        String normalizedFallback = this.nullableTrim(fallbackColor).toUpperCase(Locale.ROOT);
        if (normalizedFallback.matches("^#[0-9A-F]{6}$")) {
            return normalizedFallback;
        }
        return DEFAULT_TRIP_PIN_COLOR;
    }

    private String requireText(String value, String fieldName) {
        String normalized = this.nullableTrim(value);
        if (normalized.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BAD_REQUEST", fieldName + " ????\u30eb\ub289?????????\u8adb\uba83\ub9c8????\uafd4\uae82??????");
        }
        return normalized;
    }

    private String nullableTrim(String value) {
        return value == null ? "" : value.trim();
    }

    private static final class TripState {
        private final UUID id;
        private final UUID groupId;
        private final String name;
        private final LocalDate startDate;
        private final LocalDate endDate;
        private final Map<UUID, PhotoState> photos = new LinkedHashMap<UUID, PhotoState>();
        private final Map<UUID, PinState> pins = new LinkedHashMap<UUID, PinState>();

        private TripState(UUID id, UUID groupId, String name, LocalDate startDate, LocalDate endDate) {
            this.id = id;
            this.groupId = groupId;
            this.name = name;
            this.startDate = startDate;
            this.endDate = endDate;
        }
    }

    public record CreateTripResult(UUID tripId, String name, String pinColor) {
    }

    public record UpdateTripResult(UUID tripId, String name, LocalDate startDate, LocalDate endDate, String pinColor, Instant updatedAt) {
    }

    public record AddTripMemberResult(UUID memberUserId, String memberName, String memberEmail, String memberRole, boolean alreadyMember, int memberCount) {
    }

    private record PhotoMetadata(Double lat, Double lng, Instant takenAt, boolean timeMissing, boolean parseFailed) {
    }

    private record StoredPhoto(String originalFileName, String absolutePath, String publicUrl) {
    }

    private static final class PhotoState {
        private final UUID photoId;
        private final String fileName;
        private final String thumbnailUrl;
        private final Instant takenAt;
        private final String uploadedBy;
        private UUID pinId;
        private boolean unresolved;
        private String unresolvedReason;

        private PhotoState(UUID photoId, String fileName, String thumbnailUrl, Instant takenAt, String uploadedBy) {
            this.photoId = photoId;
            this.fileName = fileName;
            this.thumbnailUrl = thumbnailUrl;
            this.takenAt = takenAt;
            this.uploadedBy = uploadedBy;
        }
    }

    private static final class PinState {
        private final UUID pinId;
        private final double lat;
        private final double lng;
        private String title;
        private String caption;
        private int photoCount;
        private Instant representativeTakenAt;

        private PinState(UUID pinId, double lat, double lng, String title, String caption) {
            this.pinId = pinId;
            this.lat = lat;
            this.lng = lng;
            this.title = title;
            this.caption = caption;
        }
    }

    public record UploadPhotosResult(int acceptedCount, List<UUID> photoIds, String message) {
    }

    public record PinsResult(int clusterRuleMeters, List<PinView> pins, List<RouteItem> route) {
    }

    public record PinPhotosResult(UUID pinId, List<PinPhotoItem> items) {
    }

    public record UnresolvedResult(List<UnresolvedPhotoItem> items) {
    }

    public record ManualTarget(String type, UUID pinId, Double lat, Double lng, String title) {
    }

    public record ManualAssignmentResult(int assignedCount, int unresolvedRemaining) {
    }

    public record UpdatePinResult(UUID pinId, String title, String caption) {
    }

    public record AiContext(UUID tripId, List<PinView> pins, List<PhotoForAi> photos, List<UnresolvedPhotoItem> unresolvedPhotos) {
    }

    public record RouteItem(UUID pinId, int sequenceNo) {
    }

    public record PinView(UUID pinId, double lat, double lng, int photoCount, Instant representativeTakenAt, String title, String caption) {
    }

    public record UnresolvedPhotoItem(UUID photoId, String thumbnailUrl, String reason) {
    }

    public record PhotoForAi(UUID photoId, UUID pinId, boolean unresolved, String unresolvedReason) {
    }

    public record PinPhotoItem(UUID photoId, String thumbnailUrl, Instant takenAt, String uploadedBy) {
    }

    public record TripMemberItem(UUID userId, String name, String email, String role, Instant joinedAt) {
    }

    public record TripMembersResponse(List<TripMemberItem> items) {
    }

    public record TripSummary(UUID tripId, UUID groupId, String name, LocalDate startDate, LocalDate endDate, int memberCount, String myRole, String pinColor, Instant updatedAt, Instant createdAt) {
    }
}
