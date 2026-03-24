package com.soonmile.backend.controller;

import java.time.Instant;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class HealthController {

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of(
                "status", "UP",
                "service", "soonmile-backend",
                "timestamp", Instant.now().toString());
    }

    @GetMapping("/hello")
    public Map<String, String> hello() {
        return Map.of("message", "Spring Boot + React setup is ready.");
    }
}
