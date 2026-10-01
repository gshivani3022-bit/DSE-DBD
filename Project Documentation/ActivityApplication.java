package edu.fileguard.activityservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

// ACTIVITY SERVICE
// Port: 8083 | Database: activity_service_db
// Persists audit events so Recent Activity survives browser refreshes and service restarts.
@SpringBootApplication
public class ActivityApplication {
    // Starts the Activity Service HTTP API on port 8083.
    public static void main(String[] args) {
        SpringApplication.run(ActivityApplication.class, args);
    }
}
