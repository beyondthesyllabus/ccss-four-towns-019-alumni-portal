/* CCSS Four Towns '19 Alumni Portal. Express + MongoDB Atlas (serverless ready) */
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { getDb, nextId } = require('./mongo');

const PUBLIC = path.join(__dirname, '..', 'public');

/* registration fee & bank details (override via env) */
const FEE = {
  amount: Number(process.env.REG_FEE || 1000),
  bank: process.env.BANK_NAME || 'OPay',
  account_number: process.env.BANK_ACCOUNT || '7047788318',
  account_name: process.env.BANK_NAME_ON_ACCT || 'Favour Anthony Etim'
};
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@ccss19set.org').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ccss19admin';
const SITE_URL = process.env.SITE_URL || 'https://ccss-alumni.vercel.app';

/* ---------------- helpers ---------------- */
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const newToken = () => crypto.randomBytes(24).toString('hex');
const nowISO = () => new Date().toISOString();

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

function publicMember(m) {
  const { _id, salt, password_hash, ...rest } = m;
  rest.birthday = birthdayInfo(m.dob);
  return rest;
}

function auth(role) {
  return async (req, res, next) => {
    try {
      const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      if (!t) return res.status(401).json({ error: 'Login required' });
      const db = await getDb();
      const s = await db.collection('sessions').findOne({ token: t });
      if (!s || (role && s.role !== role)) return res.status(401).json({ error: 'Session expired, please login again' });
      req.session = s;
      next();
    } catch (e) { next(e); }
  };
}

/* uploads live inside MongoDB (serverless has no disk) */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif)$/i.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (max 4MB). Please choose a smaller picture.'));
  }
});
const pickPhoto = upload.fields([{ name: 'photo', maxCount: 1 }]);
const pickBirthdayPhoto = upload.fields([{ name: 'birthday_photo', maxCount: 1 }]);
const pickReceipt = upload.fields([{ name: 'photo', maxCount: 1 }, { name: 'receipt', maxCount: 1 }]);
const pickReceiptOnly = upload.fields([{ name: 'receipt', maxCount: 1 }]);

async function saveFile(file, kind) {
  const db = await getDb();
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
  const key = kind + '/' + Date.now() + '-' + Math.round(Math.random() * 1e6) + ext;
  await db.collection('files').updateOne({ _id: key },
    { $set: { contentType: file.mimetype, data: file.buffer, uploaded_at: nowISO() } }, { upsert: true });
  return '/uploads/' + key;
}

