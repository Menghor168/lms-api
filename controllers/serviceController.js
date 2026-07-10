const pool = require('../config/db');

// log_attendance(): record member entering the physical library
exports.logAttendance = async (req, res) => {
  const { member_id } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO attendance_monitor (member_id, entry_time) VALUES (?, NOW())`,
      [member_id]
    );
    res.status(201).json({ message: 'Attendance logged.', attendance_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to log attendance.', error: err.message });
  }
};

// log exit time
exports.logExit = async (req, res) => {
  try {
    await pool.query(`UPDATE attendance_monitor SET exit_time = NOW() WHERE attendance_id = ?`, [req.params.id]);
    res.json({ message: 'Exit logged.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to log exit.', error: err.message });
  }
};

// get_all_attendance(): full log for auditing
exports.getAllAttendance = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.*, l.full_name FROM attendance_monitor a
       JOIN member_management m ON a.member_id = m.member_id
       JOIN login_registration l ON m.user_id = l.user_id
       ORDER BY a.entry_time DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch attendance.', error: err.message });
  }
};

// generate_attendance(): peak hour / usage analytics
exports.generateAttendanceReport = async (req, res) => {
  try {
    const [byHour] = await pool.query(
      `SELECT HOUR(entry_time) AS hour, COUNT(*) AS visits FROM attendance_monitor GROUP BY HOUR(entry_time) ORDER BY hour`
    );
    const [total] = await pool.query(`SELECT COUNT(*) AS total_visits FROM attendance_monitor`);
    res.json({ total_visits: total[0].total_visits, by_hour: byHour });
  } catch (err) {
    res.status(500).json({ message: 'Failed to generate attendance report.', error: err.message });
  }
};

// reserve(): hold a book online before pickup
exports.reserveBook = async (req, res) => {
  const { book_id, member_id } = req.body;
  try {
    const [result] = await pool.query(
      `INSERT INTO reservations (book_id, member_id, status) VALUES (?, ?, 'Pending')`,
      [book_id, member_id]
    );
    await pool.query(`UPDATE book_menu SET availability_status = 'Reserved' WHERE book_id = ?`, [book_id]);
    res.status(201).json({ message: 'Book reserved.', reservation_id: result.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reserve book.', error: err.message });
  }
};

// get_all_reservations
exports.getAllReservations = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.*, b.title, l.full_name FROM reservations r
       JOIN book_management b ON r.book_id = b.book_id
       JOIN member_management m ON r.member_id = m.member_id
       JOIN login_registration l ON m.user_id = l.user_id
       ORDER BY r.reserved_at DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch reservations.', error: err.message });
  }
};
