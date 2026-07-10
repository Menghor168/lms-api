const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// add_member(): Admin/Staff registers a member directly (offline registration)
exports.addMember = async (req, res) => {
  const { username, password, email, full_name, phone } = req.body;
  try {
    const hashed = await bcrypt.hash(password || 'Member@123', 10);
    const [result] = await pool.query(
      `INSERT INTO login_registration (username, password, email, full_name, phone, role_type)
       VALUES (?, ?, ?, ?, ?, 'Member')`,
      [username, hashed, email, full_name, phone || null]
    );
    const [member] = await pool.query(
      `INSERT INTO member_management (user_id, join_date, status) VALUES (?, CURDATE(), 'Active')`,
      [result.insertId]
    );
    res.status(201).json({ message: 'Member registered.', member_id: member.insertId });
  } catch (err) {
    res.status(500).json({ message: 'Failed to add member.', error: err.message });
  }
};

// edit_member()
exports.editMember = async (req, res) => {
  const { id } = req.params;
  const { full_name, phone, email, status } = req.body;
  try {
    const [member] = await pool.query('SELECT * FROM member_management WHERE member_id = ?', [id]);
    if (!member.length) return res.status(404).json({ message: 'Member not found.' });

    await pool.query(
      'UPDATE login_registration SET full_name = COALESCE(?, full_name), phone = COALESCE(?, phone), email = COALESCE(?, email) WHERE user_id = ?',
      [full_name, phone, email, member[0].user_id]
    );
    if (status) await pool.query('UPDATE member_management SET status = ? WHERE member_id = ?', [status, id]);
    res.json({ message: 'Member updated.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update member.', error: err.message });
  }
};

// get_all_members()
exports.getAllMembers = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.member_id, m.join_date, m.status, l.user_id, l.username, l.email, l.full_name, l.phone
       FROM member_management m JOIN login_registration l ON m.user_id = l.user_id
       ORDER BY m.member_id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch members.', error: err.message });
  }
};

// get_member_by_id()
exports.getMemberById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.member_id, m.join_date, m.status, l.user_id, l.username, l.email, l.full_name, l.phone
       FROM member_management m JOIN login_registration l ON m.user_id = l.user_id WHERE m.member_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Member not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch member.', error: err.message });
  }
};

// search_member(): search the digital log of members
exports.searchMember = async (req, res) => {
  const { q } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT m.member_id, m.status, l.username, l.email, l.full_name, l.phone
       FROM member_management m JOIN login_registration l ON m.user_id = l.user_id
       WHERE l.full_name LIKE ? OR l.email LIKE ? OR l.username LIKE ?`,
      [`%${q}%`, `%${q}%`, `%${q}%`]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Search failed.', error: err.message });
  }
};

// view_member_history(): every book a member has borrowed/returned
exports.viewMemberHistory = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.transaction_id, b.title, br.issue_date, br.return_date, br.status
       FROM borrowing_returning br JOIN book_management b ON br.book_id = b.book_id
       WHERE br.member_id = ? ORDER BY br.issue_date DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch history.', error: err.message });
  }
};

// delete_member_by_id()
exports.deleteMember = async (req, res) => {
  try {
    const [member] = await pool.query('SELECT * FROM member_management WHERE member_id = ?', [req.params.id]);
    if (!member.length) return res.status(404).json({ message: 'Member not found.' });
    await pool.query('DELETE FROM login_registration WHERE user_id = ?', [member[0].user_id]);
    res.json({ message: 'Member removed.' });
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete member.', error: err.message });
  }
};
