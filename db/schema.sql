-- ============================================================
-- Library Management System (LMS) - MySQL Schema
-- Derived from the ERD / Entity List in the LMS documentation
-- ============================================================

CREATE DATABASE IF NOT EXISTS lms_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE lms_db;

-- 6.1 Log In and Registration -------------------------------------------
CREATE TABLE IF NOT EXISTS login_registration (
  user_id     INT AUTO_INCREMENT PRIMARY KEY,
  username    VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  email       VARCHAR(150) NOT NULL UNIQUE,
  full_name   VARCHAR(150) NOT NULL,
  phone       VARCHAR(30),
  role_type   ENUM('Admin','Staff','Member') NOT NULL DEFAULT 'Member',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6.2 Staff Management ----------------------------------------------------
CREATE TABLE IF NOT EXISTS staff (
  staff_id    INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  role_type   ENUM('Admin','Staff') NOT NULL DEFAULT 'Staff',
  permissions JSON NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES login_registration(user_id) ON DELETE CASCADE
);

-- 6.3 Member Management ----------------------------------------------------
CREATE TABLE IF NOT EXISTS member_management (
  member_id   INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  join_date   DATE NOT NULL DEFAULT (CURRENT_DATE),
  status      ENUM('Active','Inactive','Suspended') DEFAULT 'Active',
  FOREIGN KEY (user_id) REFERENCES login_registration(user_id) ON DELETE CASCADE
);

-- 6.5 Category Management --------------------------------------------------
CREATE TABLE IF NOT EXISTS category_management (
  category_id   INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL
);

-- 6.4 Book Management -------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_management (
  book_id        INT AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(255) NOT NULL,
  author         VARCHAR(150),
  isbn           VARCHAR(50) UNIQUE,
  price          DECIMAL(10,2) DEFAULT 0,
  description    TEXT,
  category_id    INT,
  total_copies   INT NOT NULL DEFAULT 1,
  available_copies INT NOT NULL DEFAULT 1,
  cover_url      VARCHAR(255),
  cover_image    MEDIUMTEXT NULL,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES category_management(category_id) ON DELETE SET NULL
);

-- 6.11 Book Menu Management (public catalog / availability) ---------------
CREATE TABLE IF NOT EXISTS book_menu (
  menu_id             INT AUTO_INCREMENT PRIMARY KEY,
  book_id             INT NOT NULL,
  availability_status ENUM('Available','Borrowed','Reserved') NOT NULL DEFAULT 'Available',
  FOREIGN KEY (book_id) REFERENCES book_management(book_id) ON DELETE CASCADE
);

-- 6.6 Borrowing & Returning Management --------------------------------------
CREATE TABLE IF NOT EXISTS borrowing_returning (
  transaction_id INT AUTO_INCREMENT PRIMARY KEY,
  book_id        INT NOT NULL,
  member_id      INT NOT NULL,
  staff_id       INT NULL,
  issue_date     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  return_date    DATETIME NULL,
  status         ENUM('Borrowed','Returned','Overdue','Lost','Damaged') NOT NULL DEFAULT 'Borrowed',
  FOREIGN KEY (book_id) REFERENCES book_management(book_id),
  FOREIGN KEY (member_id) REFERENCES member_management(member_id),
  FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
);

-- 6.8 Due Date & Overdue Management ------------------------------------------
CREATE TABLE IF NOT EXISTS due_date_overdue (
  overdue_id     INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL UNIQUE,
  due_date       DATE NOT NULL,
  notified       BOOLEAN DEFAULT FALSE,
  FOREIGN KEY (transaction_id) REFERENCES borrowing_returning(transaction_id) ON DELETE CASCADE
);

-- 6.9 Fine Management -----------------------------------------------------
CREATE TABLE IF NOT EXISTS fine_management (
  fine_id        INT AUTO_INCREMENT PRIMARY KEY,
  transaction_id INT NOT NULL,
  amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
  amount_paid    DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method ENUM('Cash','Card','BankApp') NULL,
  status         ENUM('Unpaid','Paid','Partial') NOT NULL DEFAULT 'Unpaid',
  paid_at        DATETIME NULL,
  FOREIGN KEY (transaction_id) REFERENCES borrowing_returning(transaction_id) ON DELETE CASCADE
);

-- 6.10 Attendance Monitor Management ----------------------------------------
CREATE TABLE IF NOT EXISTS attendance_monitor (
  attendance_id INT AUTO_INCREMENT PRIMARY KEY,
  member_id     INT NOT NULL,
  entry_time    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exit_time     DATETIME NULL,
  FOREIGN KEY (member_id) REFERENCES member_management(member_id) ON DELETE CASCADE
);

-- 6.12 Online Access (sessions / reservations) -------------------------------
CREATE TABLE IF NOT EXISTS online_access (
  access_id     INT AUTO_INCREMENT PRIMARY KEY,
  user_id       INT NOT NULL,
  session_token VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES login_registration(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS reservations (
  reservation_id INT AUTO_INCREMENT PRIMARY KEY,
  book_id        INT NOT NULL,
  member_id      INT NOT NULL,
  reserved_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status         ENUM('Pending','Fulfilled','Cancelled') DEFAULT 'Pending',
  FOREIGN KEY (book_id) REFERENCES book_management(book_id),
  FOREIGN KEY (member_id) REFERENCES member_management(member_id)
);

-- 6.7 Report Generation Management -------------------------------------------
CREATE TABLE IF NOT EXISTS report_generation (
  report_id   INT AUTO_INCREMENT PRIMARY KEY,
  staff_id    INT,
  report_type VARCHAR(100) NOT NULL,
  report_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
);

-- 6.13 Data Management (audit log) -------------------------------------------
CREATE TABLE IF NOT EXISTS data_management (
  log_id      INT AUTO_INCREMENT PRIMARY KEY,
  table_name  VARCHAR(100) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  user_id     INT NULL,
  details     TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed: default admin  (password is set by setup.js to "123")
INSERT INTO login_registration (username, password, email, full_name, phone, role_type)
VALUES ('admin', 'TEMP_RUN_SETUP_JS', 'admin@lms.local', 'System Admin', '000-000-0000', 'Admin')
ON DUPLICATE KEY UPDATE username = username;

INSERT INTO staff (user_id, role_type)
SELECT lr.user_id, 'Admin' FROM login_registration lr WHERE lr.username = 'admin'
ON DUPLICATE KEY UPDATE role_type = VALUES(role_type);

INSERT INTO category_management (category_name) VALUES ('Fiction'), ('Academic'), ('Science'), ('History')
ON DUPLICATE KEY UPDATE category_name = VALUES(category_name);

-- Safe migration for existing databases: add cover_image column
ALTER TABLE book_management ADD COLUMN IF NOT EXISTS cover_image MEDIUMTEXT NULL;
