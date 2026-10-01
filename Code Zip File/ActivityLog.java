package edu.fileguard.activityservice.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

// ACTIVITY ENTITY | Table: activity_logs in activity_service_db.
// Durable events rebuild the Recent Activity screen after the browser refreshes.
@Entity
@Table(name = "activity_logs")
public class ActivityLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "file_id", nullable = false)
    private Long fileId;
    @Column(nullable = false)
    private String action;
    @Column(name = "version_number")
    private Integer versionNumber;
    // Activity Service sets this time when it accepts the event.
    @Column(name = "event_timestamp")
    private LocalDateTime timestamp = LocalDateTime.now();
    @Column(length = 2000)
    private String details;

    protected ActivityLog() {}
    public Long getId() { return id; }
    public Long getFileId() { return fileId; }
    public String getAction() { return action; }
    public Integer getVersionNumber() { return versionNumber; }
    public LocalDateTime getTimestamp() { return timestamp; }
    public String getDetails() { return details; }
    public void setFileId(Long fileId) { this.fileId = fileId; }
    public void setAction(String action) { this.action = action; }
    public void setVersionNumber(Integer versionNumber) { this.versionNumber = versionNumber; }
    public void setDetails(String details) { this.details = details; }
    // Replaces any client timestamp with the time this server accepted the event.
    public void stampNow() { timestamp = LocalDateTime.now(); }
}
