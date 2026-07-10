const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// add_staff(): Admin inserts a new staff account
exports.addStaff = async (req, res) => {
  const { username, password, email, full_name, phone, role_type } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO login_registration (username, password, email, full_name, phone, role_type)
       VALUES (?, ?, ?, ?, ?, 'Staff')`,
      [username, hashed, email, full_name, phone || null]
    );
    const [staff] = await pool.query(
      `INSERT INTO staff (user_id, role_type) VALUES (?, ?)`,
      [result.insertId, role_type === 'Admin' ? 'Admin' : 'Staff']
    );
    res.status(201).json({ message: 'Staff account created.', staff_id: staff.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add staff.', error: err.message });
  }
};

// edit_staff(): update staff profile
exports.editStaff = async (req, res) => {
  const { id } = req.params;
  const { full_name, phone, email, role_type } = req.body;
  try {
    const [staff] = await pool.query('SELECT * FROM staff WHERE staff_id = ?', [id]);
    if (!staff.length) return res.status(404).json({ message: 'Staff not found.' });

    await pool.query(
      'UPDATE login_registration SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE user_id = ?',
      [full_name, phone, email, staff[0].user_id]
    );
    if (role_type) {
      await pool.query('UPDATE staff SET role_type = ? WHERE staff_id = ?', [role_type, id]);
    }
    res.json({ message: 'Staff updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update staff.', error: err.message });
  }
};

// delete_staff(): remove staff account
exports.deleteStaff = async (req, res) => {
  const { id } = req.params;
  try {
    const [staff] = await pool.query('SELECT * FROM staff WHERE staff_id = ?', [id]);
    if (!staff.length) return res.status(404).json({ message: 'Staff not found.' });
    await pool.query('DELETE FROM login_registration WHERE user_id = ?', [staff[0].user_id]);
    res.json({ message: 'Staff removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete staff.', error: err.message });
  }
};

// set_permission(): define what a staff member is allowed to do
exports.setPermission = async (req, res) => {
  const { id } = req.params;
  const { permissions } = req.body; // e.g. { canProcessReturns: true, canViewReports: false }
  try {
    await pool.query('UPDATE staff SET permissions = ? WHERE staff_id = ?', [JSON.stringify(permissions), id]);
    res.json({ message: 'Permissions updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to set permissions.', error: err.message });
  }
};

// get_all_staff()
exports.getAllStaff = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.staff_id, s.role_type, s.permissions, l.user_id, l.username, l.email, l.full_name, l.phone, l.created_at
       FROM staff s JOIN login_registration l ON s.user_id = l.user_id
       ORDER BY s.staff_id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch staff.', error: err.message });
  }
};

// get_staff_by_id()
exports.getStaffById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.staff_id, s.role_type, s.permissions, l.user_id, l.username, l.email, l.full_name, l.phone
       FROM staff s JOIN login_registration l ON s.user_id = l.user_id WHERE s.staff_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Staff not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch staff.', error: err.message });
  }
};
