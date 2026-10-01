package edu.fileguard.activityservice.repository;

import edu.fileguard.activityservice.model.ActivityLog;
import org.springframework.data.jpa.repository.JpaRepository;

// Spring Data database access for activity_logs in activity_service_db.
// JpaRepository provides save and findAll without handwritten SQL.
public interface Logs extends JpaRepository<ActivityLog, Long> {}
