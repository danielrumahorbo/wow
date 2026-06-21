
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import L from 'leaflet';
import * as XLSX from 'xlsx';
import {
  Download, MapPinned, Search, CalendarDays, ClipboardCheck, Target, Users,
  Layers, Route, Save, X, FileSpreadsheet, Home, MapPin, Building2
} from 'lucide-react';
import './styles.css';
import 'leaflet/dist/leaflet.css';
import locationSeed from './location_seed.json';
import qualityReport from './location_quality_report.json';

const VISIT_KEY = 'mercator-location-visits-v1';
const DEFAULT_CENTER = [-6.20, 106.86];
const WILAYAH_OPTIONS = ['all', 'Jakarta', 'Depok', 'Tangerang', 'Bekasi'];
const POTENTIAL_OPTIONS = ['all', 'High Potential', 'Medium Potential', 'Low Potential'];

function safeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}

function fmt(value) {
  return Number(value || 0).toLocaleString('id-ID');
}

function badgeClass(status) {
  if (status === 'High Potential' || status === 'Selesai') return 'green';
  if (status === 'Medium Potential' || status === 'Follow-up') return 'orange';
  if (status === 'Low Potential' || status === 'Tidak Prospek') return 'red';
  if (status === 'Belum Visit') return 'blue';
  return 'gray';
}

function markerClass(level) {
  if (level === 'High Potential') return 'marker-green';
  if (level === 'Medium Potential') return 'marker-orange';
  if (level === 'Low Potential') return 'marker-red';
  return 'marker-blue';
}

function googleMapsUrl(location) {
  if (location?.googleMapsUrl) return location.googleMapsUrl;
  if (location?.latitude && location?.longitude) return `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
  return '#';
}

function getVisitStatus(location, visits) {
  const related = visits.filter((v) => String(v.locationId) === String(location.id));
  if (!related.length) return 'Belum Visit';
  return related[0].result || 'Sudah Visit';
}

function exportExcel(filename, rows, sheetName = 'REPORT') {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

function Kpi({ label, value, note, icon }) {
  return (
    <div className="kpi">
      <div className="kpi-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}

function Badge({ text }) {
  return <span className={`badge ${badgeClass(text)}`}>{text}</span>;
}

function Insight({ title, text }) {
  return (
    <div className="insight">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function RadarMap({ locations, selected, onSelect }) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  useEffect(() => {
    if (!mapNode.current) return;
    if (!mapRef.current) {
      mapRef.current = L.map(mapNode.current, { zoomControl: true }).setView(DEFAULT_CENTER, 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20,
        attribution: '&copy; OpenStreetMap'
      }).addTo(mapRef.current);
    }

    layersRef.current.forEach((layer) => layer.remove());
    layersRef.current = [];

    const valid = locations.filter((l) => {
      const lat = Number(l.latitude);
      const lng = Number(l.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -6.75 && lat <= -5.75 && lng >= 106.25 && lng <= 107.35;
    });

    valid.forEach((location) => {
      const icon = L.divIcon({
        className: `merchant-pin ${markerClass(location.potentialLevel)} ${selected?.id === location.id ? 'active' : ''}`,
        html: `<span>${location.score}</span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      const marker = L.marker([Number(location.latitude), Number(location.longitude)], { icon }).addTo(mapRef.current);
      marker.bindTooltip(location.name, { direction: 'top', offset: [0, -12] });
      marker.on('click', () => onSelect(location));
      layersRef.current.push(marker);
    });

    if (valid.length) {
      mapRef.current.invalidateSize();
      const bounds = L.latLngBounds(valid.map((l) => [Number(l.latitude), Number(l.longitude)]));
      mapRef.current.fitBounds(bounds.pad(0.18), { animate: true, maxZoom: 14 });
    } else {
      mapRef.current.setView(DEFAULT_CENTER, 11);
    }
  }, [locations, selected, onSelect]);

  return (
    <div className="map-wrap">
      <div ref={mapNode} className="leaflet-host" />
      <div className="floating-card legend">
        <div><span className="dot green"></span>High Potential</div>
        <div><span className="dot orange"></span>Medium Potential</div>
        <div><span className="dot red"></span>Low Potential</div>
      </div>
      <div className="floating-card layer-note">
        <MapPinned size={15} /> New CIF Location Radar
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="detail-empty">
      <div className="empty-state-card no-merchant-state">
        <div className="empty-orb"><MapPinned size={26} /></div>
        <div>
          <strong>Pilih titik lokasi prospek</strong>
          <p>Klik salah satu titik sekretariat RT/RW pada peta untuk melihat detail kawasan padat penduduk, potensi New CIF, dan action visit.</p>
        </div>
        <div className="empty-guide-grid">
          <div><b>1</b><span>Pilih wilayah: Jakarta, Depok, Tangerang, atau Bekasi.</span></div>
          <div><b>2</b><span>Prioritaskan lokasi dengan High Potential.</span></div>
          <div><b>3</b><span>Catat hasil visit untuk follow-up marketing cabang.</span></div>
        </div>
      </div>
    </div>
  );
}

