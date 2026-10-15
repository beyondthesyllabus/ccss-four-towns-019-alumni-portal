require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const Database = require('better-sqlite3');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const UPLOADS = path.join(ROOT, 'uploads');
for (const d of [PUBLIC, UPLOADS, path.join(UPLOADS, 'profiles'), path.join(UPLOADS, 'birthdays'), path.join(UPLOADS, 'receipts')]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}

/* ---------------- database ---------------- */
const db = new Database(path.join(ROOT, 'portal.db'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  surname TEXT NOT NULL, first_name TEXT NOT NULL, other_names TEXT DEFAULT '',
  gender TEXT, state_of_origin TEXT, lga TEXT, marital_status TEXT, nationality TEXT,
  whatsapp TEXT, email TEXT UNIQUE, address TEXT, position TEXT,
  dob TEXT NOT NULL, photo TEXT DEFAULT '',
  salt TEXT, password_hash TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, member_id INTEGER, role TEXT DEFAULT 'member',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS birthday_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL, path TEXT NOT NULL, year INTEGER NOT NULL,
  uploaded_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY(member_id) REFERENCES members(id)
);
CREATE TABLE IF NOT EXISTS message_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER, channel TEXT, kind TEXT, detail TEXT,
  status TEXT, sent_at TEXT DEFAULT (datetime('now'))
);
`);

/* migration: registration fee / verification fields */
for (const col of [
  "ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'awaiting_payment'",
  'ALTER TABLE members ADD COLUMN receipt TEXT DEFAULT \'\'',
  'ALTER TABLE members ADD COLUMN verified_at TEXT',
  'ALTER TABLE members ADD COLUMN admin_note TEXT DEFAULT \'\''
]) { try { db.exec(col); } catch (e) { /* already exists */ } }

/* registration fee & bank details (override via .env) */
const FEE = {
  amount: Number(process.env.REG_FEE || 1000),
  bank: process.env.BANK_NAME || 'OPay',
  account_number: process.env.BANK_ACCOUNT || '7047788318',
  account_name: process.env.BANK_NAME_ON_ACCT || 'Favour Anthony Etim'
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@ccss19set.org';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ccss19admin';

/* ---------------- helpers ---------------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');

function birthdayInfo(dob, today = new Date()) {
  if (!dob) return null;
  const [y, m, d] = dob.split('-').map(Number);
  if (!y || !m || !d) return null;
  const thisYear = new Date(today.getFullYear(), m - 1, d);
  let next = thisYear;
  if (thisYear < new Date(today.getFullYear(), today.getMonth(), today.getDate())) {
    next = new Date(today.getFullYear() + 1, m - 1, d);
  }
  const days = Math.round((next - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / 86400000);
  const turnedAge = next.getFullYear() - y;
  const celebratedThisYear = next.getFullYear() === today.getFullYear() && (thisYear <= today);
  return { month: m, day: d, daysToGo: days, nextDate: next.toISOString().slice(0, 10), turnedAge, celebratedThisYear };
}

function auth(role) {
  return (req, res, next) => {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!t) return res.status(401).json({ error: 'Login required' });
    const s = db.prepare('SELECT * FROM sessions WHERE token=?').get(t);
    if (!s || (role && s.role !== role)) return res.status(401).json({ error: 'Session expired, please login again' });
    req.session = s;
    next();
  };
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(UPLOADS, file.fieldname === 'birthday_photo' ? 'birthdays' : file.fieldname === 'receipt' ? 'receipts' : 'profiles')),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase())
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|heic|heif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});
const pickPhoto = upload.fields([{ name: 'photo', maxCount: 1 }]);
const pickBirthdayPhoto = upload.fields([{ name: 'birthday_photo', maxCount: 1 }]);
const pickReceipt = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'receipt', maxCount: 1 }]);
const pickReceiptOnly = upload.fields([{ name: 'receipt', maxCount: 1 }]);

const app = express();
app.use(express.json());

/* ---------------- public ---------------- */
app.get('/api/config', (req, res) => {
  res.json({ states: STATES, lgasByState: LGAS, whatsappApi: !!process.env.WHATSAPP_TOKEN, smtp: !!process.env.SMTP_HOST, fee: FEE });
});

const STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const LGAS = {
  "Akwa Ibom": ["Abak","Eastern Obolo","Eket","Esit Eket","Essien Udim","Etim Ekpo","Etinan","Ibeno","Ibesikpo Asutan","Ibiono-Ibom","Ika","Ikono","Ikot Abasi","Ikot Ekpene","Ini","Itu","Mbo","Mkpat-Enin","Nsit-Atai","Nsit-Ibom","Nsit-Ubium","Obot Akara","Okobo","Onna","Oron","Oruk Anam","Udung-Uko","Ukanafun","Uruan","Urue-Offong/Oruko","Uyo"]
};

/* ---------------- registration & login ---------------- */
app.post('/api/register', pickReceipt, (req, res) => {
  try {
    const b = req.body;
    const required = ['surname', 'first_name', 'dob', 'password'];
    for (const f of required) if (!String(b[f] || '').trim()) return res.status(400).json({ error: 'Please fill all required fields (surname, first name, date of birth, password).' });
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (db.prepare('SELECT id FROM members WHERE email=?').get(String(b.email || '').trim().toLowerCase()))
      return res.status(400).json({ error: 'This email is already registered. Try logging in.' });
    const salt = crypto.randomBytes(8).toString('hex');
    const photo = req.files && req.files.photo ? '/uploads/profiles/' + req.files.photo[0].filename : '';
    const receipt = req.files && req.files.receipt ? '/uploads/receipts/' + req.files.receipt[0].filename : '';
    const status = receipt ? 'awaiting_verification' : 'awaiting_payment';
    const info = db.prepare(`INSERT INTO members
      (surname, first_name, other_names, gender, state_of_origin, lga, marital_status, nationality,
       whatsapp, email, address, position, dob, photo, salt, password_hash, status, receipt)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?,?)`).run(
        b.surname.trim(), b.first_name.trim(), (b.other_names || '').trim(), b.gender || '', b.state_of_origin || '', b.lga || '',
        b.marital_status || '', (b.nationality || 'Nigerian').trim(), (b.whatsapp || '').trim(),
        String(b.email || '').trim().toLowerCase(), (b.address || '').trim(), (b.position || '').trim(),
        b.dob, photo, salt, hashPw(b.password, salt), status, receipt);
    const token = newToken();
    db.prepare('INSERT INTO sessions (token, member_id, role) VALUES (?,?,?)').run(token, info.lastInsertRowid, 'member');
    res.json({ token, member: publicMember(db.prepare('SELECT * FROM members WHERE id=?').get(info.lastInsertRowid)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function publicMember(m) {
  const { salt, password_hash, ...rest } = m;
  rest.birthday = birthdayInfo(m.dob);
  return rest;
}

app.post('/api/login', (req, res) => {
  const { identifier, password } = req.body;
  const id = String(identifier || '').trim().toLowerCase();
  const m = db.prepare('SELECT * FROM members WHERE lower(email)=? OR whatsapp=?').get(id, String(identifier || '').trim());
  if (!m || !m.password_hash || hashPw(password || '', m.salt) !== m.password_hash)
    return res.status(401).json({ error: 'Invalid email/WhatsApp number or password.' });
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, member_id, role) VALUES (?,?,?)').run(token, m.id, 'member');
  res.json({ token, member: publicMember(m) });
});

app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (String(email || '').trim().toLowerCase() !== ADMIN_EMAIL.toLowerCase() || String(password || '') !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, member_id, role) VALUES (?,?,?)').run(token, 0, 'admin');
  res.json({ token });
});

app.post('/api/logout', auth(), (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token=?').run(req.session.token);
  res.json({ ok: true });
});

/* ---------------- member ---------------- */
app.get('/api/me', auth('member'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.session.member_id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const photos = db.prepare('SELECT * FROM birthday_photos WHERE member_id=? ORDER BY id DESC').all(m.id);
  res.json({ member: publicMember(m), birthdayPhotos: photos });
});

app.post('/api/me/photo', auth('member'), pickPhoto, (req, res) => {
  if (!req.files || !req.files.photo) return res.status(400).json({ error: 'No image received' });
  const p = '/uploads/profiles/' + req.files.photo[0].filename;
  db.prepare('UPDATE members SET photo=? WHERE id=?').run(p, req.session.member_id);
  res.json({ ok: true, photo: p });
});

app.post('/api/me/birthday-photo', auth('member'), pickBirthdayPhoto, (req, res) => {
  if (!req.files || !req.files.birthday_photo) return res.status(400).json({ error: 'No image received' });
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.session.member_id);
  const bi = birthdayInfo(m.dob) || {};
  const year = bi.celebratedThisYear ? new Date().getFullYear() : new Date().getFullYear();
  const p = '/uploads/birthdays/' + req.files.birthday_photo[0].filename;
  db.prepare('INSERT INTO birthday_photos (member_id, path, year) VALUES (?,?,?)').run(m.id, p, year);
  res.json({ ok: true, photo: p, year });
});

app.post('/api/me/receipt', auth('member'), pickReceiptOnly, (req, res) => {
  if (!req.files || !req.files.receipt) return res.status(400).json({ error: 'No receipt image received' });
  const p = '/uploads/receipts/' + req.files.receipt[0].filename;
  db.prepare("UPDATE members SET receipt=?, status='awaiting_verification', admin_note='' WHERE id=?").run(p, req.session.member_id);
  res.json({ ok: true, receipt: p });
});

app.get('/api/gallery', (req, res) => {
  const rows = db.prepare(`SELECT bp.*, m.first_name, m.surname, m.position FROM birthday_photos bp
    JOIN members m ON m.id=bp.member_id ORDER BY bp.id DESC LIMIT 60`).all();
  res.json(rows);
});

/* ---------------- admin ---------------- */
function allWithBirthdays() {
  return db.prepare('SELECT * FROM members ORDER BY surname').all().map(publicMember);
}

app.get('/api/admin/overview', auth('admin'), (req, res) => {
  const members = allWithBirthdays();
  const today = new Date();
  const upcoming = members.filter(m => m.birthday && m.birthday.daysToGo <= 30)
    .sort((a, b) => a.birthday.daysToGo - b.birthday.daysToGo);
  const todayList = members.filter(m => m.birthday && m.birthday.daysToGo === 0);
  const recent = members.filter(m => m.birthday && m.birthday.celebratedThisYear && m.birthday.daysToGo > 0 && (365 - m.birthday.daysToGo) <= 30);
  const photos = db.prepare('SELECT * FROM birthday_photos ORDER BY id DESC LIMIT 20').all();
  const missingPhoto = members.filter(m => m.birthday && m.birthday.celebratedThisYear &&
    !db.prepare('SELECT id FROM birthday_photos WHERE member_id=? AND year=?').get(m.id, today.getFullYear()));
  const payments = db.prepare("SELECT * FROM members WHERE status IN ('awaiting_verification','rejected') ORDER BY id DESC").all().map(publicMember);
  const pendingCount = db.prepare("SELECT COUNT(*) c FROM members WHERE status='awaiting_verification'").get().c;
  res.json({
    stats: {
      members: members.length,
      thisMonth: members.filter(m => m.birthday && m.birthday.month === today.getMonth() + 1).length,
      upcoming: upcoming.length,
      photos: db.prepare('SELECT COUNT(*) c FROM birthday_photos').get().c,
      pendingVerification: pendingCount
    },
    payments,
    notifications: {
      today: todayList, upcoming: upcoming.filter(m => m.birthday.daysToGo > 0).slice(0, 15), missingPhoto
    },
    recent, upcoming, members
  });
});

app.post('/api/admin/verify/:id', auth('admin'), async (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const decision = req.body.decision === 'rejected' ? 'rejected' : 'verified';
  if (decision === 'verified' && !m.receipt) return res.status(400).json({ error: 'Member has not uploaded a payment receipt yet.' });
  const note = String(req.body.note || '');
  db.prepare("UPDATE members SET status=?, admin_note=?, verified_at=datetime('now') WHERE id=?").run(decision, note, m.id);
  db.prepare('INSERT INTO message_log (member_id, channel, kind, detail, status) VALUES (?,?,?,?,?)')
    .run(m.id, 'admin', 'payment-' + decision, note || decision, decision);
  let emailResult = { sent: false };
  if (decision === 'verified' && m.email) {
    const subject = '✅ CCSS Four Towns \'19 Set Registration Confirmed';
    const text = `Dear ${m.first_name} ${m.surname},\n\nYour ₦1,000 registration fee has been verified and your alumni registration is now COMPLETE.\n\nWelcome to the CCSS Four Towns '19 Set portal! You can now log in, upload your birthday pictures and stay connected with the family.\n\nWith love,\nThe Executives.`;
    if (process.env.SMTP_HOST) {
      try {
        const nodemailer = require('nodemailer');
        const tr = nodemailer.createTransport({
          host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
          secure: process.env.SMTP_SECURE === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        });
        await tr.sendMail({ from: process.env.SMTP_FROM || 'CCSS Four Towns 19 Set', to: m.email, subject, text });
        emailResult = { sent: true };
      } catch (e) { emailResult = { sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, error: e.message }; }
    } else {
      emailResult = { sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` };
    }
  }
  res.json({ ok: true, decision, email: emailResult });
});

app.post('/api/admin/email/:id', auth('admin'), async (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  const subject = req.body.subject || `Happy Birthday ${m.first_name}! 🎂`;
  const text = req.body.message || defaultMsg(m);
  if (!m.email) return res.status(400).json({ error: 'Member has no email on file' });
  if (!process.env.SMTP_HOST) {
    db.prepare('INSERT INTO message_log (member_id, channel, kind, detail, status) VALUES (?,?,?,?,?)')
      .run(m.id, 'email', 'request-photo', subject, 'fallback-mailto');
    return res.json({ sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, message: 'SMTP not configured. Opening your mail app instead.' });
  }
  try {
    const nodemailer = require('nodemailer');
    const tr = nodemailer.createTransport({
      host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    await tr.sendMail({ from: `${process.env.SMTP_FROM || 'CCSS Four Towns 19 Set'}`, to: m.email, subject, text });
    db.prepare('INSERT INTO message_log (member_id, channel, kind, detail, status) VALUES (?,?,?,?,?)').run(m.id, 'email', 'request-photo', subject, 'sent');
    res.json({ sent: true });
  } catch (e) {
    db.prepare('INSERT INTO message_log (member_id, channel, kind, detail, status) VALUES (?,?,?,?,?)').run(m.id, 'email', 'request-photo', subject, 'failed: ' + e.message);
    res.status(500).json({ error: 'Email failed: ' + e.message });
  }
});

function defaultMsg(m) {
  return `Dear ${m.first_name} ${m.surname},\n\nHappy Birthday in advance from the CCSS Four Towns '19 Set!\n\nPlease upload a fresh picture to the alumni portal for your birthday celebration: http://localhost:4000/#/login\n\nWith love,\nThe Executives.`;
}

app.get('/api/admin/whatsapp-link/:id', auth('admin'), (req, res) => {
  const m = db.prepare('SELECT * FROM members WHERE id=?').get(req.params.id);
  if (!m) return res.status(404).json({ error: 'Member not found' });
  let num = String(m.whatsapp || '').replace(/[^\d]/g, '');
  if (!num) return res.status(400).json({ error: 'No WhatsApp number on file' });
  if (num.startsWith('0')) num = '234' + num.slice(1);
  else if (num.startsWith('2340')) num = num.replace('2340', '234');
  const text = req.query.message || defaultMsg(m);
  db.prepare('INSERT INTO message_log (member_id, channel, kind, detail, status) VALUES (?,?,?,?,?)').run(m.id, 'whatsapp', 'request-photo', text.slice(0, 120), 'link-generated');
  res.json({ link: `https://wa.me/${num}?text=${encodeURIComponent(text)}` });
});

app.get('/api/admin/messages', auth('admin'), (req, res) => {
  res.json(db.prepare(`SELECT ml.*, m.first_name, m.surname FROM message_log ml LEFT JOIN members m ON m.id=ml.member_id ORDER BY ml.id DESC LIMIT 50`).all());
});

app.get('/api/public-stats', (req, res) => {
  const today = new Date();
  const members = db.prepare('SELECT dob FROM members').all();
  res.json({
    members: members.length,
    thisMonth: members.filter(m => { const b = birthdayInfo(m.dob, today); return b && b.month === today.getMonth() + 1; }).length,
    photos: db.prepare('SELECT COUNT(*) c FROM birthday_photos').get().c
  });
});

/* ---------------- static ---------------- */
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(PUBLIC));
app.get(/^\/(?!api|uploads).*/, (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

app.use((err, req, res, next) => { res.status(400).json({ error: err.message }); });

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => console.log(`CCSS Four Towns '19 portal running: http://localhost:${PORT}`));
