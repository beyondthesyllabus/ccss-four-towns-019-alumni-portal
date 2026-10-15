/* CCSS Four Towns '19 — Alumni Portal (React 18 UMD, hash routing) */
const { useState, useEffect, useRef, useCallback } = React;
const h = React.createElement;

/* ---------------- api + session ---------------- */
const TOKEN_KEY = 'ccss19_token';
const ROLE_KEY = 'ccss19_role';

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.json);
  }
  const r = await fetch('/api' + path, { ...opts, headers });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, kind = '') {
  window.dispatchEvent(new CustomEvent('toast', { detail: { msg, kind } }));
}

function setSession(token, role) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(ROLE_KEY, role);
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ROLE_KEY);
}

/* ---------------- routing ---------------- */
function useHashRoute() {
  const [route, setRoute] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const fn = () => { setRoute(location.hash.slice(1) || '/'); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
  }, []);
  return route;
}
const go = r => { location.hash = r; };

/* ---------------- scroll reveal ---------------- */
function useScrollReveal(dep) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.revealed)');
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('revealed'); io.unobserve(e.target); }
    }), { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

/* ---------------- count-up ---------------- */
function CountUp({ to = 0, dur = 1200 }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf; const t0 = performance.now();
    const tick = t => {
      const p = Math.min((t - t0) / dur, 1);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return v;
}

/* ---------------- shared bits ---------------- */
const fmtDate = iso => {
  if (!iso) return 'Not set';
  const d = new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''));
  return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
const chipFor = b => {
  if (!b) return null;
  if (b.daysToGo === 0) return h('span', { className: 'chip today' }, 'TODAY 🎉');
  if (b.daysToGo <= 7) return h('span', { className: 'chip soon' }, `in ${b.daysToGo} day${b.daysToGo > 1 ? 's' : ''}`);
  return h('span', { className: 'chip later' }, `in ${b.daysToGo} days`);
};
const Avatar = m => h('div', { className: 'avatar' }, m.photo ? h('img', { src: m.photo, alt: m.first_name }) : (m.first_name || '?')[0].toUpperCase() + (m.surname || '')[0].toUpperCase());

/* bank details card for the registration fee */
function BankCard({ fee }) {
  const [copied, setCopied] = useState(false);
  if (!fee) return null;
  const copy = () => {
    navigator.clipboard.writeText(String(fee.account_number)).then(() => { setCopied(true); toast('Account number copied 📋', 'good'); setTimeout(() => setCopied(false), 2000); });
  };
  return h('div', { className: 'bank-card' },
    h('div', { className: 'bank-head' },
      h('span', null, '💳 Registration Fee'),
      h('b', null, '₦' + fee.amount.toLocaleString())),
    h('div', { className: 'bank-rows' },
      h('div', null, h('span', null, 'Bank'), h('b', null, fee.bank)),
      h('div', null, h('span', null, 'Account Number'), h('b', { className: 'acc-num' }, fee.account_number)),
      h('div', null, h('span', null, 'Account Name'), h('b', null, fee.account_name))),
    h('button', { type: 'button', className: 'btn btn-sm ' + (copied ? 'btn-red' : 'btn-ghost'), style: { marginTop: 12, background: '#fff' }, onClick: copy }, copied ? '✅ Copied!' : '📋 Copy Account Number'),
    h('p', { className: 'bank-note' }, 'After payment, upload your receipt here or from your dashboard. The admin will verify it and send you a confirmation email.')
  );
}

const STATUS_META = {
  awaiting_payment: { label: 'Awaiting Payment', cls: 'warn', icon: '🧾', text: m => `Kindly pay the registration fee below, then upload your receipt.` },
  awaiting_verification: { label: 'Pending Verification', cls: 'info', icon: '⏳', text: () => 'Your receipt is with the admin for verification. You will receive an email as soon as it is confirmed.' },
  verified: { label: 'Verified ✓', cls: 'good', icon: '✅', text: () => 'Your payment has been verified and your registration is complete. Welcome to the family!' },
  rejected: { label: 'Payment Rejected', cls: 'bad', icon: '⚠️', text: m => 'The admin could not verify your receipt. Please upload a clearer one or pay again.' }
};

function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => {
    const fn = e => { setT(e.detail); setTimeout(() => setT(null), 3600); };
    window.addEventListener('toast', fn);
    return () => window.removeEventListener('toast', fn);
  }, []);
  return t ? h('div', { className: 'toast ' + (t.kind || '') }, t.msg) : null;
}

