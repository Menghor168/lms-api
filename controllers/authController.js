const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

function signToken(user) {
  return jwt.sign(
    {
      user_id: user.user_id,
      username: user.username,
      role_type: user.role_type,
      member_id: user.member_id || null,
      staff_id: user.staff_id || null
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// register(): dynamic interface for new members to insert personal info into DB
exports.register = async (req, res) => {
  const { username, password, email, full_name, phone } = req.body;
  if (!username || !password || !email || !full_name) {
    return res.status(400).json({ message: 'username, password, email and full_name are required.' });
  }
  try {
    const [existing] = await pool.query(
      'SELECT user_id FROM login_registration WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'Username or email is already registered.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO login_registration (username, password, email, full_name, phone, role_type)
       VALUES (?, ?, ?, ?, ?, 'Member')`,
      [username, hashed, email, full_name, phone || null]
    );

    const [memberResult] = await pool.query(
      `INSERT INTO member_management (user_id, join_date, status) VALUES (?, CURDATE(), 'Active')`,
      [result.insertId]
    );

    const user = {
      user_id: result.insertId,
      username,
      role_type: 'Member',
      member_id: memberResult.insertId
    };
    const token = signToken(user);
    res.status(201).json({ message: 'Registration successful.', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Registration failed.', error: err.message });
  }
};

// login(): verify identity using username + encrypted password
exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM login_registration WHERE username = ?',
      [username]
    );
    if (!rows.length) return res.status(401).json({ message: 'Invalid username or password.' });

    const account = rows[0];
    const match = await bcrypt.compare(password, account.password);
    if (!match) return res.status(401).json({ message: 'Invalid username or password.' });

    let staff_id = null, member_id = null;
    if (account.role_type === 'Admin' || account.role_type === 'Staff') {
      const [s] = await pool.query('SELECT staff_id FROM staff WHERE user_id = ?', [account.user_id]);
      if (s.length) staff_id = s[0].staff_id;
    } else {
      const [m] = await pool.query('SELECT member_id FROM member_management WHERE user_id = ?', [account.user_id]);
      if (m.length) member_id = m[0].member_id;
    }

    const user = {
      user_id: account.user_id,
      username: account.username,
      full_name: account.full_name,
      email: account.email,
      role_type: account.role_type,
      staff_id,
      member_id
    };
    const token = signToken(user);
    res.json({ message: 'Login successful.', token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Login failed.', error: err.message });
  }
};

// logout(): stateless JWT - client discards token. Endpoint kept for parity / auditing.
exports.logout = async (req, res) => {
  res.json({ message: 'Logged out successfully.' });
};

// check_role(): returns the current authenticated user's profile/role
exports.me = async (req, res) => {
  res.json({ user: req.user });
};
