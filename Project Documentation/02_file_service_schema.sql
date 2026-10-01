USE file_service_db;
CREATE TABLE IF NOT EXISTS files(id BIGINT PRIMARY KEY AUTO_INCREMENT,file_name VARCHAR(255) NOT NULL,file_path VARCHAR(1024),folder_path VARCHAR(512),content_hash CHAR(64),current_version INT NOT NULL DEFAULT 0,status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',created_at DATETIME,updated_at DATETIME,INDEX idx_files_updated(updated_at),INDEX idx_files_content_hash(content_hash));
CREATE TABLE IF NOT EXISTS folders(id BIGINT PRIMARY KEY AUTO_INCREMENT,name VARCHAR(255) NOT NULL,path VARCHAR(512),UNIQUE KEY uq_folders_name(name));
