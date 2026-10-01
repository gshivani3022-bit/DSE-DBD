-- Run as a MySQL administrator after 01_create_databases.sql.
-- Application processes connect only as fileversion_user.
GRANT ALL PRIVILEGES ON file_service_db.* TO 'fileversion_user'@'localhost';
GRANT ALL PRIVILEGES ON version_service_db.* TO 'fileversion_user'@'localhost';
GRANT ALL PRIVILEGES ON activity_service_db.* TO 'fileversion_user'@'localhost';