/* ---------------- nav ---------------- */
function Nav({ route, session }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);
  useEffect(() => setOpen(false), [route]);

  const link = (to, label) => h('a', { href: '#' + to, className: route === to ? 'active' : '' }, label);
  return h(React.Fragment, null,
    h('header', { className: 'nav' + (scrolled ? ' scrolled' : '') },
      h('div', { className: 'wrap nav-in' },
        h('a', { className: 'brand', href: '#/' },
          h('div', { className: 'brand-badge' }, "'19"),
          h('div', null, h('b', null, "CCSS FOUR TOWNS '19 SET"), h('span', null, 'Alumni Portal'))
        ),
        h('nav', { className: 'links' },
          link('/', 'Home'), link('/register', 'Registration'), link('/gallery', 'Birthday Gallery'),
          session ? link(session.role === 'admin' ? '/admin' : '/member', 'Dashboard') : link('/login', 'Login')
        ),
        h('div', { className: 'nav-cta' },
          session
            ? h('button', { className: 'btn btn-ghost btn-sm', onClick: async () => { try { await api('/logout', { method: 'POST' }); } catch (e) {} clearSession(); toast('Logged out'); go('/'); } }, 'Logout')
            : h('a', { className: 'btn btn-red btn-sm', href: '#/login' }, 'Member Login'),
          h('button', { className: 'burger', 'aria-label': 'menu', onClick: () => setOpen(!open) }, h('i'), h('i'), h('i'))
        )
      )
    ),
    open && h('div', { className: 'mobile-menu' },
      h('a', { href: '#/' }, 'Home'),
      h('a', { href: '#/register' }, 'Alumni Registration'),
      h('a', { href: '#/gallery' }, 'Birthday Gallery'),
      session ? h('a', { href: session.role === 'admin' ? '#/admin' : '#/member' }, 'Dashboard') : h('a', { href: '#/login' }, 'Member / Admin Login')
    )
  );
}

/* ---------------- home ---------------- */
function Home() {
  const [stats, setStats] = useState({ members: 0, thisMonth: 0, photos: 0 });
  const [gallery, setGallery] = useState([]);
  useEffect(() => {
    api('/public-stats').then(setStats).catch(() => {});
    api('/gallery').then(g => setGallery(g.slice(0, 4))).catch(() => {});
  }, []);
  useScrollReveal('home');
  return h(React.Fragment, null,
    h('section', { className: 'hero' },
      h('span', { className: 'confetti', style: { left: '6%', top: '18%' } }, '🎈'),
      h('span', { className: 'confetti', style: { right: '8%', top: '26%', animationDelay: '1.2s' } }, '🎉'),
      h('span', { className: 'confetti', style: { left: '14%', bottom: '16%', animationDelay: '2.1s' } }, '🎂'),
      h('span', { className: 'confetti', style: { right: '14%', bottom: '22%', animationDelay: '.6s' } }, '✨'),
      h('div', { className: 'wrap' },
        h('div', { className: 'hero-pill', 'data-reveal': 'zoom' }, h('i'), 'Alumni Biodata & Birthday Portal'),
        h('h1', { 'data-reveal': 'up', style: { '--rd': '.1s' } },
          "CCSS Four Towns '19 Set", h('br'), h('em', null, 'One Family, Forever Celebrating')),
        h('p', { className: 'lead', 'data-reveal': 'up', style: { '--rd': '.25s' } },
          'Register your biodata, never miss a set member’s birthday, and let the admin team celebrate every one of us in style, with automatic reminders, birthday requests and a growing gallery of our celebrations.'),
        h('div', { className: 'cta', 'data-reveal': 'up', style: { '--rd': '.4s' } },
          h('a', { className: 'btn btn-red', href: '#/register' }, '✍️ Register My Biodata'),
          h('a', { className: 'btn btn-ghost', href: '#/login' }, 'Member Login')
        ),
        h('div', { className: 'stats' },
          [['Members Registered', stats.members], ['Birthdays This Month', stats.thisMonth], ['Celebration Photos', stats.photos], ['Set', 19]].map(([l, v], i) =>
            h('div', { className: 'stat', key: l, 'data-reveal': 'zoom', style: { '--rd': `${0.15 + i * 0.12}s` } },
              h('b', null, i === 3 ? "'19" : h(CountUp, { to: v })), h('span', null, l)))
        )
      )
    ),
    h('section', { className: 'sec' },
      h('div', { className: 'wrap' },
        h('div', { className: 'sec-head', 'data-reveal': 'up' },
          h('span', { className: 'kicker' }, 'Portal Sections'),
          h('h2', null, 'Everything the set needs, ', h('em', null, 'in one place')),
          h('p', null, 'From registration to the birthday desk, built for every member and the executives.')),
        h('div', { className: 'grid3' },
          [
            ['📝', 'Alumni Registration', 'Capture complete biodata: names, gender, state & LGA of origin, marital status, nationality, WhatsApp, email, address, set position and your photo.'],
            ['🔐', 'Membership Login', 'Every member signs in with email or WhatsApp number to see their birthday countdown and upload pictures for their celebration.'],
            ['🎂', 'Admin Birthday Desk', 'The admin gets a live notification bell for upcoming birthdays, and can send the celebrant an email or WhatsApp message requesting a picture.'],
          ].map(([ic, t, p], i) =>
            h('div', { className: 'feat', key: t, 'data-reveal': 'up', style: { '--rd': `${0.1 + i * 0.15}s` } },
              h('div', { className: 'ic' }, ic), h('h3', null, t), h('p', null, p)))
        )
      )
    ),
    h('section', { className: 'sec soft' },
      h('div', { className: 'wrap' },
        h('div', { className: 'sec-head', 'data-reveal': 'up' },
          h('span', { className: 'kicker' }, 'How It Works'),
          h('h2', null, 'From registration to ', h('em', null, 'celebration')),
          h('p', null, 'Four simple steps keep the whole set connected.')),
        h('div', { className: 'steps' },
          [
            ['Register once', 'Fill in your alumni biodata and upload your photo.'],
            ['Get tracked', 'Your birthday is automatically added to the set calendar.'],
            ['Admin is alerted', 'The notification bell rings before every celebration.'],
            ['Celebrate', 'You receive a request for a fresh picture and we post it in the gallery.'],
          ].map(([t, p], i) =>
            h('div', { className: 'step', key: t, 'data-reveal': 'up', style: { '--rd': `${0.12 + i * 0.13}s` } },
              h('div', { className: 'num' }, i + 1), h('h4', null, t), h('p', null, p)))
        )
      )
    ),
    gallery.length > 0 && h('section', { className: 'sec' },
      h('div', { className: 'wrap' },
        h('div', { className: 'sec-head', 'data-reveal': 'up' },
          h('span', { className: 'kicker' }, 'Recent Celebrations'),
          h('h2', null, 'Our ', h('em', null, 'birthday gallery')),
          h('p', null, 'Pictures uploaded by members for their celebrations.')),
        h('div', { className: 'gal' }, gallery.map(p =>
          h('figure', { key: p.id, 'data-reveal': 'zoom', style: { '--rd': '.1s' } },
            h('img', { src: p.path, alt: p.first_name, loading: 'lazy' }),
            h('figcaption', null, h('b', null, `${p.first_name} ${p.surname}`), h('span', null, `Turned ${'🎂'} · ${p.year}`)))
        )),
        h('div', { style: { textAlign: 'center', marginTop: 28 }, 'data-reveal': 'up' },
          h('a', { className: 'btn btn-ghost', href: '#/gallery' }, 'View Full Gallery'))
      ))
  );
}

