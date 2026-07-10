const pool = require('../config/db');

const LOAN_PERIOD_DAYS_DEFAULT = 14;
const FINE_RATE_PER_DAY = 0.10; // fallback flat rate if price-based calc not desired

// fine_policy(): duration is based on book "thickness" (approximated via price tier)
// and penalty rate per day is based on book price. Returns { dueDays, ratePerDay }.
function finePolicy(book) {
  const price = Number(book.price) || 0;
  let dueDays = LOAN_PERIOD_DAYS_DEFAULT;
  if (price > 50) dueDays = 21;      // thicker / pricier academic books -> longer loan
  else if (price > 20) dueDays = 14;
  else dueDays = 7;

  const ratePerDay = Math.max(0.5, Math.round(price * 0.02 * 100) / 100); // 2% of price per day, min $0.50
  return { dueDays, ratePerDay };
}

// check_out(): create a transaction (invoice) when a book is checked out
exports.checkOut = async (req, res) => {
  const { book_id, member_id } = req.body;
  const staff_id = req.user?.staff_id || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [books] = await conn.query('SELECT * FROM book_management WHERE book_id = ? FOR UPDATE', [book_id]);
    if (!books.length) throw { status: 404, message: 'Book not found.' };
    const book = books[0];
    if (book.available_copies < 1) throw { status: 400, message: 'No available copies to borrow.' };

    const [members] = await conn.query('SELECT * FROM member_management WHERE member_id = ?', [member_id]);
    if (!members.length) throw { status: 404, message: 'Member not found.' };

    const [tx] = await conn.query(
      `INSERT INTO borrowing_returning (book_id, member_id, staff_id, issue_date, status)
       VALUES (?, ?, ?, NOW(), 'Borrowed')`,
      [book_id, member_id, staff_id]
    );

    const { dueDays } = finePolicy(book);
    await conn.query(
      `INSERT INTO due_date_overdue (transaction_id, due_date) VALUES (?, DATE_ADD(CURDATE(), INTERVAL ? DAY))`,
      [tx.insertId, dueDays]
    );

    await conn.query('UPDATE book_management SET available_copies = available_copies - 1 WHERE book_id = ?', [book_id]);
    await conn.query(
      `UPDATE book_menu SET availability_status = (CASE WHEN ? - 1 <= 0 THEN 'Borrowed' ELSE 'Available' END) WHERE book_id = ?`,
      [book.available_copies, book_id]
    );

    await conn.commit();
    res.status(201).json({ message: 'Book checked out.', transaction_id: tx.insertId, due_in_days: dueDays });
  } catch (err) {
    await conn.rollback();
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Checkout failed.' });
  } finally {
    conn.release();
  }
};

// return(): process a return, update stock, trigger fine calc if overdue/damaged/lost
exports.returnBook = async (req, res) => {
  const { id } = req.params; // transaction_id
  const { condition } = req.body; // 'Good' | 'Damaged' | 'Lost' (optional)

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [txs] = await conn.query(
      `SELECT br.*, b.price, b.book_id, dd.due_date
       FROM borrowing_returning br
       JOIN book_management b ON br.book_id = b.book_id
       LEFT JOIN due_date_overdue dd ON dd.transaction_id = br.transaction_id
       WHERE br.transaction_id = ? FOR UPDATE`,
      [id]
    );
    if (!txs.length) throw { status: 404, message: 'Transaction not found.' };
    const txn = txs[0];
    if (txn.status === 'Returned') throw { status: 400, message: 'This book has already been returned.' };

    let newStatus = 'Returned';
    if (condition === 'Lost') newStatus = 'Lost';
    if (condition === 'Damaged') newStatus = 'Damaged';

    await conn.query(`UPDATE borrowing_returning SET return_date = NOW(), status = ? WHERE transaction_id = ?`, [newStatus, id]);

    // Restock unless the book is lost
    if (newStatus !== 'Lost') {
      await conn.query('UPDATE book_management SET available_copies = available_copies + 1 WHERE book_id = ?', [txn.book_id]);
      await conn.query(`UPDATE book_menu SET availability_status = 'Available' WHERE book_id = ?`, [txn.book_id]);
    }

    // sum_fine(): calculate fine if overdue, damaged or lost
    const today = new Date();
    const due = txn.due_date ? new Date(txn.due_date) : null;
    let overdueDays = 0;
    if (due && today > due) {
      overdueDays = Math.ceil((today - due) / (1000 * 60 * 60 * 24));
    }

    const { ratePerDay } = finePolicy({ price: txn.price });
    let fineAmount = overdueDays > 0 ? Math.round(overdueDays * ratePerDay * 100) / 100 : 0;
    if (newStatus === 'Damaged') fineAmount += Math.round(Number(txn.price) * 0.5 * 100) / 100;
    if (newStatus === 'Lost') fineAmount += Number(txn.price);

    if (fineAmount > 0) {
      await conn.query(
        `INSERT INTO fine_management (transaction_id, amount, status) VALUES (?, ?, 'Unpaid')`,
        [id, fineAmount]
      );
    }

    await conn.commit();
    res.json({ message: 'Book returned.', overdue_days: overdueDays, fine_amount: fineAmount });
  } catch (err) {
    await conn.rollback();
    const status = err.status || 500;
    res.status(status).json({ message: err.message || 'Return failed.' });
  } finally {
    conn.release();
  }
};