function smtpTransport() {
  const nodemailer = require('nodemailer');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

function defaultMsg(m) {
  return `Dear ${m.first_name} ${m.surname},\n\nHappy Birthday in advance from the CCSS Four Towns '19 Set!\n\nPlease upload a fresh picture to the alumni portal for your birthday celebration: ${SITE_URL}/#/login\n\nWith love,\nThe Executives.`;
}

const STATES = ["Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT Abuja","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto","Taraba","Yobe","Zamfara"];
const LGAS = {
  "Akwa Ibom": ["Abak","Eastern Obolo","Eket","Esit Eket","Essien Udim","Etim Ekpo","Etinan","Ibeno","Ibesikpo Asutan","Ibiono-Ibom","Ika","Ikono","Ikot Abasi","Ikot Ekpene","Ini","Itu","Mbo","Mkpat-Enin","Nsit-Atai","Nsit-Ibom","Nsit-Ubium","Obot Akara","Okobo","Onna","Oron","Oruk Anam","Udung-Uko","Ukanafun","Uruan","Urue-Offong/Oruko","Uyo"]
};

/* ---------------- app ---------------- */
const app = express();
app.use(express.json());

app.get('/api/config', (req, res) => {
  res.json({ states: STATES, lgasByState: LGAS, whatsappApi: !!process.env.WHATSAPP_TOKEN, smtp: !!process.env.SMTP_HOST, fee: FEE });
});

/* ---------------- registration & login ---------------- */
app.post('/api/register', pickReceipt, async (req, res, next) => {
  try {
    const b = req.body;
    const required = ['surname', 'first_name', 'dob', 'password'];
    for (const f of required) if (!String(b[f] || '').trim()) return res.status(400).json({ error: 'Please fill all required fields (surname, first name, date of birth, password).' });
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const db = await getDb();
    const email = String(b.email || '').trim().toLowerCase();
    if (email && await db.collection('members').findOne({ email }))
      return res.status(400).json({ error: 'This email is already registered. Try logging in.' });
    const salt = crypto.randomBytes(8).toString('hex');
    const photo = req.files && req.files.photo ? await saveFile(req.files.photo[0], 'profiles') : '';
    const receipt = req.files && req.files.receipt ? await saveFile(req.files.receipt[0], 'receipts') : '';
    const status = receipt ? 'awaiting_verification' : 'awaiting_payment';
    const id = await nextId(db, 'members');
    const doc = {
      id, surname: b.surname.trim(), first_name: b.first_name.trim(), other_names: (b.other_names || '').trim(),
      gender: b.gender || '', state_of_origin: b.state_of_origin || '', lga: b.lga || '',
      marital_status: b.marital_status || '', nationality: (b.nationality || 'Nigerian').trim(),
      whatsapp: (b.whatsapp || '').trim(), email, address: (b.address || '').trim(), position: (b.position || '').trim(),
      dob: b.dob, photo, salt, password_hash: hashPw(b.password, salt),
      status, receipt, verified_at: null, admin_note: '', created_at: nowISO()
    };
    await db.collection('members').insertOne(doc);
    const token = newToken();
    await db.collection('sessions').insertOne({ token, member_id: id, role: 'member', created_at: nowISO() });
    res.json({ token, member: publicMember(doc) });
  } catch (e) { next(e); }
});

app.post('/api/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;
    const id = String(identifier || '').trim().toLowerCase();
    const db = await getDb();
    const m = await db.collection('members').findOne({ $or: [{ email: id }, { whatsapp: String(identifier || '').trim() }] });
    if (!m || !m.password_hash || hashPw(password || '', m.salt) !== m.password_hash)
      return res.status(401).json({ error: 'Invalid email/WhatsApp number or password.' });
    const token = newToken();
    await db.collection('sessions').insertOne({ token, member_id: m.id, role: 'member', created_at: nowISO() });
    res.json({ token, member: publicMember(m) });
  } catch (e) { next(e); }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (String(email || '').trim().toLowerCase() !== ADMIN_EMAIL || String(password || '') !== ADMIN_PASSWORD)
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    const token = newToken();
    const db = await getDb();
    await db.collection('sessions').insertOne({ token, member_id: 0, role: 'admin', created_at: nowISO() });
    res.json({ token });
  } catch (e) { next(e); }
});