function LocationDetail({ location, visits, onVisit }) {
  if (!location) return <EmptyDetail />;
  const related = visits.filter((v) => String(v.locationId) === String(location.id));
  const lastVisit = related[0];

  return (
    <div className="merchant-detail-card selected-merchant-card">
      <div className="panel-head compact">
        <h2>Location Detail</h2>
        <Badge text={location.potentialLevel} />
      </div>

      <div className="detail-hero selected-detail-hero">
        <div className="drawer-score">{location.score}</div>
        <div>
          <div className="detail-title-row">
            <h3>{location.name}</h3>
            <span className="selected-chip">{location.wilayah}</span>
          </div>
          <p>{location.locationType} · {location.area}</p>
        </div>
      </div>

      <div className="badges detail-badges">
        <span>{location.category}</span>
        <span>{location.visitStatus || 'Belum Visit'}</span>
        {location.rating ? <span className="success">Rating {location.rating}</span> : null}
        {location.reviewCount ? <span>{location.reviewCount} review</span> : null}
      </div>

      <div className="drawer-section detail-address-card">
        <div className="section-title-row">
          <strong>Alamat / Koordinat</strong>
          <a className="map-mini-btn" href={googleMapsUrl(location)} target="_blank" rel="noreferrer">Buka Maps</a>
        </div>
        <p>{location.displayAddress || location.address}</p>
        <p>{location.wilayahDetail || location.wilayah}</p>
      </div>

      <div className="grid2 detail-metric-grid">
        <div>
          <strong>Estimasi Pipeline</strong>
          <p>{fmt(location.newCifPotential)} CIF</p>
        </div>
        <div>
          <strong>Status Visit</strong>
          <p>{lastVisit?.result || 'Belum Visit'}</p>
        </div>
        <div>
          <strong>Kontak</strong>
          <p>{location.phone || '-'}</p>
        </div>
        <div>
          <strong>Sumber</strong>
          <p>Internal</p>
        </div>
      </div>

      <div className="recommendation-box">
        <strong>Alasan Prioritas</strong>
        <p>{location.reason}</p>
      </div>

      {lastVisit && (
        <div className="timeline">
          <b>Visit terakhir: {lastVisit.visitDate}</b>
          <span>{lastVisit.officerName} · {lastVisit.result}</span>
          <small>{lastVisit.nextAction || lastVisit.notes || 'Tidak ada catatan tambahan.'}</small>
        </div>
      )}

      <button className="btn yellow full" onClick={() => onVisit(location)}>
        <ClipboardCheck size={17} /> Catat Visit Lokasi
      </button>
    </div>
  );
}

