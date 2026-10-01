# Microservices Demonstration

## New file

1. Click Open File and Browse. The browser's native chooser lets the user select an actual local file; JavaScript does not try to read arbitrary computer folders.
2. The browser sends the file as multipart/form-data to API Gateway on port 8080.
3. Gateway preserves the multipart boundary and forwards the bytes to File Service on port 8081.
4. File Service checks the SHA-256 fingerprint and file name/folder. If it is not already tracked, it creates the file metadata row in file_service_db.
5. File Service sends the original bytes to Version Service on port 8082.
6. Version Service asks Storage Service on port 8084 to save a copy under storage/versioned-files/file-{id}/version-1/.
7. Version Service stores the path, size, type, name, and creation time in version_service_db, then updates the current version in File Service.
8. File Service and Version Service send FILE_CREATED and VERSION_CREATED events to Activity Service on port 8083. They are stored in activity_service_db.
9. The frontend refreshes its data from the Gateway. It displays the tracked file, version number, and database-backed Recent Activity.

## Update and compare

Download the current version, edit it, and choose Upload Saved Changes. The updated same-named file becomes the next version. Storage uses a new version directory, so earlier bytes remain intact. Version history comes from Version Service; text comparison retrieves both physical snapshots and the frontend renders a line-level diff. Binary document comparison reports metadata only.

## Restore

Choose an older version and Restore. Version Service reads its stored bytes and saves them as a new latest snapshot with restored-from metadata. File Service advances currentVersion. Activity Service records VERSION_RESTORED. The old rows and content are preserved unless the configured retention policy removes the oldest version.

## Retention and recovery

Set a small maximum version count and upload more versions. Version Service deletes the oldest physical snapshot first, removes its metadata row only after the disk operation succeeds, and records VERSION_AUTO_DELETED. Delete File sets its status to DELETED while preserving versions; Recently Deleted can restore it and add FILE_RECOVERED.

## Explain service boundaries

- API Gateway: browser routing and file-byte forwarding, port 8080.
- File Service: file/folder rows and current version, database file_service_db, port 8081.
- Version Service: history and restore/compare/retention workflow, database version_service_db, port 8082.
- Activity Service: persistent audit rows, database activity_service_db, port 8083.
- Storage Service: physical content only, no database, port 8084.

MySQL itself stays installed at localhost:3306. All application services connect only as fileversion_user.
