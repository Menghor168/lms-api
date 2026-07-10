const pool = require('../config/db');

exports.addBook = async (req, res) => {
  const { title, author, isbn, price, description, category_id, total_copies, cover_url, cover_image } = req.body;
  if (!title) return res.status(400).json({ message: 'Title is required.' });
  try {
    const copies = total_copies && total_copies > 0 ? total_copies : 1;
    const [result] = await pool.query(
      `INSERT INTO book_management (title, author, isbn, price, description, category_id, total_copies, available_copies, cover_url, cover_image)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, author||null, isbn||null, price||0, description||null, category_id||null, copies, copies, cover_url||null, cover_image||null]
    );
    await pool.query(`INSERT INTO book_menu (book_id, availability_status) VALUES (?, 'Available')`, [result.insertId]);
    res.status(201).json({ message: 'Book added.', book_id: result.insertId });
  } catch(err){ res.status(500).json({ message: 'Failed to add book.', error: err.message }); }
};

exports.getAllBooks = async (req, res) => {
  try {
    const { search, category_id } = req.query;
    let sql = `SELECT b.book_id, b.title, b.author, b.isbn, b.price, b.description, b.category_id, c.category_name, b.total_copies, b.available_copies, b.cover_url, b.cover_image, b.created_at,
               (SELECT availability_status FROM book_menu WHERE book_id = b.book_id LIMIT 1) AS availability_status
               FROM book_management b LEFT JOIN category_management c ON b.category_id = c.category_id WHERE 1=1`;
    const params = [];
    if (search) { sql += ' AND (b.title LIKE ? OR b.author LIKE ? OR b.isbn LIKE ?)'; params.push(`%${search}%`,`%${search}%`,`%${search}%`); }
    if (category_id) { sql += ' AND b.category_id = ?'; params.push(category_id); }
    sql += ' ORDER BY b.created_at DESC';
    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch(err){ res.status(500).json({ message: 'Failed to fetch books.', error: err.message }); }
};

exports.getBookById = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT b.*, c.category_name FROM book_management b LEFT JOIN category_management c ON b.category_id = c.category_id WHERE b.book_id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Book not found.' });
    res.json(rows[0]);
  } catch(err){ res.status(500).json({ message: 'Failed to fetch book.', error: err.message }); }
};

exports.editBook = async (req, res) => {
  const { title, author, isbn, price, description, category_id, total_copies, cover_url, cover_image } = req.body;
  try {
    const [existing] = await pool.query('SELECT * FROM book_management WHERE book_id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ message: 'Book not found.' });
    await pool.query(
      `UPDATE book_management SET title=COALESCE(?,title), author=COALESCE(?,author), isbn=COALESCE(?,isbn), price=COALESCE(?,price),
       description=COALESCE(?,description), category_id=COALESCE(?,category_id), total_copies=COALESCE(?,total_copies),
       cover_url=COALESCE(?,cover_url), cover_image=IF(?='',NULL,COALESCE(?,cover_image)) WHERE book_id=?`,
      [title,author,isbn,price,description,category_id,total_copies,cover_url,cover_image||'',cover_image||null,req.params.id]
    );
    res.json({ message: 'Book updated.' });
  } catch(err){ res.status(500).json({ message: 'Failed to update book.', error: err.message }); }
};

exports.deleteBook = async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM book_management WHERE book_id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Book not found.' });
    res.json({ message: 'Book removed.' });
  } catch(err){ res.status(500).json({ message: 'Failed to delete book.', error: err.message }); }
};

exports.viewStatus = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT bm.menu_id, bm.book_id, bm.availability_status, b.title FROM book_menu bm JOIN book_management b ON bm.book_id = b.book_id`);
    res.json(rows);
  } catch(err){ res.status(500).json({ message: 'Failed to fetch status.', error: err.message }); }
};

exports.addCategory = async (req, res) => {
  const { category_name } = req.body;
  if (!category_name) return res.status(400).json({ message: 'category_name is required.' });
  try {
    const [result] = await pool.query('INSERT INTO category_management (category_name) VALUES (?)', [category_name]);
    res.status(201).json({ message: 'Category created.', category_id: result.insertId });
  } catch(err){ res.status(500).json({ message: 'Failed to add category.', error: err.message }); }
};

exports.getAllCategories = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT c.*, (SELECT COUNT(*) FROM book_management b WHERE b.category_id=c.category_id) AS book_count FROM category_management c ORDER BY c.category_name ASC`);
    res.json(rows);
  } catch(err){ res.status(500).json({ message: 'Failed to fetch categories.', error: err.message }); }
};

exports.getCategoryById = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM category_management WHERE category_id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Category not found.' });
    res.json(rows[0]);
  } catch(err){ res.status(500).json({ message: 'Failed to fetch category.', error: err.message }); }
};

exports.editCategory = async (req, res) => {
  try {
    await pool.query('UPDATE category_management SET category_name=? WHERE category_id=?',[req.body.category_name,req.params.id]);
    res.json({ message: 'Category updated.' });
  } catch(err){ res.status(500).json({ message: 'Failed to update category.', error: err.message }); }
};

exports.deleteCategory = async (req, res) => {
  try {
    await pool.query('DELETE FROM category_management WHERE category_id=?',[req.params.id]);
    res.json({ message: 'Category removed.' });
  } catch(err){ res.status(500).json({ message: 'Failed to delete category.', error: err.message }); }
};

exports.sortCategory = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT c.category_id, c.category_name, b.book_id, b.title, b.author FROM category_management c LEFT JOIN book_management b ON b.category_id=c.category_id ORDER BY c.category_name ASC, b.title ASC`);
    res.json(rows);
  } catch(err){ res.status(500).json({ message: 'Failed to sort categories.', error: err.message }); }
};