function VisitModal({ location, onClose, onSave }) {
  const [form, setForm] = useState({
    visitDate: new Date().toISOString().slice(0, 10),
    officerName: 'Admin',
    locationName: location?.name || '',
    picName: '',
    result: 'Follow-up',
    estimatedCif: location?.newCifPotential || 0,
    nextAction: '',
    notes: ''
  });

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    if (!form.locationName.trim()) return;
    onSave({
      id: `VIS-${Date.now()}`,
      locationId: location?.id || '',
      locationName: form.locationName.trim(),
      wilayah: location?.wilayah || '',
      visitDate: form.visitDate,
      officerName: form.officerName,
      picName: form.picName,
      result: form.result,
      estimatedCif: Number(form.estimatedCif || 0),
      nextAction: form.nextAction,
      notes: form.notes,
      createdAt: new Date().toISOString()
    });
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <button className="close" onClick={onClose}><X size={18} /></button>
        <div className="modal-title">
          <ClipboardCheck />
          <div>
            <h2>Catat Visit Lokasi</h2>
            <p>Form ini dipakai untuk tracking hasil kunjungan lokasi prospek New CIF.</p>
          </div>
        </div>

        <div className="form-grid">
          <label>Nama Lokasi
            <input value={form.locationName} onChange={(e) => update('locationName', e.target.value)} placeholder="Contoh: RW 08 Pegangsaan Dua" />
          </label>
          <label>Tanggal Visit
            <input type="date" value={form.visitDate} onChange={(e) => update('visitDate', e.target.value)} />
          </label>
          <label>Petugas
            <input value={form.officerName} onChange={(e) => update('officerName', e.target.value)} />
          </label>
          <label>PIC / Kontak Lokasi
            <input value={form.picName} onChange={(e) => update('picName', e.target.value)} placeholder="Ketua RT/RW, kader, pengurus..." />
          </label>
          <label>Hasil Visit
            <select value={form.result} onChange={(e) => update('result', e.target.value)}>
              <option value="Follow-up">Follow-up</option>
              <option value="Selesai">Selesai</option>
              <option value="Tidak Prospek">Tidak Prospek</option>
              <option value="Butuh Koordinasi">Butuh Koordinasi</option>
            </select>
          </label>
          <label>Estimasi New CIF
            <input type="number" min="0" value={form.estimatedCif} onChange={(e) => update('estimatedCif', e.target.value)} />
          </label>
        </div>

        <label className="notes-label">Next Action
          <input value={form.nextAction} onChange={(e) => update('nextAction', e.target.value)} placeholder="Contoh: koordinasi mini booth saat kegiatan warga" />
        </label>
        <label className="notes-label">Catatan
          <textarea value={form.notes} onChange={(e) => update('notes', e.target.value)} placeholder="Catatan hasil diskusi, kendala, kebutuhan follow-up..." />
        </label>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Batal</button>
          <button className="btn yellow" onClick={save}><Save size={17} />Simpan Visit</button>
        </div>
      </div>
    </div>
  );
}

