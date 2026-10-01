USE version_service_db;
CREATE TABLE IF NOT EXISTS versions(id BIGINT PRIMARY KEY AUTO_INCREMENT,file_id BIGINT NOT NULL,version_number INT NOT NULL,storage_path VARCHAR(1024),file_size BIGINT,original_file_name VARCHAR(255),content_type VARCHAR(255),created_at DATETIME,restored_from INT,status VARCHAR(32),UNIQUE KEY uq_file_version(file_id,version_number));
-- No cross-service foreign key: file_id is an API reference.