// view_all_transactions()
exports.getAllTransactions = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.transaction_id, b.title, l.full_name AS member_name, br.issue_date, br.return_date, br.status,
              dd.due_date,
              (SELECT amount FROM fine_management f WHERE f.transaction_id = br.transaction_id LIMIT 1) AS fine_amount,
              (SELECT status FROM fine_management f WHERE f.transaction_id = br.transaction_id LIMIT 1) AS fine_status
       FROM borrowing_returning br
       JOIN book_management b ON br.book_id = b.book_id
       JOIN member_management m ON br.member_id = m.member_id
       JOIN login_registration l ON m.user_id = l.user_id
       LEFT JOIN due_date_overdue dd ON dd.transaction_id = br.transaction_id
       ORDER BY br.issue_date DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transactions.', error: err.message });
  }
};

// get_transaction_by_id(id)
exports.getTransactionById = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.*, b.title, dd.due_date FROM borrowing_returning br
       JOIN book_management b ON br.book_id = b.book_id
       LEFT JOIN due_date_overdue dd ON dd.transaction_id = br.transaction_id
       WHERE br.transaction_id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'Transaction not found.' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch transaction.', error: err.message });
  }
};

// alert_user(): automated overdue alert listing (consumed by a notification job/cron in production)
exports.alertUser = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT br.transaction_id, l.full_name, l.email, b.title, dd.due_date
       FROM borrowing_returning br
       JOIN due_date_overdue dd ON dd.transaction_id = br.transaction_id
       JOIN member_management m ON br.member_id = m.member_id
       JOIN login_registration l ON m.user_id = l.user_id
       JOIN book_management b ON br.book_id = b.book_id
       WHERE br.status = 'Borrowed' AND dd.due_date < CURDATE()`
    );
    res.json({ overdue_count: rows.length, overdue: rows });
  } catch (err) {
    res.status(500).json({ message: 'Failed to compute overdue alerts.', error: err.message });
  }
};

// ---------- Fines ----------

// pay_fine(): record a fine payment via cash, card or bank app
exports.payFine = async (req, res) => {
  const { id } = req.params; // fine_id
  const { amount_paid, payment_method } = req.body;
  try {
    const [fines] = await pool.query('SELECT * FROM fine_management WHERE fine_id = ?', [id]);
    if (!fines.length) return res.status(404).json({ message: 'Fine record not found.' });
    const fine = fines[0];

    const totalPaid = Number(fine.amount_paid) + Number(amount_paid || 0);
    const status = totalPaid >= Number(fine.amount) ? 'Paid' : 'Partial';

    await pool.query(
      `UPDATE fine_management SET amount_paid = ?, payment_method = ?, status = ?, paid_at = NOW() WHERE fine_id = ?`,
      [totalPaid, payment_method || 'Cash', status, id]
    );
    res.json({ message: 'Payment recorded.', status, total_paid: totalPaid });
  } catch (err) {
    res.status(500).json({ message: 'Failed to record payment.', error: err.message });
  }
};

// get_fine_by_member(id)
exports.getFinesByMember = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, b.title FROM fine_management f
       JOIN borrowing_returning br ON f.transaction_id = br.transaction_id
       JOIN book_management b ON br.book_id = b.book_id
       WHERE br.member_id = ? ORDER BY f.fine_id DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch fines.', error: err.message });
  }
};

// get_all_fines() - helper for the fines management screen
exports.getAllFines = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, b.title, l.full_name AS member_name FROM fine_management f
       JOIN borrowing_returning br ON f.transaction_id = br.transaction_id
       JOIN book_management b ON br.book_id = b.book_id
       JOIN member_management m ON br.member_id = m.member_id
       JOIN login_registration l ON m.user_id = l.user_id
       ORDER BY f.fine_id DESC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch fines.', error: err.message });
  }
};
