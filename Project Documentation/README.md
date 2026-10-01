# Database setup

MySQL Server stays installed separately and listens on localhost:3306. This folder contains only the project's schema and account setup scripts.

Use an administrator account only for the provisioning scripts:

1. 01_create_databases.sql
2. 02_file_service_schema.sql
3. 03_version_service_schema.sql
4. 04_activity_service_schema.sql
5. 05_grant_fileversion_user.sql

The application connects only as fileversion_user. Set DB_USERNAME=fileversion_user and DB_PASSWORD in the operating system environment before starting the services. Do not put a real password in a properties file.

Each Spring service can add compatible columns to its own tables on startup (spring.jpa.hibernate.ddl-auto=update). Storage Service does not have a MySQL database.