/* ---------------- register ---------------- */
function Register() {
  const [cfg, setCfg] = useState({ states: [], lgasByState: {} });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [prev, setPrev] = useState('');
  const [f, setF] = useState({
    surname: '', first_name: '', other_names: '', gender: '', state_of_origin: '', lga: '',
    marital_status: '', nationality: 'Nigerian', whatsapp: '', email: '', address: '',
    position: '', dob: '', password: '', password2: '', photo: null, receipt: null
  });
  useEffect(() => { api('/config').then(setCfg).catch(() => {}); }, []);
  const set = k => e => setF({ ...f, [k]: e.target.value });
  const onPhoto = e => {
    const file = e.target.files[0];
    if (!file) return;
    setF({ ...f, photo: file });
    setPrev(URL.createObjectURL(file));
  };
  const [receiptPrev, setReceiptPrev] = useState('');
  const onReceipt = e => {
    const file = e.target.files[0];
    if (!file) return;
    setF({ ...f, receipt: file });
    setReceiptPrev(URL.createObjectURL(file));
  };
  const submit = async e => {
    e.preventDefault(); setErr('');
    if (f.password !== f.password2) return setErr('Passwords do not match.');
    if (!f.dob) return setErr('Please provide your date of birth. It powers your birthday celebration.');
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(f).forEach(([k, v]) => { if (v !== null && k !== 'password2') fd.append(k, v); });
      const r = await api('/register', { method: 'POST', body: fd });
      setSession(r.token, 'member');
      toast('Welcome to the set family! 🎉', 'good');
      go('/member');
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  const field = (k, label, type, extra) => h('div', { className: 'field' + (extra && extra.full ? ' full' : '') },
    h('label', null, label, extra && extra.req !== false ? h('b', null, ' *') : null),
    h('input', { type, value: f[k], onChange: set(k), placeholder: extra && extra.ph, required: extra && extra.req !== false, min: extra && extra.min, max: extra && extra.max }),
    extra && extra.hint ? h('span', { className: 'hint' }, extra.hint) : null);

  useScrollReveal('register');
  return h('section', { className: 'auth' },
    h('form', { className: 'card wide', onSubmit: submit, 'data-reveal': 'up' },
      h('div', { style: { textAlign: 'center', marginBottom: 22 } },
        h('span', { className: 'kicker' }, 'Section 1'),
        h('h2', { style: { fontSize: 26 } }, 'Alumni Registration'),
        h('p', { style: { color: 'var(--muted)', fontSize: 13.5, marginTop: 6 } },
          'A one-time registration fee of ', h('b', { style: { color: 'var(--red-deep)' } }, '₦' + ((cfg.fee && cfg.fee.amount) || 1000).toLocaleString()), ' applies. Simply pay, upload your receipt, and the admin will verify you.')),
      err && h('div', { className: 'err' }, err),
      h('div', { className: 'fee-strip', 'data-reveal': 'up' },
        h('div', { className: 'fee-step' }, h('b', null, '1'), h('span', null, 'Transfer the fee')),
        h('div', { className: 'fee-step' }, h('b', null, '2'), h('span', null, 'Upload your receipt')),
        h('div', { className: 'fee-step' }, h('b', null, '3'), h('span', null, 'Admin verifies you')),
        h('div', { className: 'fee-step' }, h('b', null, '4'), h('span', null, 'Confirmation email'))),
      h(BankCard, { fee: cfg.fee }),
      h('div', { className: 'form-grid' },
        field('surname', 'Surname', 'text', { ph: 'e.g. Effiong' }),
        field('first_name', 'First Name', 'text', { ph: 'e.g. Samuel' }),
        field('other_names', 'Other Names', 'text', { ph: 'Middle names (optional)', req: false }),
        h('div', { className: 'field' }, h('label', null, 'Gender', h('b', null, ' *')),
          h('select', { value: f.gender, onChange: set('gender'), required: true },
            h('option', { value: '' }, 'Select gender'), h('option', null, 'Male'), h('option', null, 'Female'))),
        h('div', { className: 'field' }, h('label', null, 'State of Origin', h('b', null, ' *')),
          h('select', { value: f.state_of_origin, onChange: set('state_of_origin'), required: true },
            h('option', { value: '' }, 'Select state'), cfg.states.map(s => h('option', { key: s, value: s }, s)))),
        h('div', { className: 'field' }, h('label', null, 'LGA of Origin', h('b', null, ' *')),
          h('select', { value: f.lga, onChange: set('lga'), required: true, disabled: !f.state_of_origin },
            h('option', { value: '' }, f.state_of_origin ? 'Select LGA' : 'Choose state first'),
            (cfg.lgasByState[f.state_of_origin] || []).map(l => h('option', { key: l, value: l }, l)))),
        h('div', { className: 'field' }, h('label', null, 'Marital Status', h('b', null, ' *')),
          h('select', { value: f.marital_status, onChange: set('marital_status'), required: true },
            h('option', { value: '' }, 'Select'), h('option', null, 'Single'), h('option', null, 'Married'), h('option', null, 'Other'))),
        field('nationality', 'Nationality', 'text'),
        field('whatsapp', 'WhatsApp Number', 'tel', { ph: '0803 000 0000' }),
        field('email', 'Email Address', 'email', { ph: 'you@example.com' }),
        field('address', 'Residential Address', 'text', { full: true, req: false, ph: 'Street, city, state' }),
        field('position', 'Position in the Alumni Association', 'text', { req: false, ph: 'e.g. President / PRO / Member' }),
        field('dob', 'Date of Birth', 'date', { min: '1950-01-01', max: '2015-12-31', hint: 'Used only to celebrate the day and month of your birthday.' }),
        field('password', 'Create a Password', 'password', { hint: 'At least 6 characters. Use it to log in.' }),
        field('password2', 'Confirm Password', 'password'),
        h('div', { className: 'field full' }, h('label', null, 'Your Photo'),
          prev ? h('img', { className: 'photo-preview', src: prev, alt: 'preview' }) : null,
          h('label', { className: 'photo-drop' },
            h('span', null, prev ? '✅ Photo selected. Tap to change' : '📷 Tap to upload your photo'),
            h('input', { type: 'file', accept: 'image/*', onChange: onPhoto, style: { display: 'none' } }))),
        h('div', { className: 'field full' }, h('label', null, 'Proof of Payment (Receipt)'),
          receiptPrev ? h('img', { className: 'photo-preview', src: receiptPrev, alt: 'receipt preview' }) : null,
          h('label', { className: 'photo-drop receipt' },
            h('span', null, receiptPrev ? '✅ Receipt selected. Tap to change' : '🧾 Tap to upload your payment receipt (screenshot or photo)'),
            h('input', { type: 'file', accept: 'image/*', onChange: onReceipt, style: { display: 'none' } })),
          h('span', { className: 'hint' }, 'You can also upload it later from your dashboard after the transfer.'))
      ),
      h('button', { className: 'btn btn-red', style: { width: '100%', marginTop: 22 }, disabled: busy },
        busy ? 'Registering…' : '🎂 Register & Continue'),
      h('p', { style: { textAlign: 'center', marginTop: 14, fontSize: 13, color: 'var(--muted)' } },
        'Already registered? ', h('a', { href: '#/login', style: { color: 'var(--red-deep)', fontWeight: 700 } }, 'Login here'))
    ));
}

/* ---------------- login ---------------- */
function Login({ onDone }) {
  const [tab, setTab] = useState('member');
  const [f, setF] = useState({ identifier: '', password: '', email: '', adminpw: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (tab === 'member') {
        const r = await api('/login', { method: 'POST', json: { identifier: f.identifier, password: f.password } });
        setSession(r.token, 'member'); toast('Welcome back, ' + r.member.first_name + '! 👋', 'good'); go('/member');
      } else {
        const r = await api('/admin/login', { method: 'POST', json: { email: f.email, password: f.adminpw } });
        setSession(r.token, 'admin'); toast('Admin session started', 'good'); go('/admin');
      }
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  };
  return h('section', { className: 'auth' },
    h('div', { className: 'card', style: { animation: 'popIn .6s cubic-bezier(.16,1,.3,1)' } },
      h('div', { style: { textAlign: 'center', marginBottom: 18 } },
        h('span', { className: 'kicker' }, 'Secure Access'),
        h('h2', { style: { fontSize: 24 } }, 'Membership Login')),
      h('div', { className: 'tabs' },
        h('button', { className: tab === 'member' ? 'on' : '', onClick: () => { setTab('member'); setErr(''); } }, '👤 Member'),
        h('button', { className: tab === 'admin' ? 'on' : '', onClick: () => { setTab('admin'); setErr(''); } }, '🛡️ Admin')),
      err && h('div', { className: 'err' }, err),
      h('form', { onSubmit: submit, style: { display: 'grid', gap: 14 } },
        tab === 'member'
          ? h(React.Fragment, null,
              h('div', { className: 'field' }, h('label', null, 'Email or WhatsApp Number'),
                h('input', { value: f.identifier, onChange: e => setF({ ...f, identifier: e.target.value }), placeholder: 'you@example.com or 0803…', required: true })),
              h('div', { className: 'field' }, h('label', null, 'Password'),
                h('input', { type: 'password', value: f.password, onChange: e => setF({ ...f, password: e.target.value }), required: true })))
          : h(React.Fragment, null,
              h('div', { className: 'field' }, h('label', null, 'Admin Email'),
                h('input', { type: 'email', value: f.email, onChange: e => setF({ ...f, email: e.target.value }), required: true })),
              h('div', { className: 'field' }, h('label', null, 'Admin Password'),
                h('input', { type: 'password', value: f.adminpw, onChange: e => setF({ ...f, adminpw: e.target.value }), required: true }))),
        h('button', { className: 'btn btn-red', disabled: busy, style: { marginTop: 6 } }, busy ? 'Please wait…' : 'Login'),
        h('p', { style: { textAlign: 'center', fontSize: 13, color: 'var(--muted)' } },
          'New to the set portal? ', h('a', { href: '#/register', style: { color: 'var(--red-deep)', fontWeight: 700 } }, 'Register')))
    ));
}

/* ---------------- member dashboard ---------------- */
function MemberDash() {
  const [me, setMe] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [cfg, setCfg] = useState({});
  const [busy, setBusy] = useState(false);
  const load = () => Promise.all([api('/me'), api('/config')]).then(([r, c]) => { setMe(r.member); setPhotos(r.birthdayPhotos); setCfg(c); }).catch(e => { toast(e.message, 'bad'); clearSession(); go('/login'); });
  useEffect(() => { load(); }, []);
  useScrollReveal(me ? 'member' : '');
  if (!me) return h('section', { className: 'auth' }, h('div', { className: 'card' }, 'Loading your dashboard…'));
  const b = me.birthday || {};
  const st = STATUS_META[me.status || 'awaiting_payment'] || STATUS_META.awaiting_payment;
  const uploadReceipt = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('receipt', file);
      await api('/me/receipt', { method: 'POST', body: fd });
      toast('Receipt uploaded. The admin will verify it shortly 🧾', 'good');
      load();
    } catch (ex) { toast(ex.message, 'bad'); }
    setBusy(false);
    e.target.value = '';
  };
  const uploadBirthday = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('birthday_photo', file);
      await api('/me/birthday-photo', { method: 'POST', body: fd });
      toast('Birthday picture uploaded! 🎂', 'good');
      load();
    } catch (ex) { toast(ex.message, 'bad'); }
    setBusy(false);
    e.target.value = '';
  };
  const days = b.daysToGo ?? null;
  return h('section', { className: 'sec' },
    h('div', { className: 'wrap dash' },
      h('div', { className: 'bd-hero', 'data-reveal': 'left' },
        h('h2', null, `Hello, ${me.first_name} ${me.surname} 👋`),
        h('p', null, b.daysToGo === 0
          ? '🎉 Today is YOUR birthday! The whole set is celebrating you.'
          : days <= 7
            ? `Your birthday is in ${days} day${days > 1 ? 's' : ''}. The admin has been notified.`
            : `Your next birthday is in ${days} days.`),
        h('div', { className: 'count-ring' },
          h('div', { className: 'count-box' }, h('b', null, days === 0 ? '🎂' : days), h('span', null, days === 0 ? 'It\'s today' : 'Days to go')),
          h('div', { className: 'count-box' }, h('b', null, b.turnedAge || 'TBC'), h('span', null, 'Turning')),
          h('div', { className: 'count-box' }, h('b', null, fmtDate(b.nextDate)), h('span', null, 'Celebration date'))
        )
      ),
      h('div', { className: 'status-banner ' + st.cls, 'data-reveal': 'up' },
        h('div', { className: 'sb-icon' }, st.icon),
        h('div', { className: 'sb-body' },
          h('b', null, `Registration status: ${st.label}`),
          h('p', null, st.text(me) + (me.status === 'rejected' && me.admin_note ? ` (${me.admin_note})` : '')),
          me.receipt ? h('a', { href: me.receipt, target: '_blank', style: { fontSize: 12.5, fontWeight: 700, textDecoration: 'underline' } }, 'View my uploaded receipt') : null),
        (me.status === 'awaiting_payment' || me.status === 'rejected') && h('label', { className: 'btn btn-red btn-sm' },
          busy ? 'Uploading…' : '🧾 Upload Receipt',
          h('input', { type: 'file', accept: 'image/*', onChange: uploadReceipt, disabled: busy, style: { display: 'none' } }))
      ),
      (me.status === 'awaiting_payment' || me.status === 'rejected') && h('div', { 'data-reveal': 'up' }, h(BankCard, { fee: cfg.fee })),
      h('div', { className: 'grid3', style: { gridTemplateColumns: '1.1fr .9fr' } },
        h('div', { className: 'panel', 'data-reveal': 'up' },
          h('h3', null, h('span', { className: 'dot' }), 'My Birthday Picture'),
          h('div', { className: 'body', style: { padding: 20 } },
            b.celebratedThisYear
              ? h('p', { style: { fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 } }, 'Your birthday has come this year. Upload a fresh picture for the set celebration 👇')
              : h('p', { style: { fontSize: 13.5, color: 'var(--muted)', marginBottom: 14 } }, 'You can upload a picture now; it will be featured when your birthday comes.'),
            h('label', { className: 'photo-drop' },
              h('span', null, busy ? 'Uploading…' : '📸 Upload picture for my celebration'),
              h('input', { type: 'file', accept: 'image/*', onChange: uploadBirthday, disabled: busy, style: { display: 'none' } }))
          )),
        h('div', { className: 'panel', 'data-reveal': 'up', style: { '--rd': '.15s' } },
          h('h3', null, h('span', { className: 'dot' }), 'My Biodata'),
          h('div', { className: 'body', style: { padding: '12px 20px', maxHeight: 'none' } },
            [['Name', `${me.first_name} ${me.surname}${me.other_names ? ' ' + me.other_names : ''}`], ['Gender', me.gender], ['Position', me.position || 'Member'],
             ['State & LGA', `${me.state_of_origin || 'Not set'}, ${me.lga || 'Not set'}`], ['Marital Status', me.marital_status], ['Nationality', me.nationality],
             ['WhatsApp', me.whatsapp], ['Email', me.email], ['Address', me.address], ['Date of Birth', fmtDate(me.dob)]
            ].map(([k, v]) => h('div', { key: k, style: { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px dashed #f7e3e0', fontSize: 13 } },
              h('b', { style: { color: '#5c434b' } }, k), h('span', { style: { color: 'var(--muted)', textAlign: 'right' } }, v || 'Not provided')))
          ))
      ),
      h('div', { className: 'panel', 'data-reveal': 'up' },
        h('h3', null, h('span', { className: 'dot' }), `My Celebration Photos (${photos.length})`),
        photos.length
          ? h('div', { style: { padding: 18 }, className: 'gal' }, photos.map(p =>
              h('figure', { key: p.id }, h('img', { src: p.path, alt: 'birthday' }),
                h('figcaption', null, h('b', null, `${p.year} Celebration`), h('span', null, fmtDate(p.uploaded_at.slice(0, 10)))))))
          : h('div', { className: 'empty' }, 'No pictures yet. Please upload one above 📷'))
    ));
}

/* ---------------- admin dashboard ---------------- */
function AdminDash() {
  const [ov, setOv] = useState(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [q, setQ] = useState('');
  const load = useCallback(() => api('/admin/overview').then(setOv).catch(e => { toast(e.message, 'bad'); clearSession(); go('/login'); }), []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useScrollReveal(ov ? 'admin' : '');
  if (!ov) return h('section', { className: 'auth' }, h('div', { className: 'card' }, 'Loading admin desk…'));

  const n = ov.notifications;
  const notifCount = n.today.length + n.upcoming.filter(m => m.birthday.daysToGo <= 7).length + n.missingPhoto.length + (ov.stats.pendingVerification || 0);

  const verify = async (m, decision) => {
    let note = '';
    if (decision === 'rejected') {
      note = prompt(`Why are you rejecting ${m.first_name}'s payment? (they will see this note)`) || '';
    }
    try {
      const r = await api(`/admin/verify/${m.id}`, { method: 'POST', json: { decision, note } });
      if (decision === 'verified') {
        toast(`${m.first_name} verified ✅ Confirmation ${r.email && r.email.sent ? 'email sent' : 'ready to send'}`, 'good');
        if (r.email && r.email.mailto) window.location.href = r.email.mailto;
      } else toast(`${m.first_name}'s payment was rejected`, 'bad');
      load();
    } catch (e) { toast(e.message, 'bad'); }
  };

  const sendEmail = async m => {
    try {
      const r = await api(`/admin/email/${m.id}`, { method: 'POST', json: {} });
      if (r.sent) toast(`Email sent to ${m.first_name} ✉️`, 'good');
      else if (r.mailto) { toast('Opening your mail app (SMTP not configured yet)…'); window.location.href = r.mailto; }
      load();
    } catch (e) { toast(e.message, 'bad'); }
  };
  const sendWa = async m => {
    try {
      const r = await api(`/admin/whatsapp-link/${m.id}`);
      window.open(r.link, '_blank');
      load();
    } catch (e) { toast(e.message, 'bad'); }
  };

  const memRow = (m, extra) => h('div', { className: 'mem-row', key: m.id },
    Avatar(m),
    h('div', { className: 'nm' },
      h('b', null, `${m.first_name} ${m.surname}`),
      h('span', null, `${m.position || 'Member'} · ${fmtDate(m.dob)}`)),
    h('div', { className: 'mem-actions' },
      chipFor(m.birthday),
      m.status && m.status !== 'verified' && h('span', { className: 'chip ' + (m.status === 'awaiting_verification' ? 'soon' : 'later') }, (STATUS_META[m.status] || {}).label || m.status),
      extra,
      h('button', { className: 'btn btn-wa btn-sm', title: 'WhatsApp: request a picture', onClick: () => sendWa(m) }, 'WhatsApp'),
      h('button', { className: 'btn btn-mail btn-sm', title: 'Email: request a picture', onClick: () => sendEmail(m) }, 'Email')
    ));

  const filtered = ov.members.filter(m => (m.first_name + ' ' + m.surname + ' ' + (m.position || '')).toLowerCase().includes(q.toLowerCase()));

  return h('section', { className: 'sec', style: { paddingTop: 40 } },
    h('div', { className: 'wrap dash' },
      h('div', { className: 'dash-top', 'data-reveal': 'up' },
        h('h2', { className: 'serif' }, 'Admin Birthday Desk',
          h('small', null, "CCSS Four Towns '19 Set · refreshes automatically every 60 seconds")),
        h('div', { style: { position: 'relative' } },
          h('button', { className: 'bell' + (notifCount ? ' ringing' : ''), onClick: () => setBellOpen(!bellOpen), title: 'Birthday notifications' },
            '🔔', notifCount > 0 && h('i', { className: 'badge' }, notifCount)),
          bellOpen && h('div', { className: 'notif-panel' },
            h('h4', null, `Birthday Notifications (${notifCount})`),
            notifCount === 0 && h('div', { className: 'empty' }, 'No upcoming birthdays in the next 30 days 🎈'),
            n.today.map(m => h('div', { className: 'notif-item', key: 't' + m.id }, h('span', { className: 'cake' }, '🎂'),
              h('div', null, h('b', null, `${m.first_name} ${m.surname}`), h('span', null, 'Birthday is TODAY!')), h('span', { className: 'chip today' }, 'Now'))),
            n.upcoming.map(m => h('div', { className: 'notif-item', key: 'u' + m.id }, h('span', { className: 'cake' }, '🎈'),
              h('div', null, h('b', null, `${m.first_name} ${m.surname}`), h('span', null, 'Celebration coming up')), chipFor(m.birthday))),
            n.missingPhoto.map(m => h('div', { className: 'notif-item', key: 'p' + m.id }, h('span', { className: 'cake' }, '📷'),
              h('div', null, h('b', null, `${m.first_name} ${m.surname}`), h('span', null, 'Celebrated but no picture uploaded')),
              h('span', { className: 'chip soon' }, 'Needs photo'))),
            (ov.payments || []).filter(p => p.status === 'awaiting_verification').map(m => h('div', { className: 'notif-item', key: 'v' + m.id }, h('span', { className: 'cake' }, '🧾'),
              h('div', null, h('b', null, `${m.first_name} ${m.surname}`), h('span', null, 'Payment receipt awaiting verification')),
              h('span', { className: 'chip soon' }, 'Verify'))))
        )
      ),
      h('div', { className: 'stat-cards' },
        [['Total Members', ov.stats.members], ['Awaiting Verification', ov.stats.pendingVerification], ['Birthdays This Month', ov.stats.thisMonth], ['Upcoming (30 days)', ov.stats.upcoming], ['Celebration Photos', ov.stats.photos]]
          .map(([l, v], i) => h('div', { className: 'sc', key: l, 'data-reveal': 'zoom', style: { '--rd': `${0.08 * i}s` } },
            h('b', null, h(CountUp, { to: v })), h('span', null, l)))
      ),
      h('div', { className: 'panel payments-panel', 'data-reveal': 'up' },
        h('h3', null, h('span', { className: 'dot' }), `🧾 Payment Verification (${(ov.payments || []).length})`),
        h('div', { className: 'body' },
          (ov.payments || []).length
            ? ov.payments.map(m => h('div', { className: 'mem-row', key: m.id },
                Avatar(m),
                h('div', { className: 'nm' },
                  h('b', null, `${m.first_name} ${m.surname}${m.other_names ? ' ' + m.other_names : ''}`),
                  h('span', null, `${m.whatsapp || 'No number'} · ${m.email || 'No email'}`)),
                m.receipt
                  ? h('a', { href: m.receipt, target: '_blank', title: 'View receipt' }, h('img', { className: 'receipt-thumb', src: m.receipt, alt: 'receipt' }))
                  : h('span', { className: 'chip later' }, 'No receipt yet'),
                h('div', { className: 'mem-actions' },
                  m.status === 'awaiting_verification'
                    ? h(React.Fragment, null,
                        h('button', { className: 'btn btn-sm', style: { background: 'var(--green)', color: '#fff' }, onClick: () => verify(m, 'verified') }, '✅ Verify'),
                        h('button', { className: 'btn btn-sm', style: { background: '#fff', border: '1.5px solid var(--red)', color: 'var(--red-deep)' }, onClick: () => verify(m, 'rejected') }, '✗ Reject'))
                    : h('span', { className: 'chip soon' }, 'Awaiting payment'))))
            : h('div', { className: 'empty' }, 'No payments waiting for verification 🎉'))
      ),
      h('div', { className: 'grid3', style: { gridTemplateColumns: '1fr 1fr' } },
        h('div', { className: 'panel', 'data-reveal': 'left' },
          h('h3', null, h('span', { className: 'dot' }), '🎂 Today & Upcoming Birthdays'),
          h('div', { className: 'body' },
            [...n.today, ...ov.upcoming].length
              ? [...n.today, ...ov.upcoming].map(m => memRow(m))
              : h('div', { className: 'empty' }, 'No birthdays in the next 30 days.'))),
        h('div', { className: 'panel', 'data-reveal': 'right' },
          h('h3', null, h('span', { className: 'dot' }), '📷 Celebrated, Awaiting Picture'),
          h('div', { className: 'body' },
            n.missingPhoto.length
              ? n.missingPhoto.map(m => memRow(m, h('span', { className: 'chip soon' }, 'No photo')))
              : h('div', { className: 'empty' }, 'Everyone who celebrated has uploaded a picture 🎉')))
      ),
      h('div', { className: 'panel', 'data-reveal': 'up' },
        h('h3', null, h('span', { className: 'dot' }), 'All Registered Members'),
        h('div', { style: { padding: '0 20px' } },
          h('input', { className: 'search', placeholder: '🔍 Search by name or position…', value: q, onChange: e => setQ(e.target.value) })),
        h('div', { className: 'body' },
          filtered.map(m => memRow(m, h('span', { className: 'chip later' }, m.birthday ? fmtDate(m.birthday.nextDate) : 'No birthday set'))),
          !filtered.length && h('div', { className: 'empty' }, 'No match found.')))
    ));
}

/* ---------------- gallery ---------------- */
function Gallery() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/gallery').then(setRows).catch(() => {}); }, []);
  useScrollReveal('gal');
  return h('section', { className: 'sec' },
    h('div', { className: 'wrap' },
      h('div', { className: 'sec-head', 'data-reveal': 'up' },
        h('span', { className: 'kicker' }, 'Celebrations'),
        h('h2', null, 'Birthday ', h('em', null, 'Gallery')),
        h('p', null, 'Pictures our members uploaded for their celebrations.')),
      rows.length
        ? h('div', { className: 'gal' }, rows.map((p, i) =>
            h('figure', { key: p.id, 'data-reveal': 'zoom', style: { '--rd': `${Math.min(i * 0.07, 0.5)}s` } },
              h('img', { src: p.path, alt: p.first_name, loading: 'lazy' }),
              h('figcaption', null, h('b', null, `${p.first_name} ${p.surname}`), h('span', null, `${p.position || 'Member'} · ${p.year}`)))))
        : h('div', { className: 'empty' }, 'No celebration photos yet. Members can upload from their dashboard 📷'))
  );
}

/* ---------------- footer ---------------- */
const Foot = () => h('footer', { className: 'foot' },
  h('div', { className: 'wrap' },
    h('div', { className: 'fb' }, "CCSS Four Towns '19 Set"),
    h('p', null, 'Alumni Biodata Registration & Birthday Celebration Portal'),
    h('p', null, `© ${new Date().getFullYear()}. With love, the executives. One family, forever celebrating. ❤️`)));

/* ---------------- app ---------------- */
function App() {
  const route = useHashRoute();
  const [role, setRole] = useState(localStorage.getItem(ROLE_KEY));
  useEffect(() => setRole(localStorage.getItem(ROLE_KEY)), [route]);
  const session = localStorage.getItem(TOKEN_KEY) ? { role } : null;
  useScrollReveal(route);

  const guard = (need, view) => session && session.role === need ? view : h(Login, {});

  let page;
  if (route === '/register') page = h(Register);
  else if (route === '/login') page = h(Login);
  else if (route === '/member') page = guard('member', h(MemberDash));
  else if (route === '/admin') page = guard('admin', h(AdminDash));
  else if (route === '/gallery') page = h(Gallery);
  else page = h(Home);

  return h(React.Fragment, null,
    h(Nav, { route, session }),
    page,
    h(Foot),
    h(ToastHost));
}

ReactDOM.createRoot(document.getElementById('root')).render(h(App));
