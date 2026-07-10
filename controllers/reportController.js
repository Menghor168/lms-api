const pool = require('../config/db');

// ── Dashboard summary ──────────────────────────────────────────────────────
exports.dashboardSummary = async (req, res) => {
  try {
    const [[books]]   = await pool.query('SELECT COUNT(*) AS total_books, SUM(available_copies) AS available_copies FROM book_management');
    const [[members]] = await pool.query("SELECT COUNT(*) AS total_members FROM member_management WHERE status='Active'");
    const [[borrowed]]= await pool.query("SELECT COUNT(*) AS borrowed FROM borrowing_returning WHERE status='Borrowed'");
    const [[fines]]   = await pool.query("SELECT COALESCE(SUM(amount_paid),0) AS total_collected, COALESCE(SUM(amount-amount_paid),0) AS outstanding FROM fine_management");
    const [catDist]   = await pool.query(`SELECT c.category_name, COUNT(b.book_id) AS book_count FROM category_management c LEFT JOIN book_management b ON b.category_id=c.category_id GROUP BY c.category_id ORDER BY book_count DESC`);
    const [recentTx]  = await pool.query(`SELECT br.transaction_id, b.title, b.cover_image, l.full_name AS member_name, br.issue_date, br.status FROM borrowing_returning br JOIN book_management b ON br.book_id=b.book_id JOIN member_management m ON br.member_id=m.member_id JOIN login_registration l ON m.user_id=l.user_id ORDER BY br.issue_date DESC LIMIT 5`);
    res.json({ total_books: books.total_books||0, available_copies: books.available_copies||0, total_members: members.total_members||0, borrowed_assets: borrowed.borrowed||0, fines_collected: fines.total_collected||0, fines_outstanding: fines.outstanding||0, category_distribution: catDist, recent_transactions: recentTx });
  } catch(err){ res.status(500).json({ message:'Dashboard failed.', error: err.message }); }
};

exports.transactionReport = async (req, res) => {
  const { from, to } = req.query;
  try {
    const [rows] = await pool.query(
      `SELECT DATE(issue_date) AS day,
        SUM(CASE WHEN status IN('Borrowed','Returned','Overdue') THEN 1 ELSE 0 END) AS issued,
        SUM(CASE WHEN status='Returned' THEN 1 ELSE 0 END) AS returned
       FROM borrowing_returning WHERE issue_date BETWEEN ? AND ?
       GROUP BY DATE(issue_date) ORDER BY day ASC`,
      [from||'1970-01-01', to||'2999-12-31']
    );
    res.json(rows);
  } catch(err){ res.status(500).json({ message:'Report failed.', error: err.message }); }
};

