package com.soonmile.backend.ai.service;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.soonmile.backend.common.ApiException;
import com.soonmile.backend.trip.service.TripService;

@Service
public class AiService {
    private final TripService tripService;
    private final AiNarrationService aiNarrationService;
    private final Map<UUID, AiJobState> aiJobs = new LinkedHashMap<>();

    public AiService(TripService tripService, AiNarrationService aiNarrationService) {
        this.tripService = tripService;
        this.aiNarrationService = aiNarrationService;
    }

    public synchronized AiJobResult createAiJob(UUID tripId, UUID requestedByUserId, String type) {
        tripService.validateTripAccess(tripId, requestedByUserId);
        tripService.getAiContext(tripId);

        UUID jobId = UUID.randomUUID();
        String normalizedType = type == null || type.isBlank() ? "CURATION" : type.trim();
        AiJobState job = new AiJobState(jobId, tripId, requestedByUserId, normalizedType);
        aiJobs.put(jobId, job);
        return toAiJobResult(job);
    }

    public synchronized AiJobResult getAiJob(UUID jobId, UUID requestedByUserId) {
        AiJobState job = requireJob(jobId, requestedByUserId);
        advanceJob(job);
        return toAiJobResult(job);
    }

    public AiNarrationService.LlmReadiness getLlmReadiness() {
        return aiNarrationService.getReadiness();
    }

    public synchronized AiResult getAiResult(UUID jobId, UUID requestedByUserId) {
        AiJobState job = requireJob(jobId, requestedByUserId);
        advanceJob(job);
        if (!"SUCCEEDED".equals(job.status)) {
            throw new ApiException(HttpStatus.CONFLICT, "JOB_NOT_READY", "AI job is not finished yet.");
        }

        TripService.AiContext context = tripService.getAiContext(job.tripId);

        List<SimilarPhotoGroup> similarPhotoGroups = context.pins().stream()
                .map(pin -> {
                    List<UUID> photoIds = context.photos().stream()
                            .filter(photo -> pin.pinId().equals(photo.pinId()) && !photo.unresolved())
                            .limit(3)
                            .map(TripService.PhotoForAi::photoId)
                            .toList();
                    if (photoIds.isEmpty()) {
                        return null;
                    }
                    return new SimilarPhotoGroup(UUID.randomUUID(), pin.title() + " 紐⑥쓬", photoIds);
                })
                .filter(item -> item != null)
                .toList();

        List<QualityFlag> qualityFlags = new ArrayList<>();
        qualityFlags.addAll(context.unresolvedPhotos().stream()
                .limit(2)
                .map(photo -> new QualityFlag(photo.photoId(), "LOW_CONFIDENCE", 0.88))
                .toList());

        if (qualityFlags.size() < 2) {
            List<QualityFlag> blurCandidates = context.photos().stream()
                    .filter(photo -> !photo.unresolved())
                    .limit(2 - qualityFlags.size())
                    .map(photo -> new QualityFlag(photo.photoId(), "BLUR", 0.72))
                    .toList();
            qualityFlags.addAll(blurCandidates);
        }

        List<PinContent> pinContents = aiNarrationService.generatePinNarrations(context.pins()).stream()
                .map(item -> new PinContent(
                        item.pinId(),
                        item.suggestedTitle(),
                        item.suggestedCaption()))
                .collect(Collectors.toList());

        List<UnresolvedPhotoItem> unresolvedPhotos = context.unresolvedPhotos().stream()
                .map(photo -> new UnresolvedPhotoItem(photo.photoId(), photo.reason()))
                .toList();

        return new AiResult(similarPhotoGroups, qualityFlags, pinContents, unresolvedPhotos);
    }

    private void advanceJob(AiJobState job) {
        Instant now = Instant.now();
        long seconds = Duration.between(job.createdAt, now).toSeconds();

        if ("QUEUED".equals(job.status) && seconds >= 1) {
            job.status = "RUNNING";
            job.startedAt = now;
            job.progressPercent = 24;
        }
        if ("RUNNING".equals(job.status)) {
            if (seconds >= 5) {
                job.status = "SUCCEEDED";
                job.progressPercent = 100;
                job.finishedAt = now;
            } else {
                job.progressPercent = Math.min(95, 24 + (int) (seconds * 15));
            }
        }
    }

    private AiJobResult toAiJobResult(AiJobState job) {
        return new AiJobResult(job.jobId, job.status, job.progressPercent, job.startedAt, job.finishedAt);
    }

    private AiJobState requireJob(UUID jobId, UUID requestedByUserId) {
        AiJobState job = aiJobs.get(jobId);
        if (job == null) {
            throw new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "jobId not found.");
        }
        if (requestedByUserId == null || !requestedByUserId.equals(job.createdByUserId)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "You do not have access to this AI job.");
        }
        return job;
    }

    private static final class AiJobState {
        private final UUID jobId;
        private final UUID tripId;
        private final UUID createdByUserId;
        private final String type;
        private final Instant createdAt;
        private String status;
        private int progressPercent;
        private Instant startedAt;
        private Instant finishedAt;

        private AiJobState(UUID jobId, UUID tripId, UUID createdByUserId, String type) {
            this.jobId = jobId;
            this.tripId = tripId;
            this.createdByUserId = createdByUserId;
            this.type = type;
            this.createdAt = Instant.now();
            this.status = "QUEUED";
            this.progressPercent = 0;
        }
    }

    public record AiJobResult(UUID jobId, String status, int progressPercent, Instant startedAt, Instant finishedAt) {
    }

    public record SimilarPhotoGroup(UUID groupId, String groupName, List<UUID> photoIds) {
    }

    public record QualityFlag(UUID photoId, String reason, double score) {
    }

    public record PinContent(UUID pinId, String suggestedTitle, String suggestedCaption) {
    }

    public record UnresolvedPhotoItem(UUID photoId, String reason) {
    }

    public record AiResult(
            List<SimilarPhotoGroup> similarPhotoGroups,
            List<QualityFlag> qualityFlags,
            List<PinContent> pinContents,
            List<UnresolvedPhotoItem> unresolvedPhotos) {
    }
}
