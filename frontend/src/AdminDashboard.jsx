/**
 * AdminDashboard.jsx — EasyHire Admin Panel v2
 * Features: rich dashboard charts · user analytics · scraper interval control
 *           · manual exam management · report downloads (CSV/JSON)
 */
import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

// ─── API HELPER ───────────────────────────────────────────────────────────────
async function af(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res  = await fetch(`${API_BASE}/admin${path}`, { headers, ...options });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Error ${res.status}`);
  return json;
}

function dlLink(path, token) {
  return `${API_BASE}/admin${path}&_t=${token}`;
}

// ─── COLOUR TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:"#0a0a0f", surface:"#111118", surfaceL:"#16161f", surfaceLL:"#1c1c28",
  border:"#2a2a3a", borderL:"#1e1e2e",
  text:"#f0ede8", textSub:"#c4bfb8", textMid:"#8a8278", textDim:"#5a5650",
  gold:"#d4a843", goldL:"rgba(212,168,67,.15)", goldB:"rgba(212,168,67,.3)",
  green:"#4ade80", greenL:"rgba(74,222,128,.12)", greenB:"rgba(74,222,128,.3)",
  blue:"#60a5fa", blueL:"rgba(96,165,250,.12)", blueB:"rgba(96,165,250,.3)",
  red:"#f87171", redL:"rgba(248,113,113,.12)", redB:"rgba(248,113,113,.3)",
  amber:"#fbbf24", amberL:"rgba(251,191,36,.12)",
  purple:"#a78bfa", purpleL:"rgba(167,139,250,.12)",
  teal:"#2dd4bf", tealL:"rgba(45,212,191,.12)",
};

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────────
const CSS = `
  .adm * { box-sizing:border-box; margin:0; padding:0; }
  .adm { font-family:'Lato','Segoe UI',sans-serif; font-size:14px;
    background:${C.bg}; color:${C.text}; min-height:100vh; }

  /* SIDEBAR */
  .adm-sb { position:fixed; top:0; left:0; bottom:0; width:224px;
    background:${C.surface}; border-right:1px solid ${C.border};
    display:flex; flex-direction:column; z-index:100; }
  .adm-sb-logo { padding:22px 20px 18px; border-bottom:1px solid ${C.border};
    font-size:16px; font-weight:700; letter-spacing:.04em; }
  .adm-sb-logo span { color:${C.gold}; }
  .adm-nav { flex:1; padding:10px 0; overflow-y:auto; }
  .adm-nav-section { font-size:10px; color:${C.textDim}; letter-spacing:.08em;
    text-transform:uppercase; padding:14px 20px 4px; }
  .adm-ni { display:flex; align-items:center; gap:10px; padding:10px 20px;
    cursor:pointer; transition:background .15s; color:${C.textSub};
    font-size:13.5px; border-left:3px solid transparent; }
  .adm-ni:hover { background:${C.surfaceL}; color:${C.text}; }
  .adm-ni.active { background:${C.goldL}; color:${C.gold}; border-left-color:${C.gold}; }
  .adm-ni .ni { font-size:16px; min-width:20px; text-align:center; }
  .adm-sb-foot { padding:14px 20px; border-top:1px solid ${C.border}; font-size:12px; color:${C.textMid}; }

  /* MAIN */
  .adm-main { margin-left:224px; min-height:100vh; padding:28px 32px; }
  .adm-topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:26px; }
  .adm-topbar h1 { font-size:21px; font-weight:700; }
  .adm-badge { background:${C.goldL}; color:${C.gold}; border:1px solid ${C.goldB};
    font-size:10px; font-weight:700; padding:2px 8px; border-radius:20px; letter-spacing:.04em; }

  /* STAT GRID */
  .stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:14px; margin-bottom:24px; }
  .stat-card { background:${C.surface}; border:1px solid ${C.border}; border-radius:12px;
    padding:18px 20px; }
  .stat-card .lbl { font-size:11px; color:${C.textMid}; text-transform:uppercase;
    letter-spacing:.05em; margin-bottom:6px; }
  .stat-card .val { font-size:26px; font-weight:700; line-height:1; margin-bottom:4px; }
  .stat-card .sub { font-size:11px; color:${C.textMid}; }

  /* PANEL */
  .panel { background:${C.surface}; border:1px solid ${C.border}; border-radius:12px;
    overflow:hidden; margin-bottom:20px; }
  .panel-hd { display:flex; justify-content:space-between; align-items:center;
    padding:14px 18px; border-bottom:1px solid ${C.border}; }
  .panel-hd h2 { font-size:14px; font-weight:600; }
  .panel-body { padding:18px; }

  /* TABLE */
  table { width:100%; border-collapse:collapse; }
  th,td { padding:10px 14px; text-align:left; font-size:12.5px; }
  th { color:${C.textMid}; font-weight:600; letter-spacing:.04em; text-transform:uppercase;
    font-size:10.5px; border-bottom:1px solid ${C.border}; background:${C.surfaceL}; }
  tr:not(:last-child) td { border-bottom:1px solid ${C.borderL}; }
  tr:hover td { background:rgba(255,255,255,.02); }

  /* STATUS BADGES */
  .sb { display:inline-block; padding:2px 9px; border-radius:20px;
    font-size:10.5px; font-weight:700; letter-spacing:.04em; }
  .sb-active  { background:${C.greenL};  color:${C.green};  border:1px solid ${C.greenB}; }
  .sb-blocked { background:${C.redL};    color:${C.red};    border:1px solid ${C.redB}; }
  .sb-pending { background:${C.amberL};  color:${C.amber};  border:1px solid rgba(251,191,36,.3); }

  /* BUTTONS */
  .btn { border:none; border-radius:7px; cursor:pointer; font-size:12.5px;
    font-weight:600; padding:7px 16px; transition:all .15s; }
  .btn-gold { background:linear-gradient(135deg,${C.gold},#b8902a); color:#0a0a0f; }
  .btn-gold:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 18px ${C.goldB}; }
  .btn-gold:disabled { opacity:.45; cursor:not-allowed; }
  .btn-outline { background:transparent; border:1.5px solid ${C.border}; color:${C.textSub}; }
  .btn-outline:hover { border-color:${C.gold}; color:${C.gold}; }
  .btn-danger { background:${C.redL}; color:${C.red}; border:1px solid ${C.redB}; }
  .btn-danger:hover { background:rgba(248,113,113,.22); }
  .btn-green { background:${C.greenL}; color:${C.green}; border:1px solid ${C.greenB}; }
  .btn-green:hover { background:rgba(74,222,128,.2); }
  .btn-teal { background:${C.tealL}; color:${C.teal}; border:1px solid rgba(45,212,191,.3); }
  .btn-teal:hover { background:rgba(45,212,191,.2); }
  .btn-sm { padding:4px 10px; font-size:11px; border-radius:5px; }

  /* INPUT */
  .inp { background:${C.surfaceL}; border:1.5px solid ${C.border}; border-radius:8px;
    padding:8px 13px; color:${C.text}; font-size:13px; outline:none; transition:border .15s; }
  .inp:focus { border-color:${C.gold}; }
  .inp::placeholder { color:${C.textMid}; }
  select.inp option { background:${C.surface}; }

  /* FORM */
  .fg { margin-bottom:13px; }
  .fg label { display:block; font-size:11px; color:${C.textMid}; text-transform:uppercase;
    letter-spacing:.04em; margin-bottom:5px; }
  .fr { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .fr3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
  textarea.inp { font-family:inherit; resize:vertical; }

  /* MODAL */
  .modal-bd { position:fixed; inset:0; background:rgba(0,0,0,.65);
    display:flex; align-items:center; justify-content:center; z-index:200; }
  .modal { background:${C.surface}; border:1px solid ${C.border}; border-radius:16px;
    padding:28px; width:90%; max-width:560px; max-height:90vh; overflow-y:auto; }
  .modal h2 { font-size:16px; font-weight:700; margin-bottom:18px; }
  .modal-ft { display:flex; gap:10px; justify-content:flex-end; margin-top:20px; }

  /* CHART AREA */
  .chart-wrap { position:relative; height:160px; margin-top:8px; }
  canvas { position:absolute; inset:0; }

  /* MINI BAR */
  .mini-bars { display:flex; align-items:flex-end; gap:3px; height:52px; }
  .mini-bar { flex:1; border-radius:3px 3px 0 0; min-width:4px; transition:height .3s; }

  /* INLINE CHART (SVG) */
  .svg-chart { width:100%; overflow:visible; }

  /* TOAST */
  .toast { position:fixed; bottom:28px; right:28px; z-index:999;
    background:${C.surfaceL}; border:1px solid ${C.border}; border-radius:10px;
    padding:12px 18px; font-size:13px; max-width:320px;
    box-shadow:0 8px 32px rgba(0,0,0,.5); animation:slideUp .25s ease; }
  .toast.success { border-color:${C.greenB}; color:${C.green}; }
  .toast.error   { border-color:${C.redB};   color:${C.red}; }
  @keyframes slideUp { from{transform:translateY(20px);opacity:0} to{transform:translateY(0);opacity:1} }

  /* LOGIN */
  .adm-login { min-height:100vh; display:flex; align-items:center; justify-content:center; background:${C.bg}; }
  .adm-login-card { background:${C.surface}; border:1px solid ${C.border}; border-radius:16px;
    padding:40px; width:100%; max-width:380px; }
  .adm-login-card h1 { font-size:22px; font-weight:700; margin-bottom:6px; }
  .adm-login-card p { font-size:13px; color:${C.textMid}; margin-bottom:26px; }

  /* REPORT BUTTONS */
  .report-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:14px; }
  .report-card { background:${C.surfaceL}; border:1px solid ${C.border}; border-radius:10px;
    padding:16px; }
  .report-card h3 { font-size:13px; font-weight:600; margin-bottom:6px; }
  .report-card p  { font-size:12px; color:${C.textMid}; margin-bottom:12px; }
  .report-btns { display:flex; gap:6px; flex-wrap:wrap; }

  /* SCRAPER SETTINGS */
  .settings-row { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .interval-input { width:80px; text-align:center; font-size:18px; font-weight:700; }

  /* EMPTY */
  .empty { padding:40px; text-align:center; color:${C.textMid}; font-size:13px; }
  .empty-icon { font-size:32px; margin-bottom:8px; }

  @media(max-width:700px){
    .adm-sb { width:54px; }
    .adm-ni span:not(.ni) { display:none; }
    .adm-sb-logo span:last-child { display:none; }
    .adm-main { margin-left:54px; padding:16px 12px; }
    .fr,.fr3 { grid-template-columns:1fr; }
  }
`;

// ─── TINY HELPERS ─────────────────────────────────────────────────────────────
function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3400); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast ${type}`}>{msg}</div>;
}
function Spinner() {
  return <div style={{ padding:40, textAlign:"center", color:C.textMid }}>Loading…</div>;
}
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="modal-bd" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth:680 } : {}}>
        <h2>{title}</h2>{children}
      </div>
    </div>
  );
}
function StatCard({ label, value, sub, color, icon }) {
  return (
    <div className="stat-card">
      <div className="lbl">{icon && <span style={{ marginRight:5 }}>{icon}</span>}{label}</div>
      <div className="val" style={{ color }}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ─── INLINE SVG LINE CHART ────────────────────────────────────────────────────
function LineChart({ data, color, height = 100 }) {
  if (!data || data.length < 2) return <div style={{ height, display:"flex", alignItems:"center", justifyContent:"center", color:C.textMid, fontSize:12 }}>Not enough data</div>;
  const W = 400, H = height;
  const vals = data.map(d => d.cnt);
  const max  = Math.max(...vals, 1);
  const pts  = vals.map((v, i) => `${(i / (vals.length - 1)) * W},${H - (v / max) * (H - 8)}`).join(" ");
  const area = `M0,${H} L${pts.split(" ").map(p => `L${p}`).join(" ")} L${W},${H} Z`
    .replace("L L", "L");
  const line = `M${pts.split(" ").join(" L").replace("M","M")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="svg-chart" style={{ height }}>
      <defs>
        <linearGradient id={`g${color.replace("#","")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity=".3" />
          <stop offset="100%" stopColor={color} stopOpacity="0"  />
        </linearGradient>
      </defs>
      <path d={`M0,${H} ${pts.split(" ").map(p => `L${p}`).join(" ")} L${W},${H} Z`}
        fill={`url(#g${color.replace("#","")})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      {vals.map((v, i) => (
        <circle key={i} cx={(i / (vals.length - 1)) * W} cy={H - (v / max) * (H - 8)}
          r="3" fill={color} />
      ))}
    </svg>
  );
}

// ─── MINI BAR CHART ───────────────────────────────────────────────────────────
function BarChart({ data, color }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.cnt), 1);
  return (
    <div className="mini-bars" title="Hourly access (last 24h)">
      {Array.from({ length: 24 }, (_, hr) => {
        const hrStr = String(hr).padStart(2, "0");
        const entry = data.find(d => d.hr === hrStr);
        const pct   = entry ? (entry.cnt / max) * 100 : 0;
        return (
          <div key={hr} className="mini-bar"
            style={{ height: `${Math.max(pct, 4)}%`, background: pct > 0 ? color : C.border }}
            title={`${hrStr}:00 — ${entry?.cnt || 0} requests`} />
        );
      })}
    </div>
  );
}

// ─── DONUT CHART ──────────────────────────────────────────────────────────────
const DONUT_COLORS = [C.gold, C.blue, C.green, C.purple, C.teal, C.amber, C.red];
function DonutChart({ data, labelKey, valueKey = "cnt" }) {
  if (!data || data.length === 0) return <div className="empty"><div className="empty-icon">🍩</div>No data</div>;
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0) || 1;
  let cum = 0;
  const slices = data.slice(0, 7).map((d, i) => {
    const pct   = (d[valueKey] || 0) / total;
    const start = cum;
    cum += pct;
    const a1  = start * 2 * Math.PI - Math.PI / 2;
    const a2  = cum   * 2 * Math.PI - Math.PI / 2;
    const r   = 40, cx = 50, cy = 50;
    const x1  = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2  = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const big = pct > 0.5 ? 1 : 0;
    return { d: `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${big},1 ${x2},${y2} Z`,
             color: DONUT_COLORS[i], label: d[labelKey] || "?", cnt: d[valueKey] || 0, pct };
  });
  return (
    <div style={{ display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
      <svg viewBox="0 0 100 100" style={{ width:100, height:100, flexShrink:0 }}>
        <circle cx="50" cy="50" r="40" fill={C.surfaceL} />
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity=".9" />)}
        <circle cx="50" cy="50" r="24" fill={C.surface} />
      </svg>
      <div style={{ flex:1 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
            <div style={{ width:10, height:10, borderRadius:2, background:s.color, flexShrink:0 }} />
            <span style={{ fontSize:12, color:C.textSub, flex:1 }}>{s.label || "—"}</span>
            <span style={{ fontSize:12, fontWeight:600, color:C.text }}>{s.cnt}</span>
            <span style={{ fontSize:11, color:C.textMid, minWidth:34, textAlign:"right" }}>
              {(s.pct * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// VIEWS
// ══════════════════════════════════════════════════════════════════════════════

// ─── DASHBOARD VIEW ───────────────────────────────────────────────────────────
function DashboardView({ token, showToast }) {
  const [d, setD]         = useState(null);
  const [saving, setSaving] = useState(false);
  const [interval, setInterval_] = useState(6);

  const load = useCallback(() => {
    af("/dashboard", {}, token).then(r => { setD(r); setInterval_(r.settings?.scrapeIntervalHours || 6); })
      .catch(e => showToast(e.message, "error"));
  }, [token, showToast]);

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const saveInterval = async () => {
    setSaving(true);
    try {
      await af("/settings", { method:"POST", body:JSON.stringify({ scrapeIntervalHours: interval }) }, token);
      showToast(`Scraper set to every ${interval}h`, "success");
    } catch (e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const forceRun = async () => {
    try {
      await fetch(`${API_BASE}/scrape`, { method:"POST" });
      showToast("Scrape triggered!", "success");
      setTimeout(load, 2000);
    } catch { showToast("Could not trigger scrape", "error"); }
  };

  if (!d) return <Spinner />;
  const { stats, trends, recentUsers, recentJobs, settings } = d;

  return (
    <div>
      {/* ── KPI CARDS ── */}
      <div className="stat-grid">
        <StatCard icon="👥" label="Total Users"      value={stats.totalUsers}     color={C.blue}   sub={`+${stats.new7d} this week`} />
        <StatCard icon="✅" label="Active"            value={stats.activeUsers}    color={C.green}  sub={`${stats.activeSessions} online now`} />
        <StatCard icon="🚫" label="Blocked"           value={stats.blockedUsers}   color={C.red}    />
        <StatCard icon="🆕" label="New Today"         value={stats.newToday}       color={C.amber}  sub={`${stats.new30d} this month`} />
        <StatCard icon="📡" label="Requests (24h)"   value={stats.accesses24h}    color={C.purple} />
        <StatCard icon="📋" label="Admin Jobs"        value={stats.totalJobs}      color={C.gold}   />
      </div>

      {/* ── CHARTS ROW ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        <div className="panel">
          <div className="panel-hd"><h2>Registrations (14 days)</h2></div>
          <div className="panel-body">
            <LineChart data={trends.registrations} color={C.blue} height={110} />
          </div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Access Events (14 days)</h2></div>
          <div className="panel-body">
            <LineChart data={trends.access} color={C.gold} height={110} />
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        <div className="panel">
          <div className="panel-hd"><h2>Hourly Activity (24h)</h2></div>
          <div className="panel-body">
            <BarChart data={trends.hourly} color={C.purple} />
            <div style={{ fontSize:11, color:C.textMid, marginTop:8, textAlign:"center" }}>
              Hours 00–23 · hover for counts
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>User Qualifications</h2></div>
          <div className="panel-body">
            <DonutChart data={trends.qualDist} labelKey="qualification" />
          </div>
        </div>
      </div>

      {/* ── SCRAPER CONTROL ── */}
      <div className="panel" style={{ marginBottom:20 }}>
        <div className="panel-hd">
          <h2>🕷️ Scraper Control</h2>
          <button className="btn btn-sm btn-teal" onClick={forceRun}>▶ Run Now</button>
        </div>
        <div className="panel-body">
          <div className="settings-row">
            <div>
              <div style={{ fontSize:11, color:C.textMid, marginBottom:6, textTransform:"uppercase", letterSpacing:".04em" }}>Refresh Interval (hours)</div>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button className="btn btn-sm btn-outline" onClick={() => setInterval_(v => Math.max(1, v - 1))}>−</button>
                <input className="inp interval-input" type="number" min="1" max="168" value={interval}
                  onChange={e => setInterval_(Math.max(1, Math.min(168, parseInt(e.target.value) || 1)))} />
                <button className="btn btn-sm btn-outline" onClick={() => setInterval_(v => Math.min(168, v + 1))}>+</button>
                <button className="btn btn-gold btn-sm" onClick={saveInterval} disabled={saving}>
                  {saving ? "Saving…" : "Apply"}
                </button>
              </div>
              <div style={{ fontSize:11, color:C.textMid, marginTop:6 }}>Range: 1–168 hours (1 week max)</div>
            </div>
            <div style={{ marginLeft:"auto", textAlign:"right" }}>
              <div style={{ fontSize:11, color:C.textMid, marginBottom:4 }}>Last scraped</div>
              <div style={{ fontSize:13, color:C.textSub }}>
                {settings.lastScrapeAt ? settings.lastScrapeAt.slice(0,16).replace("T"," ") + " UTC" : "Never"}
              </div>
              <div style={{ fontSize:12, color:C.textMid, marginTop:4 }}>
                Current interval: <strong style={{ color:C.gold }}>{settings.scrapeIntervalHours}h</strong>
              </div>
            </div>
          </div>

          {/* Preset buttons */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:14 }}>
            {[1,2,3,6,12,24,48].map(h => (
              <button key={h} className={`btn btn-sm ${interval===h?"btn-gold":"btn-outline"}`}
                onClick={() => setInterval_(h)}>{h}h</button>
            ))}
          </div>
        </div>
      </div>

      {/* ── RECENT TABLES ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        <div className="panel">
          <div className="panel-hd"><h2>Recent Registrations</h2></div>
          {recentUsers.length === 0
            ? <div className="empty"><div className="empty-icon">👤</div>No users yet</div>
            : <table><thead><tr><th>Name</th><th>Status</th><th>Joined</th></tr></thead>
                <tbody>{recentUsers.map(u => (
                  <tr key={u.id}>
                    <td>{u.name}<div style={{ fontSize:11, color:C.textMid }}>{u.email}</div></td>
                    <td><span className={`sb sb-${u.status}`}>{u.status}</span></td>
                    <td style={{ color:C.textMid, fontSize:11 }}>{u.created_at?.slice(0,10)}</td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Recent Admin Jobs</h2></div>
          {recentJobs.length === 0
            ? <div className="empty"><div className="empty-icon">📋</div>No jobs added</div>
            : <table><thead><tr><th>Title</th><th>Level</th><th>Deadline</th></tr></thead>
                <tbody>{recentJobs.map(j => (
                  <tr key={j.id}>
                    <td style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.title}</td>
                    <td style={{ color:C.textMid, fontSize:11 }}>{j.level}</td>
                    <td style={{ color:C.textMid, fontSize:11 }}>{j.application_end || "—"}</td>
                  </tr>
                ))}</tbody>
              </table>
          }
        </div>
      </div>
    </div>
  );
}

// ─── ANALYTICS VIEW ───────────────────────────────────────────────────────────
function AnalyticsView({ token, showToast }) {
  const [d, setD]     = useState(null);
  const [days, setDays] = useState(30);

  const load = useCallback(() => {
    af(`/analytics?days=${days}`, {}, token).then(setD).catch(e => showToast(e.message, "error"));
  }, [token, days, showToast]);

  useEffect(() => { load(); }, [load]);

  if (!d) return <Spinner />;

  return (
    <div>
      {/* Period selector */}
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        {[7,14,30,60,90].map(n => (
          <button key={n} className={`btn btn-sm ${days===n?"btn-gold":"btn-outline"}`}
            onClick={() => setDays(n)}>Last {n}d</button>
        ))}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        <div className="panel">
          <div className="panel-hd"><h2>Daily Registrations</h2></div>
          <div className="panel-body"><LineChart data={d.registrationsDaily} color={C.blue} height={120} /></div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Daily Access Events</h2></div>
          <div className="panel-body"><LineChart data={d.accessDaily} color={C.gold} height={120} /></div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Unique Active Users / Day</h2></div>
          <div className="panel-body"><LineChart data={d.uniqueUsersDaily} color={C.green} height={120} /></div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Hourly Traffic (24h)</h2></div>
          <div className="panel-body">
            <BarChart data={d.hourly24h} color={C.purple} />
            <div style={{ fontSize:11, color:C.textMid, marginTop:6, textAlign:"center" }}>00–23h</div>
          </div>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
        <div className="panel">
          <div className="panel-hd"><h2>Qualification Distribution</h2></div>
          <div className="panel-body"><DonutChart data={d.qualDist} labelKey="qualification" /></div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Preferred Level</h2></div>
          <div className="panel-body"><DonutChart data={d.levelDist} labelKey="preferred_level" /></div>
        </div>
        <div className="panel">
          <div className="panel-hd"><h2>Reservation Category</h2></div>
          <div className="panel-body"><DonutChart data={d.categoryDist} labelKey="category" /></div>
        </div>
      </div>

      {d.actionBreakdown?.length > 0 && (
        <div className="panel" style={{ marginTop:16 }}>
          <div className="panel-hd"><h2>Top API Actions (last {days}d)</h2></div>
          <table>
            <thead><tr><th>Action</th><th>Count</th><th>Share</th></tr></thead>
            <tbody>
              {(() => {
                const total = d.actionBreakdown.reduce((s,a) => s + a.cnt, 0) || 1;
                return d.actionBreakdown.map((a, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily:"monospace", fontSize:12 }}>{a.action}</td>
                    <td style={{ fontWeight:600 }}>{a.cnt}</td>
                    <td>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <div style={{ flex:1, height:6, background:C.border, borderRadius:3 }}>
                          <div style={{ width:`${(a.cnt/total)*100}%`, height:"100%",
                            background:DONUT_COLORS[i%7], borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:11, color:C.textMid, minWidth:32 }}>
                          {((a.cnt/total)*100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── USERS VIEW ───────────────────────────────────────────────────────────────
function UsersView({ token, showToast }) {
  const [users, setUsers]     = useState([]);
  const [search, setSearch]   = useState("");
  const [sf, setSf]           = useState("");
  const [loading, setLoading] = useState(false);
  const [delUser, setDelUser] = useState(null);
  const [detail, setDetail]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = new URLSearchParams();
    if (search) p.set("q", search);
    if (sf)     p.set("status", sf);
    af(`/users?${p}`, {}, token)
      .then(d => setUsers(d.users))
      .catch(e => showToast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [token, search, sf, showToast]);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (id, status) => {
    try {
      await af(`/users/${id}/status`, { method:"PATCH", body:JSON.stringify({ status }) }, token);
      showToast(`User ${status}`, "success"); load();
    } catch(e) { showToast(e.message, "error"); }
  };

  const del = async (id) => {
    try {
      await af(`/users/${id}`, { method:"DELETE" }, token);
      showToast("User deleted", "success"); setDelUser(null); load();
    } catch(e) { showToast(e.message, "error"); }
  };

  const loadDetail = async (id) => {
    try {
      const d = await af(`/users/${id}`, {}, token); setDetail(d);
    } catch(e) { showToast(e.message, "error"); }
  };

  return (
    <div>
      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <input className="inp" style={{ flex:1 }} placeholder="Search name or email…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="inp" value={sf} onChange={e => setSf(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="blocked">Blocked</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      <div className="panel">
        <div className="panel-hd">
          <h2>Users <span style={{ color:C.textMid, fontWeight:400 }}>({users.length})</span></h2>
        </div>
        {loading ? <Spinner /> : users.length === 0
          ? <div className="empty"><div className="empty-icon">👥</div>No users found</div>
          : <table>
              <thead><tr><th>Name / Email</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
              <tbody>{users.map(u => (
                <tr key={u.id}>
                  <td>
                    <button style={{ background:"none", border:"none", cursor:"pointer", color:C.text, fontWeight:600, padding:0, textAlign:"left" }}
                      onClick={() => loadDetail(u.id)}>{u.name}</button>
                    <div style={{ fontSize:11, color:C.textMid }}>{u.email}</div>
                  </td>
                  <td><span className={`sb sb-${u.status}`}>{u.status}</span></td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{u.created_at?.slice(0,10)}</td>
                  <td>
                    <div style={{ display:"flex", gap:5 }}>
                      {u.status !== "active"  && <button className="btn btn-sm btn-green"   onClick={() => setStatus(u.id,"active")}>Approve</button>}
                      {u.status !== "blocked" && <button className="btn btn-sm btn-danger"  onClick={() => setStatus(u.id,"blocked")}>Block</button>}
                      <button className="btn btn-sm btn-danger" onClick={() => setDelUser(u)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
        }
      </div>

      {/* User detail modal */}
      {detail && (
        <Modal title={`User: ${detail.user.name}`} onClose={() => setDetail(null)} wide>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
            <div>
              <div style={{ fontSize:11, color:C.textMid, marginBottom:8, textTransform:"uppercase" }}>Account</div>
              {[["Email", detail.user.email], ["Status", detail.user.status], ["Joined", detail.user.created_at?.slice(0,10)]].map(([k,v]) => (
                <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                  <span style={{ color:C.textMid }}>{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </div>
            {detail.profile && (
              <div>
                <div style={{ fontSize:11, color:C.textMid, marginBottom:8, textTransform:"uppercase" }}>Profile</div>
                {[["Qualification", detail.profile.qualification], ["Category", detail.profile.category], ["Preferred Level", detail.profile.preferred_level]].map(([k,v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:13 }}>
                    <span style={{ color:C.textMid }}>{k}</span><span>{v || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {detail.recentActivity?.length > 0 && (
            <div>
              <div style={{ fontSize:11, color:C.textMid, marginBottom:8, textTransform:"uppercase" }}>Recent Activity</div>
              {detail.recentActivity.map((a, i) => (
                <div key={i} style={{ display:"flex", gap:12, marginBottom:5, fontSize:12 }}>
                  <span style={{ color:C.textMid }}>{a.ts?.slice(0,16).replace("T"," ")}</span>
                  <span style={{ fontFamily:"monospace", color:C.textSub }}>{a.action}</span>
                </div>
              ))}
            </div>
          )}
          <div className="modal-ft">
            <button className="btn btn-outline" onClick={() => setDetail(null)}>Close</button>
          </div>
        </Modal>
      )}

      {delUser && (
        <Modal title="Confirm Deletion" onClose={() => setDelUser(null)}>
          <p style={{ color:C.textSub, marginBottom:20 }}>
            Permanently delete <strong style={{ color:C.text }}>{delUser.name}</strong>? All their data will be removed.
          </p>
          <div className="modal-ft">
            <button className="btn btn-outline" onClick={() => setDelUser(null)}>Cancel</button>
            <button className="btn btn-danger"  onClick={() => del(delUser.id)}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── JOBS VIEW ────────────────────────────────────────────────────────────────
const EMPTY_JOB = {
  title:"", body:"", category:"Other", level:"Central",
  minAge:18, maxAge:35, qualification:"Any",
  vacancies:0, salary:"", officialLink:"",
  applicationStart:"", applicationEnd:"", examDate:"",
};

function JobsView({ token, showToast }) {
  const [jobs, setJobs]     = useState([]);
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState(EMPTY_JOB);
  const [saving, setSaving] = useState(false);
  const [delJob, setDelJob] = useState(null);

  const load = useCallback(() => {
    af("/jobs", {}, token).then(d => setJobs(d.jobs)).catch(e => showToast(e.message, "error"));
  }, [token, showToast]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY_JOB); setModal("new"); };
  const openEdit   = j => {
    setForm({
      title:j.title, body:j.body||"", category:j.category, level:j.level,
      minAge:j.min_age, maxAge:j.max_age, qualification:j.qualification,
      vacancies:j.vacancies||0, salary:j.salary||"", officialLink:j.official_link||"",
      applicationStart:j.application_start||"", applicationEnd:j.application_end||"",
      examDate:j.exam_date||"",
    });
    setModal(j);
  };

  const save = async () => {
    if (!form.title.trim()) return showToast("Title required", "error");
    setSaving(true);
    try {
      if (modal === "new") {
        await af("/jobs", { method:"POST", body:JSON.stringify(form) }, token);
        showToast("Job created!", "success");
      } else {
        await af(`/jobs/${modal.id}`, { method:"PUT", body:JSON.stringify(form) }, token);
        showToast("Job updated!", "success");
      }
      setModal(null); load();
    } catch(e) { showToast(e.message, "error"); }
    finally { setSaving(false); }
  };

  const del = async id => {
    try {
      await af(`/jobs/${id}`, { method:"DELETE" }, token);
      showToast("Deleted", "success"); setDelJob(null); load();
    } catch(e) { showToast(e.message, "error"); }
  };

  const F = k => ({ value:form[k]||"", onChange:e => setForm(p=>({...p,[k]:e.target.value})), className:"inp", style:{width:"100%"} });

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:16 }}>
        <button className="btn btn-gold" onClick={openCreate}>＋ Add Job / Exam</button>
      </div>

      <div className="panel">
        <div className="panel-hd">
          <h2>Admin Jobs & Exams <span style={{ color:C.textMid, fontWeight:400 }}>({jobs.length})</span></h2>
        </div>
        {jobs.length === 0
          ? <div className="empty"><div className="empty-icon">📋</div>No jobs added yet</div>
          : <table>
              <thead><tr><th>Title</th><th>Category</th><th>Level</th><th>Age</th><th>Vacancies</th><th>Deadline</th><th>Actions</th></tr></thead>
              <tbody>{jobs.map(j => (
                <tr key={j.id}>
                  <td style={{ maxWidth:180, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.title}</td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{j.category}</td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{j.level}</td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{j.min_age}–{j.max_age}</td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{j.vacancies||"—"}</td>
                  <td style={{ color:C.textMid, fontSize:11 }}>{j.application_end||"—"}</td>
                  <td>
                    <div style={{ display:"flex", gap:5 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => openEdit(j)}>Edit</button>
                      <button className="btn btn-sm btn-danger"  onClick={() => setDelJob(j)}>Del</button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
        }
      </div>

      {modal !== null && (
        <Modal title={modal === "new" ? "Add Job / Exam" : "Edit Job"} onClose={() => setModal(null)} wide>
          <div className="fg"><label>Title *</label><input {...F("title")} placeholder="e.g. UPSC Civil Services 2025" /></div>
          <div className="fg"><label>Description</label>
            <textarea {...F("body")} rows={3} placeholder="Additional details…" className="inp" style={{ width:"100%", fontFamily:"inherit", resize:"vertical" }} />
          </div>
          <div className="fr">
            <div className="fg"><label>Category</label>
              <select {...F("category")}>{["Other","Central Govt","State Govt","Banking","Railway","Defence","Teaching","Police","Engineering","Medical"].map(c=><option key={c}>{c}</option>)}</select>
            </div>
            <div className="fg"><label>Level</label>
              <select {...F("level")}><option>Central</option><option>Kerala</option><option>Both</option></select>
            </div>
          </div>
          <div className="fr3">
            <div className="fg"><label>Min Age</label><input {...F("minAge")} type="number" min="16" max="70" /></div>
            <div className="fg"><label>Max Age</label><input {...F("maxAge")} type="number" min="16" max="70" /></div>
            <div className="fg"><label>Vacancies</label><input {...F("vacancies")} type="number" min="0" /></div>
          </div>
          <div className="fr">
            <div className="fg"><label>Min Qualification</label>
              <select {...F("qualification")}>{["Any","10th","12th","Diploma","Graduation","Post Graduation","PhD"].map(q=><option key={q}>{q}</option>)}</select>
            </div>
            <div className="fg"><label>Salary / Pay Scale</label><input {...F("salary")} placeholder="e.g. ₹25,500–₹1,51,100" /></div>
          </div>
          <div className="fg"><label>Official Link</label><input {...F("officialLink")} placeholder="https://upsc.gov.in" /></div>
          <div className="fr3">
            <div className="fg"><label>App. Start</label><input {...F("applicationStart")} type="date" /></div>
            <div className="fg"><label>App. End</label><input {...F("applicationEnd")} type="date" /></div>
            <div className="fg"><label>Exam Date</label><input {...F("examDate")} type="date" /></div>
          </div>
          <div className="modal-ft">
            <button className="btn btn-outline" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-gold" onClick={save} disabled={saving}>{saving?"Saving…":"Save"}</button>
          </div>
        </Modal>
      )}

      {delJob && (
        <Modal title="Confirm Deletion" onClose={() => setDelJob(null)}>
          <p style={{ color:C.textSub, marginBottom:20 }}>Delete <strong style={{ color:C.text }}>{delJob.title}</strong>?</p>
          <div className="modal-ft">
            <button className="btn btn-outline" onClick={() => setDelJob(null)}>Cancel</button>
            <button className="btn btn-danger"  onClick={() => del(delJob.id)}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── REPORTS VIEW ─────────────────────────────────────────────────────────────
function ReportsView({ token, showToast }) {
  const [days, setDays] = useState(30);

  const dl = (path) => {
    const url = `${API_BASE}/admin${path}`;
    const a   = document.createElement("a");
    a.href    = url;
    fetch(url, { headers:{ Authorization:`Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const ext = path.includes("format=csv") ? "csv" : "json";
        const fname = path.split("/reports/")[1].split("?")[0];
        a.href     = URL.createObjectURL(blob);
        a.download = `easyhire_${fname}.${ext}`;
        a.click();
        showToast(`Downloaded ${fname}.${ext}`, "success");
      })
      .catch(() => showToast("Download failed", "error"));
  };

  const reports = [
    { title:"User List (CSV)",      icon:"👥", desc:"All registered users with status and join date.",    path:`/reports/users?format=csv` },
    { title:"User List (JSON)",     icon:"👥", desc:"Same data in JSON format for integration.",          path:`/reports/users?format=json` },
    { title:"Activity Log (CSV)",   icon:"📡", desc:`Access log for last ${days} days.`,                 path:`/reports/activity?format=csv&days=${days}` },
    { title:"Activity Log (JSON)",  icon:"📡", desc:`Same activity log in JSON format.`,                 path:`/reports/activity?format=json&days=${days}` },
    { title:"Summary Report (JSON)",icon:"📊", desc:"Aggregated KPIs: users, jobs, activity, settings.", path:`/reports/summary?format=json` },
    { title:"Summary Report (CSV)", icon:"📊", desc:"Same summary in a simple spreadsheet format.",      path:`/reports/summary?format=csv` },
  ];

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <span style={{ fontSize:13, color:C.textMid }}>Activity log period:</span>
        {[7,14,30,60,90].map(n => (
          <button key={n} className={`btn btn-sm ${days===n?"btn-gold":"btn-outline"}`}
            onClick={() => setDays(n)}>Last {n}d</button>
        ))}
      </div>

      <div className="report-grid">
        {reports.map((r, i) => (
          <div className="report-card" key={i}>
            <h3>{r.icon} {r.title}</h3>
            <p>{r.desc}</p>
            <div className="report-btns">
              <button className="btn btn-sm btn-gold" onClick={() => dl(r.path)}>⬇ Download</button>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ─── SECURITY VIEW ────────────────────────────────────────────────────────────
function SecurityView({ token, showToast, adminInfo }) {
  const [pw, setPw]     = useState({ current:"", next:"", confirm:"" });
  const [saving, setSaving] = useState(false);

  const changePw = async () => {
    if (!pw.current || !pw.next) return showToast("Fill all fields","error");
    if (pw.next.length < 8) return showToast("New password must be ≥ 8 chars","error");
    if (pw.next !== pw.confirm) return showToast("Passwords don't match","error");
    setSaving(true);
    try {
      showToast("To implement: POST /api/admin/auth/change-password","success");
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="panel" style={{ padding:24, maxWidth:480, marginBottom:20 }}>
        <h2 style={{ fontSize:14, marginBottom:16 }}>Admin Account</h2>
        <div style={{ background:C.surfaceL, border:`1px solid ${C.border}`, borderRadius:10, padding:14, marginBottom:20 }}>
          <div style={{ fontSize:11, color:C.textMid, marginBottom:4 }}>Logged in as</div>
          <div style={{ fontWeight:600 }}>{adminInfo?.name}</div>
          <div style={{ fontSize:13, color:C.textMid }}>{adminInfo?.email}</div>
          <span className="adm-badge" style={{ marginTop:8, display:"inline-block" }}>ADMIN</span>
        </div>
        <h2 style={{ fontSize:14, marginBottom:12 }}>Change Password</h2>
        {["current","next","confirm"].map(k => (
          <div className="fg" key={k}>
            <label>{k==="current"?"Current Password":k==="next"?"New Password":"Confirm"}</label>
            <input type="password" className="inp" style={{ width:"100%" }}
              value={pw[k]} onChange={e => setPw(p=>({...p,[k]:e.target.value}))} placeholder="••••••••" />
          </div>
        ))}
        <button className="btn btn-gold" onClick={changePw} disabled={saving}>{saving?"Saving…":"Update Password"}</button>
      </div>


    </div>
  );
}

// ─── ADMIN LOGIN ──────────────────────────────────────────────────────────────
function AdminLogin({ onLogin, onBack }) {
  const [form, setForm]     = useState({ email:"admin@easyhire.com", password:"" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async e => {
    e.preventDefault(); setError(""); setLoading(true);
    try {
      const d = await af("/auth/login", { method:"POST", body:JSON.stringify(form) });
      onLogin(d.token, d.admin);
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="adm-login">
      <div className="adm-login-card">
        {/* Back to site */}
        <button onClick={onBack} style={{
          background:"none", border:"none", cursor:"pointer",
          color:C.textMid, fontSize:13, marginBottom:20,
          display:"flex", alignItems:"center", gap:6, padding:0,
          transition:"color .15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = C.gold}
          onMouseLeave={e => e.currentTarget.style.color = C.textMid}
        >
          ← Back
        </button>

        <h1>🛡️ Admin Panel</h1>
        <p>EasyHire — Restricted Access</p>
        {error && <div style={{ background:C.redL, border:`1px solid ${C.redB}`, color:C.red, borderRadius:8, padding:"10px 14px", marginBottom:16, fontSize:13 }}>{error}</div>}
        <form onSubmit={submit}>
          <div className="fg"><label>Email</label>
            <input className="inp" style={{ width:"100%" }} type="email" autoComplete="username"
              value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} required />
          </div>
          <div className="fg" style={{ marginBottom:20 }}><label>Password</label>
            <input className="inp" style={{ width:"100%" }} type="password" autoComplete="current-password"
              value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} required />
          </div>
          <button type="submit" className="btn btn-gold" style={{ width:"100%", padding:"13px", fontSize:14 }} disabled={loading}>
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      
      </div>
    </div>
  );
}

// ─── SIDEBAR NAV ──────────────────────────────────────────────────────────────
const NAV = [
  { section:"Overview" },
  { id:"dashboard",   icon:"📊", label:"Dashboard"     },
  { id:"analytics",   icon:"📈", label:"Analytics"     },
  { section:"Manage" },
  { id:"users",       icon:"👥", label:"Users"         },
  { id:"jobs",        icon:"📋", label:"Jobs & Exams"  },
  { section:"System" },
  { id:"reports",     icon:"📄", label:"Reports"       },
  { id:"security",    icon:"🔐", label:"Security"      },
];

const TAB_TITLES = {
  dashboard:"Dashboard", analytics:"Analytics",
  users:"User Management", jobs:"Jobs & Exams",
  reports:"Reports", security:"Security",
};

// ─── ROOT ─────────────────────────────────────────────────────────────────────
export default function AdminDashboard({ onBack }) {
  const [token, setToken]       = useState(() => sessionStorage.getItem("admin_token") || "");
  const [adminInfo, setAdminInfo] = useState(null);
  const [tab, setTab]           = useState("dashboard");
  const [toast, setToast]       = useState(null);

  const showToast = useCallback((msg, type = "success") => {
    setToast({ msg, type, key: Date.now() });
  }, []);

  const handleLogin = (t, info) => {
    sessionStorage.setItem("admin_token", t);
    setToken(t); setAdminInfo(info);
  };

  const handleLogout = async () => {
    try { await af("/auth/logout", { method:"POST" }, token); } catch {}
    sessionStorage.removeItem("admin_token");
    setToken(""); setAdminInfo(null);
    if (onBack) onBack();
  };

  useEffect(() => {
    if (token) {
      af("/auth/me", {}, token).then(setAdminInfo)
        .catch(() => { sessionStorage.removeItem("admin_token"); setToken(""); });
    }
  }, []);

  return (
    <>
      <style>{CSS}</style>
      <div className="adm">
        {!token
          ? <AdminLogin onLogin={handleLogin} onBack={onBack} />
          : (
            <>
              <aside className="adm-sb">
                <div className="adm-sb-logo">🛡️ <span>EasyHire</span> Admin</div>
                <nav className="adm-nav">
                  {NAV.map((n, i) =>
                    n.section
                      ? <div className="adm-nav-section" key={i}>{n.section}</div>
                      : (
                        <div key={n.id} className={`adm-ni ${tab===n.id?"active":""}`} onClick={() => setTab(n.id)}>
                          <span className="ni">{n.icon}</span>
                          <span>{n.label}</span>
                        </div>
                      )
                  )}
                </nav>
                <div className="adm-sb-foot">
                  <div style={{ marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{adminInfo?.name}</div>
                  <button className="btn btn-sm btn-outline" style={{ width:"100%" }} onClick={handleLogout}>Logout</button>
                </div>
              </aside>

              <main className="adm-main">
                <div className="adm-topbar">
                  <div style={{ display:"flex", alignItems:"center", gap:14 }}>
                    <button onClick={onBack} style={{
                      background:"none", border:`1px solid ${C.border}`,
                      borderRadius:7, cursor:"pointer", color:C.textMid,
                      fontSize:12, padding:"5px 12px", display:"flex",
                      alignItems:"center", gap:5, transition:"all .15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor=C.gold; e.currentTarget.style.color=C.gold; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor=C.border; e.currentTarget.style.color=C.textMid; }}
                    >
                      ← Back to Site
                    </button>
                    <h1>{TAB_TITLES[tab]}</h1>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span className="adm-badge">ADMIN</span>
                    <span style={{ fontSize:12, color:C.textMid }}>{adminInfo?.email}</span>
                  </div>
                </div>

                {tab==="dashboard" && <DashboardView token={token} showToast={showToast} />}
                {tab==="analytics" && <AnalyticsView token={token} showToast={showToast} />}
                {tab==="users"     && <UsersView     token={token} showToast={showToast} />}
                {tab==="jobs"      && <JobsView      token={token} showToast={showToast} />}
                {tab==="reports"   && <ReportsView   token={token} showToast={showToast} />}
                {tab==="security"  && <SecurityView  token={token} showToast={showToast} adminInfo={adminInfo} />}
              </main>
            </>
          )
        }
        {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      </div>
    </>
  );
}