exports.deadStockReport = async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT b.book_id, b.title, b.author FROM book_management b WHERE b.book_id NOT IN (SELECT DISTINCT book_id FROM borrowing_returning) ORDER BY b.title`);
    res.json(rows);
  } catch(err){ res.status(500).json({ message:'Dead stock failed.', error: err.message }); }
};

exports.syncData  = async (req, res) => { await pool.query(`INSERT INTO data_management (table_name, action_type, user_id, details) VALUES ('ALL','SYNC',?,'Manual sync')`,[req.user?.user_id||null]); res.json({ message:'Synced.' }); };
exports.backupData= async (req, res) => { await pool.query(`INSERT INTO data_management (table_name, action_type, user_id, details) VALUES ('ALL','BACKUP',?,'Manual backup')`,[req.user?.user_id||null]); res.json({ message:'Backup recorded.' }); };
exports.getAuditLogs = async (req, res) => { const [rows]=await pool.query('SELECT * FROM data_management ORDER BY created_at DESC LIMIT 200'); res.json(rows); };

// ── Shared data fetchers ───────────────────────────────────────────────────
async function fetchReportData(type, from, to) {
  switch(type){
    case 'books':
      const [books] = await pool.query(`SELECT b.book_id, b.title, b.author, b.isbn, c.category_name, b.price, b.total_copies, b.available_copies FROM book_management b LEFT JOIN category_management c ON b.category_id=c.category_id ORDER BY b.title`);
      return { rows: books, columns: ['No','Title','Author','ISBN','Category','Price','Total Copies','Available'] };

    case 'members':
      const [members] = await pool.query(`SELECT m.member_id, l.full_name, l.username, l.email, l.phone, m.join_date, m.status FROM member_management m JOIN login_registration l ON m.user_id=l.user_id ORDER BY m.member_id DESC`);
      return { rows: members, columns: ['ID','Full Name','Username','Email','Phone','Join Date','Status'] };

    case 'transactions':
      const [txs] = await pool.query(
        `SELECT br.transaction_id, b.title, l.full_name AS member_name, br.issue_date, dd.due_date, br.return_date, br.status FROM borrowing_returning br JOIN book_management b ON br.book_id=b.book_id JOIN member_management m ON br.member_id=m.member_id JOIN login_registration l ON m.user_id=l.user_id LEFT JOIN due_date_overdue dd ON dd.transaction_id=br.transaction_id WHERE br.issue_date BETWEEN ? AND ? ORDER BY br.issue_date DESC`,
        [from||'1970-01-01', to||'2999-12-31']
      );
      return { rows: txs, columns: ['ID','Book Title','Member','Issue Date','Due Date','Return Date','Status'] };

    case 'fines':
      const [fines] = await pool.query(`SELECT f.fine_id, b.title, l.full_name AS member_name, f.amount, f.amount_paid, f.payment_method, f.status, f.paid_at FROM fine_management f JOIN borrowing_returning br ON f.transaction_id=br.transaction_id JOIN book_management b ON br.book_id=b.book_id JOIN member_management m ON br.member_id=m.member_id JOIN login_registration l ON m.user_id=l.user_id ORDER BY f.fine_id DESC`);
      return { rows: fines, columns: ['ID','Book','Member','Amount','Paid','Method','Status','Paid At'] };

    case 'overdue':
      const [overdue] = await pool.query(`SELECT br.transaction_id, b.title, l.full_name, l.email, dd.due_date FROM borrowing_returning br JOIN due_date_overdue dd ON dd.transaction_id=br.transaction_id JOIN member_management m ON br.member_id=m.member_id JOIN login_registration l ON m.user_id=l.user_id JOIN book_management b ON br.book_id=b.book_id WHERE br.status='Borrowed' AND dd.due_date < CURDATE()`);
      return { rows: overdue, columns: ['Tx ID','Book Title','Member','Email','Due Date'] };

    case 'dead-stock':
      const [dead] = await pool.query(`SELECT b.book_id, b.title, b.author, b.isbn, c.category_name FROM book_management b LEFT JOIN category_management c ON b.category_id=c.category_id WHERE b.book_id NOT IN (SELECT DISTINCT book_id FROM borrowing_returning) ORDER BY b.title`);
      return { rows: dead, columns: ['ID','Title','Author','ISBN','Category'] };

    default: return { rows: [], columns: [] };
  }
}

function rowValues(type, row) {
  switch(type){
    case 'books':        return [row.book_id, row.title, row.author||'', row.isbn||'', row.category_name||'', row.price||0, row.total_copies, row.available_copies];
    case 'members':      return [row.member_id, row.full_name, row.username, row.email, row.phone||'', row.join_date, row.status];
    case 'transactions': return [row.transaction_id, row.title, row.member_name, row.issue_date, row.due_date||'', row.return_date||'', row.status];
    case 'fines':        return [row.fine_id, row.title, row.member_name, row.amount, row.amount_paid, row.payment_method||'', row.status, row.paid_at||''];
    case 'overdue':      return [row.transaction_id, row.title, row.full_name, row.email, row.due_date];
    case 'dead-stock':   return [row.book_id, row.title, row.author||'', row.isbn||'', row.category_name||''];
    default: return [];
  }
}

// ── Excel download ─────────────────────────────────────────────────────────
exports.downloadExcel = async (req, res) => {
  const { type } = req.params;
  const { from, to } = req.query;
  try {
    const ExcelJS = require('exceljs');
    const { rows, columns } = await fetchReportData(type, from, to);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'LMS Pro';
    wb.created = new Date();

    const ws = wb.addWorksheet(type.toUpperCase(), { pageSetup:{ paperSize:9, orientation:'landscape' } });

    // Title row
    ws.mergeCells(1,1,1,columns.length);
    const titleCell = ws.getCell('A1');
    titleCell.value = `LMS Pro — ${type.replace(/-/g,' ').toUpperCase()} REPORT`;
    titleCell.font  = { name:'Calibri', bold:true, size:14, color:{argb:'FF5C0F0F'} };
    titleCell.alignment = { horizontal:'center', vertical:'middle' };
    titleCell.fill  = { type:'pattern', pattern:'solid', fgColor:{argb:'FFFDF3DC'} };
    ws.getRow(1).height = 28;

    // Sub-title
    ws.mergeCells(2,1,2,columns.length);
    const subCell = ws.getCell('A2');
    subCell.value = `Generated: ${new Date().toLocaleString()} | Royal Library of Knowledge`;
    subCell.font  = { name:'Calibri', size:10, italic:true, color:{argb:'FF7A6A50'} };
    subCell.alignment = { horizontal:'center' };
    ws.getRow(2).height = 18;

    // Blank row
    ws.addRow([]);

    // Header row
    const headerRow = ws.addRow(columns);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = { name:'Calibri', bold:true, size:10, color:{argb:'FFFFFFFF'} };
      cell.fill = { type:'pattern', pattern:'solid', fgColor:{argb:'FF5C0F0F'} };
      cell.alignment = { horizontal:'center', vertical:'middle', wrapText:true };
      cell.border = { bottom:{ style:'thin', color:{argb:'FFC8940A'} } };
    });

    // Data rows
    rows.forEach((row, i) => {
      const dataRow = ws.addRow(rowValues(type, row));
      dataRow.height = 18;
      dataRow.eachCell(cell => {
        cell.font = { name:'Calibri', size:10 };
        cell.fill = { type:'pattern', pattern:'solid', fgColor:{ argb: i%2===0 ? 'FFFFFFFF' : 'FFFDF3DC' } };
        cell.alignment = { vertical:'middle', wrapText:true };
        cell.border = { bottom:{ style:'hair', color:{argb:'FFE8DEC8'} } };
      });
    });

    // Auto column width
    ws.columns.forEach(col => {
      let maxLen = 12;
      col.eachCell({ includeEmpty:true }, cell => {
        const len = cell.value ? String(cell.value).length : 0;
        if(len > maxLen) maxLen = len;
      });
      col.width = Math.min(maxLen + 4, 40);
    });

    // Summary row
    ws.addRow([]);
    const sumRow = ws.addRow([`Total Records: ${rows.length}`]);
    sumRow.getCell(1).font = { bold:true, color:{argb:'FF5C0F0F'} };

    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename=LMS_${type}_Report_${Date.now()}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch(err){
    console.error(err);
    res.status(500).json({ message:'Excel generation failed.', error: err.message });
  }
};

// ── PDF download ───────────────────────────────────────────────────────────
exports.downloadPDF = async (req, res) => {
  const { type } = req.params;
  const { from, to } = req.query;
  try {
    const PDFDocument = require('pdfkit');
    const { rows, columns } = await fetchReportData(type, from, to);

    const doc = new PDFDocument({ margin:40, size:'A4', layout:'landscape' });
    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition',`attachment; filename=LMS_${type}_Report_${Date.now()}.pdf`);
    doc.pipe(res);

    const W = doc.page.width - 80; // usable width

    // Header background
    doc.rect(0, 0, doc.page.width, 90).fill('#5C0F0F');
    // Gold line
    doc.rect(0, 88, doc.page.width, 3).fill('#C8940A');

    // Logo mark
    doc.roundedRect(40, 15, 36, 36, 6).fill('#C8940A');
    doc.fill('#fff').fontSize(20).font('Helvetica-Bold').text('L', 50, 23);

    // Title
    doc.fill('#fff').fontSize(18).font('Helvetica-Bold')
       .text('LMS Pro — Royal Library of Knowledge', 90, 18, {width: W-50});
    doc.fill('#FDF0C0').fontSize(10).font('Helvetica')
       .text(`${type.replace(/-/g,' ').toUpperCase()} REPORT  |  Generated: ${new Date().toLocaleString()}`, 90, 44);
    doc.fill('#C8940A').fontSize(9)
       .text(`Total Records: ${rows.length}`, 90, 62);

    // Divider
    doc.moveDown(0.5);
    let y = 110;

    // Table header
    const colW = Math.floor(W / columns.length);
    doc.rect(40, y, W, 22).fill('#3D0808');
    doc.fill('#F0C84A').fontSize(8).font('Helvetica-Bold');
    columns.forEach((col, i) => {
      doc.text(col, 42 + i*colW, y+7, { width: colW-4, ellipsis:true });
    });
    y += 22;

    // Table rows
    doc.fontSize(8).font('Helvetica');
    rows.forEach((row, ri) => {
      if(y > doc.page.height - 60) { doc.addPage(); y = 40; }
      const bg = ri%2===0 ? '#FFFFFF' : '#FDF3DC';
      doc.rect(40, y, W, 18).fill(bg);
      doc.fill('#3A2E1E');
      const vals = rowValues(type, row);
      vals.forEach((val, i) => {
        doc.text(String(val??''), 42+i*colW, y+5, { width:colW-4, ellipsis:true });
      });
      // bottom border
      doc.rect(40, y+17, W, 1).fill('#E8DEC8');
      y += 18;
    });

    // Footer
    const pages = doc.bufferedPageRange();
    for(let i=0; i<pages.count; i++){
      doc.switchToPage(pages.start+i);
      doc.rect(0, doc.page.height-30, doc.page.width, 30).fill('#12080A');
      doc.fill('#C8940A').fontSize(8).font('Helvetica')
         .text('LMS Pro · Cambodia Royal Library · Confidential', 40, doc.page.height-18, { align:'left' });
      doc.text(`Page ${i+1} of ${pages.count}`, 0, doc.page.height-18, { align:'right', width: doc.page.width-40 });
    }

    doc.end();
  } catch(err){
    console.error(err);
    res.status(500).json({ message:'PDF generation failed.', error: err.message });
  }
};
