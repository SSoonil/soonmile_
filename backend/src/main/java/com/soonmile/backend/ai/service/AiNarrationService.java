package com.soonmile.backend.ai.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.soonmile.backend.trip.service.TripService;

import org.springframework.ai.chat.client.ChatClient;

@Service
public class AiNarrationService {
    private static final Logger logger = LoggerFactory.getLogger(AiNarrationService.class);

    private final ObjectProvider<ChatClient.Builder> chatClientBuilderProvider;
    private final ObjectMapper objectMapper;
    private final boolean llmEnabled;

    public AiNarrationService(
            ObjectProvider<ChatClient.Builder> chatClientBuilderProvider,
            ObjectMapper objectMapper,
            @Value("${soonmile.ai.llm.enabled:false}") boolean llmEnabled) {
        this.chatClientBuilderProvider = chatClientBuilderProvider;
        this.objectMapper = objectMapper;
        this.llmEnabled = llmEnabled;
    }

    public List<PinNarration> generatePinNarrations(List<TripService.PinView> pins) {
        if (pins == null || pins.isEmpty()) {
            return List.of();
        }

        List<PinNarration> fallback = buildFallbackNarrations(pins);
        if (!llmEnabled) {
            return fallback;
        }

        ChatClient.Builder builder = chatClientBuilderProvider.getIfAvailable();
        if (builder == null) {
            logger.info("Spring AI ChatClient.Builder bean is unavailable. Falling back to deterministic narration.");
            return fallback;
        }

        try {
            String llmResponse = builder.build()
                    .prompt()
                    .system(buildSystemPrompt())
                    .user(buildUserPrompt(pins))
                    .call()
                    .content();
            if (llmResponse == null || llmResponse.isBlank()) {
                return fallback;
            }

            List<PinNarration> parsed = parseNarrations(llmResponse);
            return mergeWithFallback(pins, parsed, fallback);
        } catch (Exception exception) {
            logger.warn("LLM narration generation failed. Falling back to deterministic narration.", exception);
            return fallback;
        }
    }

    public LlmReadiness getReadiness() {
        boolean clientAvailable = chatClientBuilderProvider.getIfAvailable() != null;
        return new LlmReadiness(llmEnabled, clientAvailable, llmEnabled && clientAvailable);
    }

    private String buildSystemPrompt() {
        return """
                You are an assistant that writes short, warm travel memory snippets.
                Return strictly valid JSON only.
                Output format: an array of objects.
                Each object must have:
                - pinId (string UUID)
                - suggestedTitle (short title, max 24 chars)
                - suggestedCaption (one sentence, max 90 chars)
                Do not include markdown or explanations.
                """;
    }

    private String buildUserPrompt(List<TripService.PinView> pins) {
        String pinLines = pins.stream()
                .map(pin -> String.format(
                        "pinId=%s; title=%s; caption=%s; photoCount=%d",
                        pin.pinId(),
                        safeText(pin.title()),
                        safeText(pin.caption()),
                        pin.photoCount()))
                .collect(Collectors.joining("\n"));

        return """
                Create one narration item for each pin.
                Preserve each input pinId exactly.
                Input pins:
                """ + pinLines;
    }

    private List<PinNarration> parseNarrations(String llmResponse) throws Exception {
        List<LlmNarrationPayload> payloads = objectMapper.readValue(
                llmResponse,
                new TypeReference<List<LlmNarrationPayload>>() {
                });

        return payloads.stream()
                .map(payload -> {
                    UUID pinId = tryParseUuid(payload.pinId());
                    if (pinId == null) {
                        return null;
                    }
                    return new PinNarration(
                            pinId,
                            safeText(payload.suggestedTitle()),
                            safeText(payload.suggestedCaption()));
                })
                .filter(item -> item != null)
                .toList();
    }

    private List<PinNarration> mergeWithFallback(
            List<TripService.PinView> pins,
            List<PinNarration> parsed,
            List<PinNarration> fallback) {
        Map<UUID, PinNarration> parsedByPinId = parsed.stream()
                .collect(Collectors.toMap(
                        PinNarration::pinId,
                        item -> item,
                        (left, right) -> left,
                        LinkedHashMap::new));

        Map<UUID, PinNarration> fallbackByPinId = fallback.stream()
                .collect(Collectors.toMap(
                        PinNarration::pinId,
                        item -> item,
                        (left, right) -> left,
                        LinkedHashMap::new));

        return pins.stream()
                .map(pin -> {
                    PinNarration fallbackItem = fallbackByPinId.get(pin.pinId());
                    PinNarration parsedItem = parsedByPinId.get(pin.pinId());
                    if (parsedItem == null) {
                        return fallbackItem;
                    }

                    String title = parsedItem.suggestedTitle().isBlank()
                            ? fallbackItem.suggestedTitle()
                            : parsedItem.suggestedTitle();
                    String caption = parsedItem.suggestedCaption().isBlank()
                            ? fallbackItem.suggestedCaption()
                            : parsedItem.suggestedCaption();

                    return new PinNarration(pin.pinId(), title, caption);
                })
                .toList();
    }

    private List<PinNarration> buildFallbackNarrations(List<TripService.PinView> pins) {
        return pins.stream()
                .map(pin -> {
                    String baseTitle = safeText(pin.title());
                    String title = baseTitle.isBlank() ? "Trip pin memory" : baseTitle + " memory";
                    String baseCaption = safeText(pin.caption());
                    String caption = baseCaption.isBlank()
                            ? "A memorable stop from this trip timeline."
                            : baseCaption + " Ordered in timeline sequence.";
                    return new PinNarration(pin.pinId(), title, caption);
                })
                .toList();
    }

    private UUID tryParseUuid(String value) {
        try {
            return UUID.fromString(safeText(value));
        } catch (Exception exception) {
            return null;
        }
    }

    private String safeText(String value) {
        return value == null ? "" : value.trim();
    }

    private record LlmNarrationPayload(String pinId, String suggestedTitle, String suggestedCaption) {
    }

    public record PinNarration(UUID pinId, String suggestedTitle, String suggestedCaption) {
    }

    public record LlmReadiness(boolean enabled, boolean clientAvailable, boolean ready) {
    }
}
