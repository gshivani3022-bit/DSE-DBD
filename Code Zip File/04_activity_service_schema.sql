USE activity_service_db;
CREATE TABLE IF NOT EXISTS activity_logs(id BIGINT PRIMARY KEY AUTO_INCREMENT,file_id BIGINT NOT NULL,action VARCHAR(80) NOT NULL,version_number INT,event_timestamp DATETIME,details VARCHAR(2000),INDEX idx_activity_file_time(file_id,event_timestamp));
-- No cross-service foreign key: file_id is an API reference.
