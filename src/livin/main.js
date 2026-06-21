
import lvmSeed from './lvm_kgb_data.json';

const initialMerchants = normalizeLvmRows(lvmSeed);

const state = {
  tab: 'summary',
  merchants: initialMerchants,
  claims: buildDummyClaims(initialMerchants),
  merchantFileName: 'Data LVM KGB.xlsx',
  claimsFileName: 'Belum ada file bukti',
  search: '',
  classFilter: 'all',
  claimFilter: 'all',
  uploadDraft: { merchantRows: null, claimRows: null, merchantName: '', claimName: '' }
};

const app = document.getElementById('app');

function fmt(n) {
  return Number(n || 0).toLocaleString('id-ID');
}

function money(n) {
  return `Rp${Number(n || 0).toLocaleString('id-ID')}`;
}

function norm(s) {
  return String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normKey(s) {
  return String(s ?? '').toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function safe(s) {
  return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function pick(row, candidates) {
  const keys = Object.keys(row || {});
  const map = new Map(keys.map(k => [normKey(k), k]));
  for (const c of candidates) {
    const nk = normKey(c);
    if (map.has(nk)) return row[map.get(nk)];
  }
  for (const k of keys) {
    const nk = normKey(k);
    if (candidates.some(c => nk.includes(normKey(c)))) return row[k];
  }
  return '';
}

function percentileRank(values, value) {
  if (!values.length) return 0;
  const v = Number(value || 0);
  const lessEqual = values.filter(x => Number(x || 0) <= v).length;
  return (lessEqual / values.length) * 100;
}

function scoreAndClassify(records) {
  const svValues = records.map(r => Number(r.sv30 || 0));
  const freqValues = records.map(r => Number(r.freq30 || 0));
  return records.map((r, idx) => {
    const active = String(r.statusTrx || '').toUpperCase() === 'ACTIVE';
    const accountActive = !r.accountStatus || String(r.accountStatus || '').toUpperCase() === 'ACTIVE';
    const svRank = percentileRank(svValues, r.sv30);
    const freqRank = percentileRank(freqValues, r.freq30);
    const score = Math.round((0.45 * svRank) + (0.35 * freqRank) + (active ? 15 : 0) + (accountActive ? 5 : 0));
    let classification = 'WATCH';
    if (!active || score < 35) classification = 'DROP';
    else if (score >= 80) classification = 'WINNER';
    return {
      ...r,
      id: r.id || `LVM-${String(idx + 1).padStart(4, '0')}`,
      score,
      classification
    };
  });
}

function normalizeLvmRows(rows) {
  const base = (rows || []).map((r, i) => ({
    id: String(pick(r, ['store_id', 'id']) || r.id || `LVM-${String(i + 1).padStart(4, '0')}`),
    storeName: String(pick(r, ['store_name', 'storeName', 'nama merchant', 'merchant']) || r.storeName || `Merchant ${i + 1}`).trim(),
    statusTrx: String(pick(r, ['status_trx', 'statusTrx']) || r.statusTrx || '').trim(),
    gradingTrx: String(pick(r, ['grading_trx', 'gradingTrx']) || r.gradingTrx || '').trim(),
    lob: String(pick(r, ['lob_lm', 'lob']) || r.lob || '').trim(),
    kecamatan: String(pick(r, ['kecamatan']) || r.kecamatan || '').trim(),
    kabupaten: String(pick(r, ['kabupaten']) || r.kabupaten || '').trim(),
    freq30: toNumber(pick(r, ['freq_30_days', 'freq30']) || r.freq30),
    sv30: toNumber(pick(r, ['sv_30_days', 'sv30']) || r.sv30),
    freqMtd: toNumber(pick(r, ['freq_mtd', 'freqMtd']) || r.freqMtd),
    svMtd: toNumber(pick(r, ['sv_mtd', 'svMtd']) || r.svMtd),
    freqYtd: toNumber(pick(r, ['freq_ytd', 'freqYtd']) || r.freqYtd),
    svYtd: toNumber(pick(r, ['sv_ytd', 'svYtd']) || r.svYtd),
    accountStatus: String(pick(r, ['status_rekening', 'accountStatus']) || r.accountStatus || '').trim(),
    accountType: String(pick(r, ['tipe_akun', 'accountType']) || r.accountType || '').trim()
  })).filter(r => r.storeName && r.storeName !== '-');
  return scoreAndClassify(base);
}

function normalizeClaimRows(rows) {
  return (rows || []).map((r, i) => {
    const merchantName = String(pick(r, ['merchant', 'merchant name', 'nama merchant', 'tempat klaim', 'outlet', 'source merchant']) || '').trim();
    const opening = pick(r, ['bukti buka rekening', 'bukti pembukaan rekening', 'opening proof', 'rekening proof', 'bukti rekening']);
    const livin = pick(r, ['bukti transaksi livin', 'bukti livin', 'livin proof', 'transaksi livin', 'screenshot livin']);
    const cifStatusRaw = pick(r, ['status cif', 'cif status', 'cif valid', 'new cif', 'rekening valid']);
    const livinStatusRaw = pick(r, ['status livin', 'livin status', 'transaksi livin valid', 'livin valid']);
    const promoStatusRaw = pick(r, ['status promo', 'promo status', 'promo redeem', 'redeem status', 'promo diberikan']);
    const hasOpening = boolLike(opening) || String(opening || '').length > 6;
    const hasLivin = boolLike(livin) || String(livin || '').length > 6 || boolLike(livinStatusRaw);
    const cifValid = boolLike(cifStatusRaw) || /valid|berhasil|sudah/i.test(String(cifStatusRaw || ''));
    const livinValid = boolLike(livinStatusRaw) || hasLivin;
    const redeemed = boolLike(promoStatusRaw) || /redeem|diberikan|sudah/i.test(String(promoStatusRaw || ''));
    return {
      id: String(pick(r, ['id','claim id','nomor','timestamp']) || `CLM-${String(i+1).padStart(4,'0')}`).trim(),
      date: String(pick(r, ['tanggal','date','timestamp','created at','waktu']) || '').trim(),
      customerName: String(pick(r, ['nama pelanggan','customer name','nama','name']) || `Pelanggan ${i+1}`).trim(),
      phone: String(pick(r, ['no hp','nomor hp','phone','whatsapp','wa','mobile']) || '').trim(),
      merchantName,
      openingProof: hasOpening ? 'Ada' : '',
      livinProof: hasLivin ? 'Ada' : '',
      cifStatus: cifValid ? 'Valid' : (hasOpening ? 'Proses Validasi' : 'Belum Lengkap'),
      livinStatus: livinValid ? 'Valid' : 'Belum Valid',
      promoStatus: redeemed ? 'Redeem' : (livinValid ? 'Siap Klaim' : 'Belum')
    };
  });
}

function boolLike(v) {
  return ['ada','valid','ya','yes','true','1','berhasil','done','redeem','sudah'].includes(norm(v));
}

function buildDummyClaims(merchants) {
  const names = ['Andi', 'Budi', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hendra', 'Intan', 'Joko', 'Karin', 'Leo'];
  return (merchants || []).slice(0, 24).map((m, i) => {
    const hasProof = i % 5 !== 0;
    const cifValid = i % 4 !== 0;
    const livinValid = i % 3 !== 0;
    const redeem = i % 6 === 0;
    return {
      id: `DUM-${String(i + 1).padStart(3, '0')}`,
      date: `2026-07-${String((i % 12) + 1).padStart(2, '0')}`,
      customerName: `${names[i % names.length]} ${100 + i}`,
      phone: `08${String(1200000000 + i * 7311).slice(0, 10)}`,
      merchantName: m.storeName,
      openingProof: hasProof ? 'Ada' : '',
      livinProof: hasProof && livinValid ? 'Ada' : '',
      cifStatus: cifValid && hasProof ? 'Valid' : (hasProof ? 'Proses Validasi' : 'Belum Lengkap'),
      livinStatus: livinValid && hasProof ? 'Valid' : 'Belum Valid',
      promoStatus: redeem ? 'Redeem' : (livinValid && hasProof ? 'Siap Klaim' : 'Belum')
    };
  });
}

function getKpi() {
  const total = state.merchants.length;
  const winner = state.merchants.filter(m => m.classification === 'WINNER').length;
  const watch = state.merchants.filter(m => m.classification === 'WATCH').length;
  const drop = state.merchants.filter(m => m.classification === 'DROP').length;
  const active = state.merchants.filter(m => String(m.statusTrx).toUpperCase() === 'ACTIVE').length;
  const sv30 = state.merchants.reduce((a,m)=>a + Number(m.sv30 || 0), 0);
  const freq30 = state.merchants.reduce((a,m)=>a + Number(m.freq30 || 0), 0);
  return { total, winner, watch, drop, active, sv30, freq30 };
}

function icon(name) {
  const icons = {
    merchant:'◎', winner:'✓', watch:'◈', drop:'!', active:'↗', proof:'▣', map:'⌖', upload:'⇧'
  };
  return icons[name] || '•';
}

function badge(status) {
  const cls = status === 'WINNER' ? 'green' : status === 'WATCH' ? 'orange' : status === 'DROP' ? 'red' : status === 'Valid' ? 'green' : status === 'Redeem' ? 'blue' : status === 'Siap Klaim' ? 'gold' : status === 'Proses Validasi' ? 'orange' : 'gray';
  return `<span class="badge ${cls}">${safe(status)}</span>`;
}

function renderShell() {
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-section">
          <div class="brand-logo">
            <span class="logo-icon">⌖</span>
            <div class="radar-pulse"></div>
          </div>
          <div class="brand-info">
            <div class="brand-title">RADAR KGB</div>
            <div class="brand-subtitle">Command Center</div>
          </div>
        </div>
        <nav class="nav-menu">
          <button class="nav-item ${state.tab==='summary'?'active':''}" data-tab="summary"><span class="nav-icon">${icon('active')}</span><span class="nav-label">Executive Summary</span></button>
          <button class="nav-item ${state.tab==='merchants'?'active':''}" data-tab="merchants"><span class="nav-icon">${icon('merchant')}</span><span class="nav-label">Merchant Partner</span></button>
          <button class="nav-item ${state.tab==='claims'?'active':''}" data-tab="claims"><span class="nav-icon">${icon('proof')}</span><span class="nav-label">Validasi Bukti</span></button>
          <button class="nav-item ${state.tab==='mapping'?'active':''}" data-tab="mapping"><span class="nav-icon">${icon('map')}</span><span class="nav-label">Merchant Mapping</span></button>
        </nav>
        <div class="sidebar-footer">
          <div class="user-profile">
            <div class="user-avatar">AD</div>
            <div class="user-info">
              <span class="user-name">Admin</span>
              <span class="user-role">RADAR KGB Operator</span>
            </div>
          </div>
          <div class="sync-status-widget">
            <div class="status-dot online"></div>
            <span class="status-text">Static Real Data</span>
          </div>
        </div>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div>
            <h1>Treatrix</h1>
            <div class="file-meta">
              <span>Merchant: <b>${safe(state.merchantFileName)}</b></span>
              <span>Bukti/Form: <b>${safe(state.claimsFileName)}</b></span>
            </div>
          </div>
          <div class="top-actions">
            ${state.tab === 'summary' ? `<button class="btn yellow" id="uploadProgramBtn">${icon('upload')} Upload Data Program</button>` : ''}
            <button class="btn ghost" id="mercatorBtn">⌖ Mercator</button>
          </div>
        </header>
        <div id="noticeMount"></div>
        <section id="viewMount"></section>
      </main>
    </div>
  `;
  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => { state.tab = btn.dataset.tab; render(); }));
  document.getElementById('mercatorBtn').addEventListener('click', () => { window.location.href = '/'; });
  const up = document.getElementById('uploadProgramBtn');
  if (up) up.addEventListener('click', openUploadModal);
}

function render() {
  renderShell();
  const mount = document.getElementById('viewMount');
  if (state.tab === 'summary') mount.innerHTML = renderSummary();
  if (state.tab === 'merchants') mount.innerHTML = renderMerchants();
  if (state.tab === 'claims') mount.innerHTML = renderClaims();
  if (state.tab === 'mapping') mount.innerHTML = renderMapping();
  bindViewEvents();
  if (state.tab === 'mapping') setTimeout(initMap, 80);
}

function renderKpis() {
  const k = getKpi();
  const cards = [
    ['merchant','Total LVM KGB', fmt(k.total), 'merchant existing Mandiri KGB'],
    ['winner','Winner', fmt(k.winner), 'merchant performa terbaik'],
    ['watch','Watch', fmt(k.watch), 'merchant perlu treatment'],
    ['drop','Drop', fmt(k.drop), 'merchant inactive / rendah'],
    ['active','Active Merchant', fmt(k.active), 'status transaksi aktif']
  ];
  return `<div class="kpi-row">${cards.map(c => `<div class="kpi"><div class="icon">${icon(c[0])}</div><span>${c[1]}</span><strong>${c[2]}</strong><small>${c[3]}</small></div>`).join('')}</div>`;
}

function renderSummary() {
  const k = getKpi();
  const max = Math.max(k.total, 1);
  const activePct = Math.round(k.active / max * 100);
  const winnerPct = Math.round(k.winner / max * 100);
  const watchPct = Math.round(k.watch / max * 100);
  const dropPct = Math.round(k.drop / max * 100);
  const funnel = [
    ['Total Merchant LVM', k.total, 100, 'basis merchant existing KGB'],
    ['Active Merchant', k.active, activePct, 'merchant masih aktif bertransaksi'],
    ['WINNER', k.winner, winnerPct, 'prioritas utama promo Treatrix'],
    ['WATCH', k.watch, watchPct, 'perlu treatment / promo terbatas'],
    ['DROP', k.drop, dropPct, 'tidak jadi prioritas aktivasi awal'],
    ['Freq 30D', k.freq30, 100, 'total frekuensi transaksi 30 hari']
  ];
  const top = [...state.merchants].sort((a,b) => b.score - a.score).slice(0,8);
  return `
    ${renderKpis()}
    <div class="card card-pad">
      <div class="section-head"><div><h2>Funnel Program</h2><p>Section ini membaca kualitas merchant existing KGB dari data LVM: total merchant → merchant aktif → segmentasi WINNER/WATCH/DROP untuk menentukan prioritas promo dan alokasi kuota cabang.</p></div></div>
      <div class="funnel">
        ${funnel.map(f => `<div class="funnel-step"><b>${fmt(f[1])}</b><span>${f[0]}</span><div class="funnel-bar"><i style="--w:${Math.min(100, f[2])}%"></i></div><small>${f[2]}% · ${f[3]}</small></div>`).join('')}
      </div>
      <div class="merchant-mini" style="margin-top:14px">
        <strong>Cara baca funnel</strong>
        <small>WINNER dipakai sebagai merchant prioritas campaign karena performanya paling kuat; WATCH dipertahankan untuk treatment dan evaluasi; DROP tidak menjadi prioritas awal kecuali ada arahan khusus cabang.</small>
      </div>
    </div>
    <div class="card card-pad" style="margin-top:18px">
      <div class="section-head"><div><h2>Top Merchant Kontributor</h2><p>Merchant LVM dengan skor performa tertinggi.</p></div></div>
      ${topMerchantTable(top)}
    </div>
  `;
}

function topMerchantTable(rows) {
  return `<div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Klasifikasi</th><th>SV 30D</th><th>Freq 30D</th></tr></thead><tbody>
    ${rows.map(r => `<tr><td><strong>${safe(r.storeName)}</strong><small>${safe(r.lob || '-')}</small></td><td>${badge(r.classification)}</td><td>${money(r.sv30)}</td><td>${fmt(r.freq30)}</td></tr>`).join('')}
  </tbody></table></div>`;
}

function renderMerchants() {
  const rows = [...state.merchants].sort((a,b) => {
    const order = { WINNER: 1, WATCH: 2, DROP: 3 };
    return (order[a.classification] - order[b.classification]) || a.storeName.localeCompare(b.storeName);
  });
  return `
    <div class="card card-pad">
      <div class="section-head"><div><h2>Merchant Partner</h2><p>Informasi ditampilkan sesuai arahan: nama merchant dan klasifikasi.</p></div></div>
      <div class="filter-row">
        <input class="searchbox" id="searchInput" placeholder="Cari nama merchant..." value="${safe(state.search)}" />
        <select id="classFilter"><option value="all">Semua klasifikasi</option><option value="WINNER" ${state.classFilter==='WINNER'?'selected':''}>WINNER</option><option value="WATCH" ${state.classFilter==='WATCH'?'selected':''}>WATCH</option><option value="DROP" ${state.classFilter==='DROP'?'selected':''}>DROP</option></select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Nama Merchant</th><th>Klasifikasi</th></tr></thead><tbody id="merchantTableBody">
        ${rows.map(r => `<tr data-name="${safe(norm(r.storeName))}" data-class="${safe(r.classification)}"><td><strong>${safe(r.storeName)}</strong></td><td>${badge(r.classification)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function renderClaims() {
  const rows = state.claims.filter(c => {
    if (state.claimFilter === 'valid') return c.cifStatus === 'Valid' && c.livinStatus === 'Valid';
    if (state.claimFilter === 'incomplete') return !(c.openingProof && c.livinProof);
    if (state.claimFilter === 'process') return c.openingProof && c.livinProof && c.cifStatus !== 'Valid';
    if (state.claimFilter === 'redeem') return c.promoStatus === 'Redeem';
    return true;
  });
  return `
    <div class="card card-pad">
      <div class="section-head"><div><h2>Validasi Bukti</h2><p>Dummy workflow menggunakan merchant existing KGB agar alur validasi bukti tergambar sebelum data Google Form final dipakai.</p></div></div>
      <div class="filter-row">
        <select id="claimFilter"><option value="all">Semua data</option><option value="valid" ${state.claimFilter==='valid'?'selected':''}>CIF + Livin’ Valid</option><option value="process" ${state.claimFilter==='process'?'selected':''}>Perlu Validasi</option><option value="incomplete" ${state.claimFilter==='incomplete'?'selected':''}>Bukti Belum Lengkap</option><option value="redeem" ${state.claimFilter==='redeem'?'selected':''}>Promo Redeem</option></select>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pelanggan</th><th>Merchant</th><th>Bukti</th><th>CIF</th><th>Livin’</th><th>Promo</th></tr></thead><tbody>
      ${rows.map(c => `<tr><td>${safe(c.date || '-')}</td><td><strong>${safe(c.customerName)}</strong><small>${safe(c.phone || '-')}</small></td><td>${safe(c.merchantName || '-')}</td><td>${badge(c.openingProof && c.livinProof ? 'Bukti lengkap' : 'Belum Lengkap')}</td><td>${badge(c.cifStatus)}</td><td>${badge(c.livinStatus)}</td><td>${badge(c.promoStatus)}</td></tr>`).join('')}
      </tbody></table></div>
    </div>`;
}

function renderMapping() {
  const rows = state.merchants.slice(0, 18).map((m, i) => ({
    ...m,
    top: 12 + ((i * 17) % 70),
    left: 10 + ((i * 23) % 78)
  }));
  return `
    <div class="map-layout">
      <div class="card map-card">
        <div class="section-head"><div><h2>Merchant Mapping</h2><p>Dummy visual menggunakan merchant existing KGB. Titik koordinat real dapat ditambahkan saat file bulanan sudah memiliki latitude/longitude.</p></div></div>
        <div id="map" style="position:relative;background:radial-gradient(circle at 20% 20%, rgba(252,196,25,.16), transparent 25%), radial-gradient(circle at 80% 60%, rgba(13,123,242,.18), transparent 28%), #101827;">
          ${rows.map(m => `<button title="${safe(m.storeName)}" class="marker-pin marker-${m.classification.toLowerCase()}" style="position:absolute;top:${m.top}%;left:${m.left}%;transform:translate(-50%,-50%);"><span>${m.classification === 'WINNER' ? 'W' : m.classification === 'WATCH' ? 'T' : 'D'}</span></button>`).join('')}
          <div class="map-fallback" style="pointer-events:none;position:absolute;inset:0;background:transparent;place-items:end start;text-align:left;padding:20px;"><div><strong>Dummy Merchant Mapping KGB</strong><br/>Hijau = Winner, Oranye = Watch, Merah = Drop.</div></div>
        </div>
      </div>
      <div class="card map-side">
        <h2>Ringkasan Merchant</h2><p class="sub">Contoh tampilan titik merchant partner berdasarkan klasifikasi Treatrix.</p>
        ${rows.slice(0,12).map(m => `<div class="merchant-mini"><strong>${safe(m.storeName)}</strong><small>${safe(m.lob || '-')}</small>${badge(m.classification)}</div>`).join('')}
      </div>
    </div>`;
}

function filterMerchantTable() {
  const q = norm(document.getElementById('searchInput')?.value || state.search);
  const cls = document.getElementById('classFilter')?.value || state.classFilter;
  document.querySelectorAll('#merchantTableBody tr').forEach(row => {
    const hit = !q || String(row.dataset.name || '').includes(q);
    const stat = cls === 'all' || row.dataset.class === cls;
    row.style.display = hit && stat ? '' : 'none';
  });
}

function bindViewEvents() {
  const search = document.getElementById('searchInput');
  if (search) search.addEventListener('input', e => { state.search = e.target.value; filterMerchantTable(); });
  const cf = document.getElementById('classFilter');
  if (cf) cf.addEventListener('change', e => { state.classFilter = e.target.value; filterMerchantTable(); });
  const claimFilter = document.getElementById('claimFilter');
  if (claimFilter) claimFilter.addEventListener('change', e => { state.claimFilter = e.target.value; render(); });
  filterMerchantTable();
}

function initMap() {
  // Intentional: current real LVM data has no merchant coordinates.
}

function openUploadModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-head">
        <div><h2>Upload Data Program</h2><p class="sub">Gunakan Slot A untuk Data LVM KGB bulanan. Slot B opsional untuk file Bukti / Google Form.</p></div>
        <button class="close" id="closeUpload">×</button>
      </div>
      <div class="modal-body">
        <div class="drop-grid">
          <label class="drop-zone">
            <h3>Slot File A: Merchant Existing</h3>
            <p>Mendukung layout Data LVM KGB: store_name, status_trx, grading_trx, freq_30_days, sv_30_days, status_rekening, dan kolom LVM lainnya.</p>
            <input id="merchantUploadFile" type="file" accept=".xlsx,.xls,.csv,.json" />
            <small id="merchantUploadName">Belum ada file dipilih</small>
          </label>
          <label class="drop-zone">
            <h3>Slot File B: Bukti / Google Form</h3>
            <p>Opsional. Dipakai untuk validasi bukti pembukaan rekening, bukti transaksi Livin’, dan status promo.</p>
            <input id="claimsUploadFile" type="file" accept=".xlsx,.xls,.csv,.json" />
            <small id="claimsUploadName">Belum ada file dipilih</small>
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" id="cancelUpload">Batal</button>
          <button class="btn yellow" id="applyUpload">Terapkan Data</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.querySelector('#closeUpload').addEventListener('click', () => modal.remove());
  modal.querySelector('#cancelUpload').addEventListener('click', () => modal.remove());
  modal.querySelector('#merchantUploadFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await readRows(file);
      state.uploadDraft.merchantRows = normalizeLvmRows(rows);
      state.uploadDraft.merchantName = `${file.name} · ${fmt(state.uploadDraft.merchantRows.length)} merchant`;
      modal.querySelector('#merchantUploadName').textContent = state.uploadDraft.merchantName;
    } catch (err) {
      modal.querySelector('#merchantUploadName').textContent = `Gagal membaca file: ${err.message || err}`;
    }
  });
  modal.querySelector('#claimsUploadFile').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const rows = await readRows(file);
      state.uploadDraft.claimRows = normalizeClaimRows(rows);
      state.uploadDraft.claimName = `${file.name} · ${fmt(state.uploadDraft.claimRows.length)} baris`;
      modal.querySelector('#claimsUploadName').textContent = state.uploadDraft.claimName;
    } catch (err) {
      modal.querySelector('#claimsUploadName').textContent = `Gagal membaca file: ${err.message || err}`;
    }
  });
  modal.querySelector('#applyUpload').addEventListener('click', () => {
    if (state.uploadDraft.merchantRows) {
      state.merchants = state.uploadDraft.merchantRows;
      state.claims = buildDummyClaims(state.merchants);
      state.merchantFileName = state.uploadDraft.merchantName;
    }
    if (state.uploadDraft.claimRows) {
      state.claims = state.uploadDraft.claimRows;
      state.claimsFileName = state.uploadDraft.claimName;
    }
    state.uploadDraft = { merchantRows: null, claimRows: null, merchantName: '', claimName: '' };
    modal.remove();
    pushNotice('Data program berhasil diterapkan.');
    render();
  });
}

function pushNotice(msg) {
  setTimeout(() => {
    const mount = document.getElementById('noticeMount');
    if (mount) mount.innerHTML = `<div class="notice"><span>${safe(msg)}</span><button onclick="this.closest('.notice').remove()">×</button></div>`;
  }, 0);
}

async function readRows(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'json') return JSON.parse(await file.text());
  if (ext === 'csv') return parseCsv(await file.text());
  if (['xlsx','xls'].includes(ext)) {
    if (!window.XLSX) throw new Error('Library XLSX belum termuat.');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    const sheetName = pickBestSheet(wb);
    return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval:'' });
  }
  throw new Error('Format file belum didukung. Gunakan CSV, XLSX, XLS, atau JSON.');
}

function pickBestSheet(wb) {
  let best = wb.SheetNames[0];
  let bestCount = -1;
  wb.SheetNames.forEach(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header:1, defval:'' });
    const count = rows.reduce((a,r)=>a + r.filter(Boolean).length, 0);
    if (count > bestCount) { best = name; bestCount = count; }
  });
  return best;
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i=0;i<text.length;i++) {
    const c = text[i], n = text[i+1];
    if (c === '"' && q && n === '"') { cell += '"'; i++; continue; }
    if (c === '"') { q = !q; continue; }
    if (c === ',' && !q) { row.push(cell); cell=''; continue; }
    if ((c === '\n' || c === '\r') && !q) {
      if (c === '\r' && n === '\n') i++;
      row.push(cell); rows.push(row); row=[]; cell=''; continue;
    }
    cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()?.map(h => h.trim()) || [];
  return rows.filter(r => r.some(x => String(x).trim())).map(r => Object.fromEntries(headers.map((h,i)=>[h, r[i] ?? ''])));
}

render();