app.post('/api/logout', auth(), async (req, res, next) => {
  try {
    const db = await getDb();
    await db.collection('sessions').deleteOne({ token: req.session.token });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

/* ---------------- member ---------------- */
app.get('/api/me', auth('member'), async (req, res, next) => {
  try {
    const db = await getDb();
    const m = await db.collection('members').findOne({ id: req.session.member_id });
    if (!m) return res.status(404).json({ error: 'Member not found' });
    const photos = await db.collection('birthday_photos').find({ member_id: m.id }).sort({ id: -1 }).toArray();
    res.json({ member: publicMember(m), birthdayPhotos: photos });
  } catch (e) { next(e); }
});

app.post('/api/me/photo', auth('member'), pickPhoto, async (req, res, next) => {
  try {
    if (!req.files || !req.files.photo) return res.status(400).json({ error: 'No image received' });
    const p = await saveFile(req.files.photo[0], 'profiles');
    const db = await getDb();
    await db.collection('members').updateOne({ id: req.session.member_id }, { $set: { photo: p } });
    res.json({ ok: true, photo: p });
  } catch (e) { next(e); }
});

app.post('/api/me/birthday-photo', auth('member'), pickBirthdayPhoto, async (req, res, next) => {
  try {
    if (!req.files || !req.files.birthday_photo) return res.status(400).json({ error: 'No image received' });
    const db = await getDb();
    const m = await db.collection('members').findOne({ id: req.session.member_id });
    const p = await saveFile(req.files.birthday_photo[0], 'birthdays');
    const year = new Date().getFullYear();
    const id = await nextId(db, 'birthday_photos');
    await db.collection('birthday_photos').insertOne({ id, member_id: m.id, path: p, year, uploaded_at: nowISO() });
    res.json({ ok: true, photo: p, year });
  } catch (e) { next(e); }
});

app.post('/api/me/receipt', auth('member'), pickReceiptOnly, async (req, res, next) => {
  try {
    if (!req.files || !req.files.receipt) return res.status(400).json({ error: 'No receipt image received' });
    const p = await saveFile(req.files.receipt[0], 'receipts');
    const db = await getDb();
    await db.collection('members').updateOne({ id: req.session.member_id },
      { $set: { receipt: p, status: 'awaiting_verification', admin_note: '' } });
    res.json({ ok: true, receipt: p });
  } catch (e) { next(e); }
});

app.get('/api/gallery', async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.collection('birthday_photos').find({}).sort({ id: -1 }).limit(60).toArray();
    const ids = [...new Set(rows.map(r => r.member_id))];
    const mems = await db.collection('members').find({ id: { $in: ids } }).toArray();
    const byId = Object.fromEntries(mems.map(m => [m.id, m]));
    res.json(rows.map(r => ({ ...r, first_name: (byId[r.member_id] || {}).first_name || '', surname: (byId[r.member_id] || {}).surname || '', position: (byId[r.member_id] || {}).position || '' })));
  } catch (e) { next(e); }
});

/* ---------------- admin ---------------- */
app.get('/api/admin/overview', auth('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const raw = await db.collection('members').find({}).sort({ surname: 1 }).toArray();
    const members = raw.map(publicMember);
    const today = new Date();
    const upcoming = members.filter(m => m.birthday && m.birthday.daysToGo <= 30)
      .sort((a, b) => a.birthday.daysToGo - b.birthday.daysToGo);
    const todayList = members.filter(m => m.birthday && m.birthday.daysToGo === 0);
    const recent = members.filter(m => m.birthday && m.birthday.celebratedThisYear && m.birthday.daysToGo > 0 && (365 - m.birthday.daysToGo) <= 30);
    const photos = await db.collection('birthday_photos').find({}).sort({ id: -1 }).limit(20).toArray();
    const withPhotoThisYear = new Set((await db.collection('birthday_photos').find({ year: today.getFullYear() }).toArray()).map(p => p.member_id));
    const missingPhoto = members.filter(m => m.birthday && m.birthday.celebratedThisYear && !withPhotoThisYear.has(m.id));
    const payments = (await db.collection('members').find({ status: { $in: ['awaiting_verification', 'rejected'] } }).sort({ id: -1 }).toArray()).map(publicMember);
    const pendingCount = await db.collection('members').countDocuments({ status: 'awaiting_verification' });
    res.json({
      stats: {
        members: members.length,
        thisMonth: members.filter(m => m.birthday && m.birthday.month === today.getMonth() + 1).length,
        upcoming: upcoming.length,
        photos: await db.collection('birthday_photos').countDocuments({}),
        pendingVerification: pendingCount
      },
      payments,
      notifications: {
        today: todayList, upcoming: upcoming.filter(m => m.birthday.daysToGo > 0).slice(0, 15), missingPhoto
      },
      recent, upcoming, members
    });
  } catch (e) { next(e); }
});

app.post('/api/admin/verify/:id', auth('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const m = await db.collection('members').findOne({ id: Number(req.params.id) });
    if (!m) return res.status(404).json({ error: 'Member not found' });
    const decision = req.body.decision === 'rejected' ? 'rejected' : 'verified';
    if (decision === 'verified' && !m.receipt) return res.status(400).json({ error: 'Member has not uploaded a payment receipt yet.' });
    const note = String(req.body.note || '');
    await db.collection('members').updateOne({ id: m.id },
      { $set: { status: decision, admin_note: note, verified_at: nowISO() } });
    await db.collection('message_log').insertOne({ id: await nextId(db, 'message_log'), member_id: m.id, channel: 'admin', kind: 'payment-' + decision, detail: note || decision, status: decision, sent_at: nowISO() });
    let emailResult = { sent: false };
    if (decision === 'verified' && m.email) {
      const subject = '✅ CCSS Four Towns \'19 Set Registration Confirmed';
      const text = `Dear ${m.first_name} ${m.surname},\n\nYour ₦${FEE.amount.toLocaleString()} registration fee has been verified and your alumni registration is now COMPLETE.\n\nWelcome to the CCSS Four Towns '19 Set portal! You can now log in, upload your birthday pictures and stay connected with the family.\n\nWith love,\nThe Executives.`;
      if (process.env.SMTP_HOST) {
        try {
          await smtpTransport().sendMail({ from: process.env.SMTP_FROM || 'CCSS Four Towns 19 Set', to: m.email, subject, text });
          emailResult = { sent: true };
        } catch (e) { emailResult = { sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, error: e.message }; }
      } else {
        emailResult = { sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}` };
      }
    }
    res.json({ ok: true, decision, email: emailResult });
  } catch (e) { next(e); }
});

app.post('/api/admin/email/:id', auth('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const m = await db.collection('members').findOne({ id: Number(req.params.id) });
    if (!m) return res.status(404).json({ error: 'Member not found' });
    const subject = req.body.subject || `Happy Birthday ${m.first_name}! 🎂`;
    const text = req.body.message || defaultMsg(m);
    if (!m.email) return res.status(400).json({ error: 'Member has no email on file' });
    const log = async status => db.collection('message_log').insertOne({ id: await nextId(db, 'message_log'), member_id: m.id, channel: 'email', kind: 'request-photo', detail: subject, status, sent_at: nowISO() });
    if (!process.env.SMTP_HOST) {
      await log('fallback-mailto');
      return res.json({ sent: false, mailto: `mailto:${m.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, message: 'SMTP not configured. Opening your mail app instead.' });
    }
    try {
      await smtpTransport().sendMail({ from: process.env.SMTP_FROM || 'CCSS Four Towns 19 Set', to: m.email, subject, text });
      await log('sent');
      res.json({ sent: true });
    } catch (e) {
      await log('failed: ' + e.message);
      res.status(500).json({ error: 'Email failed: ' + e.message });
    }
  } catch (e) { next(e); }
});