function DirectoryTable({ rows, onSelect }) {
  return (
    <div className="table-wrap">
      <table className="table-merchant">
        <thead>
          <tr>
            <th>Lokasi Prospek</th>
            <th>Wilayah</th>
            <th>Tipe</th>
            <th>Score</th>
            <th>Potensi</th>
            <th>Pipeline</th>
            <th>Alamat</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((location) => (
            <tr key={location.id} onClick={() => onSelect(location)}>
              <td><strong>{location.name}</strong><small>{location.id}</small></td>
              <td>{location.wilayah}</td>
              <td>{location.locationType}</td>
              <td><strong>{location.score}</strong></td>
              <td><Badge text={location.potentialLevel} /></td>
              <td>{fmt(location.newCifPotential)} CIF</td>
              <td>{location.displayAddress || location.address}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitLogs({ visits, onManualVisit }) {
  const totalPipeline = visits.reduce((a, v) => a + Number(v.estimatedCif || 0), 0);
  return (
    <div className="logs-grid">
      <section className="logs-list-card">
        <div className="panel-head">
          <div>
            <h2>Visit Logs</h2>
            <p className="empty-copy">Tracking hasil kunjungan kawasan padat penduduk untuk akuisisi New CIF.</p>
          </div>
          <button className="btn yellow" onClick={() => onManualVisit(null)}><ClipboardCheck size={17} />Catat Visit Manual</button>
        </div>

        <div className="logs-scrollable">
          {visits.length ? visits.map((visit) => (
            <article className="log-item-card" key={visit.id}>
              <div className="log-item-header">
                <div>
                  <h3>{visit.locationName}</h3>
                  <div className="log-item-meta">
                    <span><CalendarDays size={13} />{visit.visitDate}</span>
                    <span><Users size={13} />{visit.officerName}</span>
                    <span>{visit.picName || 'PIC belum diisi'}</span>
                  </div>
                </div>
                <Badge text={visit.result} />
              </div>
              <div className="log-item-body">
                Estimasi New CIF: <b>{fmt(visit.estimatedCif)}</b>. Next action: {visit.nextAction || '-'}
              </div>
              {visit.notes ? <div className="log-item-opportunities"><span>{visit.notes}</span></div> : null}
            </article>
          )) : (
            <div className="empty-state-card">
              <ClipboardCheck size={28} />
              <strong>Belum ada visit log</strong>
              <p>Catat kunjungan dari detail lokasi atau gunakan tombol Catat Visit Manual.</p>
            </div>
          )}
        </div>
      </section>

      <aside className="stats-panel">
        <h3>Ringkasan Visit</h3>
        <div className="stats-list">
          <div className="stat-row"><label>Total Visit</label><span>{fmt(visits.length)}</span></div>
          <div className="stat-row"><label>Follow-up</label><span>{fmt(visits.filter(v => v.result === 'Follow-up').length)}</span></div>
          <div className="stat-row"><label>Estimasi Pipeline</label><span>{fmt(totalPipeline)} CIF</span></div>
          <div className="stat-row"><label>Manual Visit</label><span>{fmt(visits.filter(v => !v.locationId).length)}</span></div>
        </div>
      </aside>
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('radar');
  const [locations] = useState(locationSeed);
  const [visits, setVisits] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(VISIT_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [query, setQuery] = useState('');
  const [wilayahFilter, setWilayahFilter] = useState('Jakarta');
  const [potentialFilter, setPotentialFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [showVisit, setShowVisit] = useState(false);
  const [visitTarget, setVisitTarget] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visits));
  }, [visits]);

  const types = useMemo(() => Array.from(new Set(locations.map((l) => l.locationType))).sort(), [locations]);

  const filtered = useMemo(() => {
    return locations
      .filter((location) => {
        const hay = `${location.name} ${location.address} ${location.wilayah} ${location.area} ${location.locationType}`.toLowerCase();
        const matchesQuery = !query || hay.includes(query.toLowerCase());
        const matchesWilayah = wilayahFilter === 'all' || location.wilayah === wilayahFilter;
        const matchesPotential = potentialFilter === 'all' || location.potentialLevel === potentialFilter;
        const matchesType = typeFilter === 'all' || location.locationType === typeFilter;
        return matchesQuery && matchesWilayah && matchesPotential && matchesType;
      })
      .sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [locations, query, wilayahFilter, potentialFilter, typeFilter]);

  useEffect(() => {
    if (selected && !filtered.some((location) => location.id === selected.id)) {
      setSelected(null);
    }
  }, [filtered, selected]);

  const countsByWilayah = useMemo(() => {
    const base = { Jakarta: 0, Depok: 0, Tangerang: 0, Bekasi: 0 };
    locations.forEach((l) => { if (base[l.wilayah] !== undefined) base[l.wilayah] += 1; });
    return base;
  }, [locations]);

  const kpis = useMemo(() => {
    const high = locations.filter((l) => l.potentialLevel === 'High Potential').length;
    const visitedIds = new Set(visits.filter((v) => v.locationId).map((v) => v.locationId));
    const unvisited = locations.filter((l) => !visitedIds.has(l.id)).length;
    const pipeline = locations.reduce((a, l) => a + Number(l.newCifPotential || 0), 0);
    return { total: locations.length, high, unvisited, pipeline };
  }, [locations, visits]);

  function openVisit(location) {
    setVisitTarget(location || null);
    setShowVisit(true);
  }

  function saveVisit(visit) {
    setVisits((prev) => [visit, ...prev]);
    setShowVisit(false);
    setVisitTarget(null);
    setMessage('Visit lokasi berhasil dicatat.');
  }

  function exportReport() {
    const rows = filtered.map((l) => ({
      id: l.id,
      nama_lokasi: l.name,
      wilayah: l.wilayah,
      tipe_lokasi: l.locationType,
      alamat: l.displayAddress || l.address,
      latitude: l.latitude,
      longitude: l.longitude,
      score: l.score,
      potensi: l.potentialLevel,
      estimasi_new_cif: l.newCifPotential,
      rating: l.rating,
      review: l.reviewCount,
      kontak: l.phone,
      google_maps_url: l.googleMapsUrl,
      alasan_prioritas: l.reason,
      sumber: 'Internal'
    }));
    exportExcel(`Mercator-location-report-${new Date().toISOString().slice(0, 10)}.xlsx`, rows, 'LOCATION_REPORT');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-section">
          <div className="brand-logo">
            <MapPinned size={22} className="logo-icon" />
            <div className="radar-pulse"></div>
          </div>
          <div className="brand-info">
            <span className="brand-title">RADAR KGB</span>
            <span className="brand-subtitle">Command Center</span>
          </div>
        </div>

        <nav className="nav-menu">
          <button className={`nav-item ${activeTab === 'radar' ? 'active' : ''}`} onClick={() => setActiveTab('radar')}>
            <MapPinned size={20} className="nav-icon" />
            <span className="nav-label">Opportunity Map</span>
          </button>
          <button className={`nav-item ${activeTab === 'directory' ? 'active' : ''}`} onClick={() => setActiveTab('directory')}>
            <Target size={20} className="nav-icon" />
            <span className="nav-label">Location Directory</span>
          </button>
          <button className={`nav-item ${activeTab === 'visits' ? 'active' : ''}`} onClick={() => setActiveTab('visits')}>
            <ClipboardCheck size={20} className="nav-icon" />
            <span className="nav-label">Visit Logs</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">AD</div>
            <div className="user-info">
              <span className="user-name">Admin</span>
              <span className="user-role">RADAR KGB Operator</span>
            </div>
          </div>
          <div className="sync-status-widget">
            <div className="status-dot online"></div>
            <span className="status-text">Static Real Data</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <h1>Mercator</h1>
          </div>
          <div className="top-actions">
            <div className="sync-pill online"><FileSpreadsheet size={16} />{fmt(qualityReport.uniqueLocations)} Lokasi Valid</div>
            <button className="btn blue" onClick={exportReport}><Download size={17} />Export Report</button>
            <button className="btn ghost dashboard-switch-btn" onClick={() => { window.location.href = '/livin.html'; }}><Layers size={17} />Treatrix</button>
          </div>
        </header>

        {message && <div className="message"><ClipboardCheck size={16} />{message}<button onClick={() => setMessage('')}>×</button></div>}

        {activeTab === 'radar' && (
          <section className="kpi-row">
            <Kpi label="Lokasi Terpetakan" value={fmt(kpis.total)} note="sekretariat RT/RW unik hasil deduplikasi" icon={<MapPin />} />
            <Kpi label="High Potential Area" value={fmt(kpis.high)} note="prioritas awal tim marketing cabang" icon={<Target />} />
            <Kpi label="Belum Visit" value={fmt(kpis.unvisited)} note="lokasi belum punya catatan kunjungan" icon={<Route />} />
            <Kpi label="Estimasi Pipeline" value={fmt(kpis.pipeline)} note="proxy potensi New CIF dari scoring lokasi" icon={<Users />} />
          </section>
        )}

        {activeTab === 'radar' && (
          <div className="tab-content">
            <section className="content-grid">
              <div className="map-panel">
                <div className="toolbar radar-toolbar">
                  <div className="searchbox"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari lokasi, RT/RW, alamat, wilayah..." /></div>
                  <select value={potentialFilter} onChange={(e) => setPotentialFilter(e.target.value)} aria-label="Filter potensi">
                    {POTENTIAL_OPTIONS.map((p) => <option key={p} value={p}>{p === 'all' ? 'Semua potensi' : p}</option>)}
                  </select>
                  <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} aria-label="Filter tipe lokasi">
                    <option value="all">Semua tipe</option>
                    {types.map((t) => <option value={t} key={t}>{t}</option>)}
                  </select>
                </div>

                <div className="map-filter-strip" aria-label="Filter wilayah">
                  <div className="map-filter-copy">
                    <strong>Filter wilayah</strong>
                    <span>Data aktif saat ini: Jakarta dan Depok. Tangerang dan Bekasi disiapkan untuk ekspansi berikutnya.</span>
                  </div>
                  <div className="map-filter-chips">
                    {WILAYAH_OPTIONS.map((w) => (
                      <button key={w} className={wilayahFilter === w ? 'active' : ''} onClick={() => setWilayahFilter(w)}>
                        {w === 'all' ? 'Semua' : w}<b>{w === 'all' ? locations.length : countsByWilayah[w]}</b>
                      </button>
                    ))}
                  </div>
                </div>

                <RadarMap locations={filtered} selected={selected} onSelect={setSelected} />
                <div className="insight-strip">
                  <Insight title="Data Scope" text={`${qualityReport.totalInputRows} baris scraping diproses menjadi ${qualityReport.uniqueLocations} lokasi unik.`} />
                  <Insight title="Deduplikasi" text={`${qualityReport.duplicatesRemoved} duplikat antar file sudah dihapus.`} />
                  <Insight title="Pin Aktif" text={`${filtered.length} titik tampil sesuai filter saat ini.`} />
                </div>
              </div>

              <aside className="right-panel">
                <LocationDetail location={selected} visits={visits} onVisit={openVisit} />
              </aside>
            </section>
          </div>
        )}

        {activeTab === 'directory' && (
          <div className="tab-content">
            <div className="directory-card">
              <div className="directory-header">
                <div>
                  <h2>Location Directory</h2>
                  <p className="empty-copy">Daftar kawasan padat penduduk berbasis titik Sekretariat RT/RW hasil scraping Google Maps.</p>
                </div>
                <div className="directory-filters">
                  <div className="searchbox" style={{ width: '280px' }}>
                    <Search size={16} />
                    <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari lokasi..." />
                  </div>
                  <select value={wilayahFilter} onChange={(e) => setWilayahFilter(e.target.value)}>
                    {WILAYAH_OPTIONS.map((w) => <option key={w} value={w}>{w === 'all' ? 'Semua Wilayah' : w}</option>)}
                  </select>
                  <select value={potentialFilter} onChange={(e) => setPotentialFilter(e.target.value)}>
                    {POTENTIAL_OPTIONS.map((p) => <option key={p} value={p}>{p === 'all' ? 'Semua Potensi' : p}</option>)}
                  </select>
                </div>
              </div>
              <DirectoryTable rows={filtered} onSelect={(location) => { setSelected(location); setActiveTab('radar'); }} />
            </div>
          </div>
        )}

        {activeTab === 'visits' && (
          <div className="tab-content">
            <VisitLogs visits={visits} onManualVisit={openVisit} />
          </div>
        )}

        {showVisit && (
          <VisitModal
            location={visitTarget}
            onClose={() => { setShowVisit(false); setVisitTarget(null); }}
            onSave={saveVisit}
          />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
