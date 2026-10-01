package edu.fileguard.activityservice.controller;

import edu.fileguard.activityservice.model.ActivityLog;
import edu.fileguard.activityservice.repository.Logs;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

// ACTIVITY CONTROLLER | Port: 8083 | Database: activity_service_db through Logs repository.
// Other services POST audit events here; the frontend GETs the stored events through Gateway :8080.
@RestController
@RequestMapping("/activity")
public class ActivityController {
    private final Logs logs;
    public ActivityController(Logs logs) { this.logs = logs; }

    // GET /activity returns newest audit records first for Recent Activity.
    @GetMapping
    public List<ActivityLog> all() {
        return logs.findAll(Sort.by(Sort.Direction.DESC, "timestamp"));
    }

    // POST /activity validates and timestamps each event before writing it to activity_logs.
    @PostMapping
    public ActivityLog add(@RequestBody ActivityLog event) {
        if (event.getFileId() == null || event.getAction() == null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "fileId and action are required");
        event.stampNow();
        return logs.save(event);
    }
}