app.get('/api/admin/whatsapp-link/:id', auth('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const m = await db.collection('members').findOne({ id: Number(req.params.id) });
    if (!m) return res.status(404).json({ error: 'Member not found' });
    let num = String(m.whatsapp || '').replace(/[^\d]/g, '');
    if (!num) return res.status(400).json({ error: 'No WhatsApp number on file' });
    if (num.startsWith('0')) num = '234' + num.slice(1);
    else if (num.startsWith('2340')) num = num.replace('2340', '234');
    const text = req.query.message || defaultMsg(m);
    await db.collection('message_log').insertOne({ id: await nextId(db, 'message_log'), member_id: m.id, channel: 'whatsapp', kind: 'request-photo', detail: text.slice(0, 120), status: 'link-generated', sent_at: nowISO() });
    res.json({ link: `https://wa.me/${num}?text=${encodeURIComponent(text)}` });
  } catch (e) { next(e); }
});

app.get('/api/admin/messages', auth('admin'), async (req, res, next) => {
  try {
    const db = await getDb();
    const rows = await db.collection('message_log').find({}).sort({ id: -1 }).limit(50).toArray();
    const ids = [...new Set(rows.map(r => r.member_id).filter(Boolean))];
    const mems = await db.collection('members').find({ id: { $in: ids } }).toArray();
    const byId = Object.fromEntries(mems.map(m => [m.id, m]));
    res.json(rows.map(r => ({ ...r, first_name: (byId[r.member_id] || {}).first_name || '', surname: (byId[r.member_id] || {}).surname || '' })));
  } catch (e) { next(e); }
});

app.get('/api/public-stats', async (req, res, next) => {
  try {
    const db = await getDb();
    const today = new Date();
    const members = await db.collection('members').find({}, { projection: { dob: 1 } }).toArray();
    res.json({
      members: members.length,
      thisMonth: members.filter(m => { const b = birthdayInfo(m.dob, today); return b && b.month === today.getMonth() + 1; }).length,
      photos: await db.collection('birthday_photos').countDocuments({})
    });
  } catch (e) { next(e); }
});

/* ---------------- files & static ---------------- */
app.get('/uploads/:kind/:name', async (req, res, next) => {
  try {
    const db = await getDb();
    const f = await db.collection('files').findOne({ _id: req.params.kind + '/' + req.params.name });
    if (!f) return res.status(404).json({ error: 'File not found' });
    res.set('Content-Type', f.contentType || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(Buffer.from(f.data.buffer));
  } catch (e) { next(e); }
});

app.use(express.static(PUBLIC));
app.get(/^(?!\/api|\/uploads).*/, (req, res) => res.sendFile(path.join(PUBLIC, 'index.html')));

/* error handler (multer + unexpected) */
app.use((err, req, res, next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 400);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large. Please choose one under 4MB (or crop it first).' : err.message;
  res.status(status).json({ error: msg });
});

module.exports = app;
