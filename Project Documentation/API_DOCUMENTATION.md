# API Documentation

Public requests use the API Gateway at http://localhost:8080/api. The Gateway forwards JSON, multipart uploads, and binary downloads to the owning service.

| Method | Endpoint | Purpose | Owner |
|---|---|---|---|
| GET | /files | List active files | File Service :8081 |
| GET | /files?status=DELETED | List files available for recovery | File Service :8081 |
| GET | /files/{id} | Get file metadata | File Service :8081 |
| POST | /files/upload | Upload a local file. Multipart parts: file, optional folderPath | File Service :8081 |
| POST | /files | Create a text file. JSON: fileName, folderPath, optional content | File Service :8081 |
| PUT | /files/{id}/version | Internal current-version update | File Service :8081 |
| DELETE | /files/{id} | Soft-delete a file | File Service :8081 |
| POST | /files/{id}/recover | Recover a soft-deleted file | File Service :8081 |
| GET | /files/folders | List folders | File Service :8081 |
| POST | /files/folders | Add folder. JSON: name | File Service :8081 |
| DELETE | /files/folders/{id} | Delete folder | File Service :8081 |
| GET | /files/{id}/versions | List version metadata | Version Service :8082 |
| POST | /files/{id}/versions | Create a copy of the current version or a text snapshot | Version Service :8082 |
| POST | /files/{id}/versions/upload | Upload changed bytes as a new version. Multipart parts: file, originalFileName | Version Service :8082 |
| POST | /files/{id}/versions/{version}/restore | Restore a version as a new latest version | Version Service :8082 |
| GET | /files/{id}/compare?v1=1&v2=2 | Return text contents or binary metadata | Version Service :8082 |
| GET/PUT | /settings | Read or update maximum versions and settings | Version Service :8082 |
| GET | /activity | Read persisted audit events | Activity Service :8083 |

Storage Service is internal, has no MySQL database, and stores content under storage/versioned-files:

| Method | Internal endpoint | Purpose |
|---|---|---|
| POST | /storage/files/{id}/versions?versionNumber=N&originalFileName=name | Store multipart bytes |
| GET | /storage/files/{id}/versions/{version} | Stream a binary version |
| DELETE | /storage/files/{id}/versions/{version} | Delete physical content and its version directory |
| POST | /storage/files/{id}/restore/{version} | Copy a snapshot to a local current-file view |
| PUT | /storage/settings | Change the active storage root |
| GET | /storage/health | Storage health check |

Activity event payloads contain fileId, action, optional versionNumber, and human-readable details. Activity Service stamps the event time before saving it.
