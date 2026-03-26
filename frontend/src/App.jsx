import { useState, useEffect, useCallback } from "react";
import StudyChatbot from './StudyChatbot';
import AdminDashboard from './AdminDashboard';
// ─── API CONFIG ───────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function apiFetch(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { headers, ...options });
  } catch {
    throw new Error("Cannot connect to the backend. Make sure the Python server is running on port 5000.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error (${res.status})`);
  }
  return res.json();
}

// ─── UTILS ────────────────────────────────────────────────────────────────
function getDaysRemaining(dateStr) {
  if (!dateStr) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parts = dateStr.split("-").map(Number);
  const target = new Date(parts[0], parts[1] - 1, parts[2]);
  return Math.ceil((target - today) / 86400000);
}

function formatDate(dateStr) {
  if (!dateStr) return "TBA";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function getDeadlineStatus(dateStr) {
  const days = getDaysRemaining(dateStr);
  if (days < 0)   return { label: "Closed",        color: "#6b7280", bg: "rgba(107,114,128,.12)" };
  if (days === 0) return { label: "Today!",         color: "#f87171", bg: "rgba(248,113,113,.15)" };
  if (days <= 3)  return { label: `${days}d left`,  color: "#fb923c", bg: "rgba(251,146,60,.15)"  };
  if (days <= 7)  return { label: `${days}d left`,  color: "#fbbf24", bg: "rgba(251,191,36,.15)"  };
  if (days <= 30) return { label: `${days}d left`,  color: "#34d399", bg: "rgba(52,211,153,.15)"  };
  return           { label: `${days}d left`,        color: "#60a5fa", bg: "rgba(96,165,250,.15)"  };
}

// ─── COLOUR TOKENS ────────────────────────────────────────────────────────
const C = {
  bg:       "#0a0a0f",
  surface:  "#111118",
  surfaceL: "#16161f",
  border:   "#2a2a3a",
  borderL:  "#1e1e2e",
  text:     "#f0ede8",
  textSub:  "#c4bfb8",
  textMid:  "#8a8278",
  textDim:  "#5a5650",
  gold:     "#d4a843",
  goldL:    "rgba(212,168,67,.15)",
  goldB:    "rgba(212,168,67,.3)",
  green:    "#4ade80",
  greenL:   "rgba(74,222,128,.12)",
  greenB:   "rgba(74,222,128,.3)",
  blue:     "#60a5fa",
  blueL:    "rgba(96,165,250,.12)",
  blueB:    "rgba(96,165,250,.3)",
  red:      "#f87171",
  redL:     "rgba(248,113,113,.12)",
  redB:     "rgba(248,113,113,.3)",
  amber:    "#fbbf24",
  amberL:   "rgba(251,191,36,.12)",
};

// ─── GLOBAL CSS ───────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Lato:wght@300;400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: 'Lato', sans-serif; font-size: 15px; line-height: 1.6; }
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: ${C.bg}; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }

  .font-display { font-family: 'Playfair Display', serif; }
  .font-serif   { font-family: 'Cormorant Garamond', serif; }

  .btn-primary {
    background: linear-gradient(135deg, ${C.gold}, #b8902a);
    color: #0a0a0f; border: none; border-radius: 8px;
    padding: 13px 32px; font: 700 14px 'Lato', sans-serif;
    letter-spacing: .06em; cursor: pointer; transition: all .2s;
  }
  .btn-primary:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(212,168,67,.4); }
  .btn-primary:disabled { opacity: .45; cursor: not-allowed; }

  .btn-outline {
    background: transparent; color: ${C.textSub};
    border: 1.5px solid ${C.border}; border-radius: 8px;
    padding: 10px 20px; font: 500 14px 'Lato', sans-serif;
    cursor: pointer; transition: all .2s;
  }
  .btn-outline:hover { border-color: ${C.gold}; color: ${C.gold}; }

  .btn-ghost {
    background: transparent; color: ${C.textMid}; border: none;
    padding: 8px 14px; font: 500 14px 'Lato', sans-serif;
    cursor: pointer; transition: color .2s;
  }
  .btn-ghost:hover { color: ${C.gold}; }

  .input {
    width: 100%; background: ${C.bg}; border: 1.5px solid ${C.border};
    border-radius: 8px; padding: 11px 14px; color: ${C.text};
    font: 15px 'Lato', sans-serif; outline: none; transition: border-color .2s;
  }
  .input::placeholder { color: ${C.textDim}; }
  .input:focus { border-color: ${C.gold}; }
  .input option { background: ${C.surface}; color: ${C.text}; }

  .card {
    background: ${C.surface}; border: 1.5px solid ${C.borderL};
    border-radius: 14px; padding: 24px; position: relative; overflow: hidden;
  }
  .card-hover { cursor: pointer; transition: all .25s; }
  .card-hover::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    background: linear-gradient(90deg, ${C.gold}, #b8902a); opacity: 0; transition: opacity .2s;
  }
  .card-hover:hover { border-color: ${C.goldB}; transform: translateY(-3px); box-shadow: 0 14px 44px rgba(0,0,0,.5); }
  .card-hover:hover::before { opacity: 1; }

  .badge {
    display: inline-block; padding: 3px 10px; border-radius: 20px;
    font-size: 12px; font-weight: 700; font-family: 'Lato', sans-serif; letter-spacing: .02em;
  }

  .pill {
    padding: 7px 16px; border-radius: 20px; border: 1.5px solid ${C.border};
    background: transparent; color: ${C.textMid};
    cursor: pointer; font: 600 13px 'Lato', sans-serif; transition: all .2s;
  }
  .pill.active { background: ${C.gold}; border-color: ${C.gold}; color: #0a0a0f; }
  .pill:hover:not(.active) { border-color: ${C.gold}; color: ${C.gold}; }

  .modal-bg {
    position: fixed; inset: 0; background: rgba(0,0,0,.88);
    backdrop-filter: blur(8px); z-index: 200;
    display: flex; align-items: flex-start; justify-content: center;
    padding: 24px 16px; overflow-y: auto;
  }
  .modal-box {
    background: ${C.surface}; border: 1.5px solid ${C.border};
    border-radius: 18px; width: 100%; max-width: 740px;
    margin: auto; box-shadow: 0 24px 80px rgba(0,0,0,.7);
  }

  .stat-tile {
    background: ${C.surface}; border: 1.5px solid ${C.borderL};
    border-radius: 12px; padding: 20px; text-align: center;
  }

  .grid-bg {
    background-color: ${C.bg};
    background-image: radial-gradient(circle at 1px 1px, #1a1a2a 1px, transparent 0);
    background-size: 32px 32px;
  }

  @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  .fade-up { animation: fadeUp .45s ease both; }

  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
  .pulse { animation: pulse 1.8s infinite; }

  @media(max-width:600px){
    .stats-4 { grid-template-columns: 1fr 1fr !important; }
    .hero-h1 { font-size: 48px !important; }
    .two-col { grid-template-columns: 1fr !important; }
  }
`;

// ─── ROOT APP ─────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("eh_token") || null);
  const [user,  setUser]  = useState(() => {
    try { return JSON.parse(localStorage.getItem("eh_user") || "null"); } catch { return null; }
  });

  const [screen, setScreen]             = useState("home");
  const [profile, setProfile]           = useState(() => {
    try { return JSON.parse(localStorage.getItem("eh_profile") || "null"); } catch { return null; }
  });
  const [apiData, setApiData]           = useState(() => {
    try { return JSON.parse(localStorage.getItem("eh_apidata") || "null"); } catch { return null; }
  });
  const [loading, setLoading]           = useState(false);
  const [apiError, setApiError]         = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [filter, setFilter]             = useState({ level:"All", category:"All", search:"", sort:"deadline" });
  const [toast, setToast]               = useState(null);
  const [savedIds, setSavedIds]         = useState([]);
  const [savedExams, setSavedExams]     = useState([]);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3800);
  };

  const persistAuth = (tok, usr) => {
    setToken(tok); setUser(usr);
    localStorage.setItem("eh_token", tok);
    localStorage.setItem("eh_user", JSON.stringify(usr));
  };

  const clearAuth = () => {
    setToken(null); setUser(null); setProfile(null); setApiData(null);
    localStorage.removeItem("eh_token");
    localStorage.removeItem("eh_user");
    localStorage.removeItem("eh_profile");
    localStorage.removeItem("eh_apidata");
  };

  const loadSaved = useCallback(async (tok) => {
    if (!tok) return;
    try {
      const data = await apiFetch("/saved", {}, tok);
      setSavedIds(data.savedIds || []);
      setSavedExams(data.exams || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { if (token) loadSaved(token); }, [token, loadSaved]);

  const toggleSave = async (exam) => {
    if (!token) { showToast("Log in to save exams", "warn"); return; }
    const isSaved = savedIds.includes(exam.id);
    try {
      if (isSaved) {
        await apiFetch(`/saved/${exam.id}`, { method:"DELETE" }, token);
        setSavedIds(s => s.filter(id => id !== exam.id));
        setSavedExams(s => s.filter(e => e.id !== exam.id));
        showToast("Exam removed from saved", "info");
      } else {
        await apiFetch(`/saved/${exam.id}`, { method:"POST" }, token);
        setSavedIds(s => [...s, exam.id]);
        setSavedExams(s => [...s, exam]);
        showToast("Exam saved!", "success");
      }
    } catch (e) { showToast(e.message, "warn"); }
  };

  const handleLogin = async (tok, usr, prof) => {
    persistAuth(tok, usr);
    const mappedProf = prof ? mapProfile(prof) : null;
    if (mappedProf) {
      setProfile(mappedProf); localStorage.setItem("eh_profile", JSON.stringify(mappedProf));
      showToast(`Welcome back, ${usr.name}!`, "success");
      setLoading(true);
      try {
        const data = await apiFetch("/eligible", {
          method: "POST",
          body: JSON.stringify({
            dob: mappedProf.dob, qualification: mappedProf.qualification,
            percentage: mappedProf.percentage || null, category: mappedProf.category,
            gender: mappedProf.gender, preferredLevel: mappedProf.preferredLevel,
          }),
        });
        setApiData(data); localStorage.setItem("eh_apidata", JSON.stringify(data));
        setScreen("dashboard");
        showToast(`Found ${data.summary.total} exams matching your profile!`, "success");
      } catch {
        setScreen("dashboard");
      } finally {
        setLoading(false);
      }
    } else {
      showToast(`Welcome back, ${usr.name}! Please fill in your details.`, "success");
      setScreen("profile");
    }
  };

  const handleRegister = (tok, usr) => {
    persistAuth(tok, usr);
    showToast(`Account created! Welcome, ${usr.name}! Fill in your details.`, "success");
    setScreen("profile");
  };

  const handleLogout = async () => {
    try { await apiFetch("/auth/logout", { method:"POST" }, token); } catch {}
    clearAuth();
    setSavedIds([]); setSavedExams([]);
    
    showToast("Logged out successfully", "info");
    setScreen("home");
  };

  const mapProfile = (p) => p ? ({
    dob: p.dob, gender: p.gender,
    qualification: p.qualification,
    percentage: p.percentage,
    stream: p.stream,
    category: p.category,
    preferredLevel: p.preferred_level,
  }) : null;

  const handleProfileSubmit = async (prof) => {
    setProfile(prof); localStorage.setItem("eh_profile", JSON.stringify(prof));
    setLoading(true);
    setApiError(null);
    if (token) {
      try { await apiFetch("/profile", { method:"POST", body:JSON.stringify(prof) }, token); }
      catch { /* non-fatal */ }
    }
    try {
      const data = await apiFetch("/eligible", {
        method: "POST",
        body: JSON.stringify({
          dob: prof.dob, qualification: prof.qualification,
          percentage: prof.percentage || null, category: prof.category,
          gender: prof.gender, preferredLevel: prof.preferredLevel,
        }),
      });
      setApiData(data); localStorage.setItem("eh_apidata", JSON.stringify(data));
      setScreen("dashboard");
      showToast(`Found ${data.summary.total} exams matching your profile!`, "success");
    } catch (err) {
      setApiError(err.message);
      showToast(err.message, "warn");
      setScreen("dashboard");
    } finally {
      setLoading(false);
    }
  };

  const allEligible = apiData?.all || [];

  const filteredExams = (() => {
    let exams = allEligible.filter(e => getDaysRemaining(e.applicationEnd) >= 0);
    if (filter.level !== "All")    exams = exams.filter(e => e.level === filter.level);
    if (filter.category !== "All") exams = exams.filter(e => e.category === filter.category);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      exams = exams.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    exams.sort((a, b) => {
      if (filter.sort === "deadline")  return (a.applicationEnd||"9999") > (b.applicationEnd||"9999") ? 1 : -1;
      if (filter.sort === "exam")      return (a.examDate||"9999") > (b.examDate||"9999") ? 1 : -1;
      if (filter.sort === "vacancies") return (b.vacancies||0) - (a.vacancies||0);
      return a.name.localeCompare(b.name);
    });
    return exams;
  })();

  return (
    <>
      <style>{GLOBAL_CSS}</style>

      {toast && (
        <div className="fade-up" style={{
          position:"fixed", top:20, right:20, zIndex:999, background:C.surfaceL,
          border:`1.5px solid ${toast.type==="success"?C.green:toast.type==="warn"?C.amber:C.blue}`,
          borderRadius:10, padding:"13px 20px", maxWidth:380, fontSize:14, fontWeight:600,
          color:toast.type==="success"?C.green:toast.type==="warn"?C.amber:C.blue,
          boxShadow:"0 8px 32px rgba(0,0,0,.5)",
        }}>
          {toast.msg}
        </div>
      )}

      {screen === "home"      && <HomeScreen onLogin={()=>setScreen("login")} onRegister={()=>setScreen("register")} user={user} onLogout={handleLogout} onGoSaved={()=>setScreen("saved")} onCheckEligibility={()=>setScreen("profile")} onGoProfile={()=>setScreen("profile")} onGoDashboard={()=>setScreen("dashboard")} onGoAdmin={()=>setScreen("admin")} hasData={!!apiData} />}
      {screen === "login"     && <LoginScreen onLogin={handleLogin} onBack={()=>setScreen("home")} onRegister={()=>setScreen("register")} showToast={showToast} />}
      {screen === "register"  && <RegisterScreen onRegister={handleRegister} onBack={()=>setScreen("login")} onLogin={()=>setScreen("login")} showToast={showToast} />}
      {screen === "profile"   && <ProfileScreen onSubmit={handleProfileSubmit} onBack={()=>setScreen(apiData?"dashboard":"home")} loading={loading} initialProfile={profile} userName={user?.name} />}
      {screen === "dashboard" && (
        <DashboardScreen
          profile={profile} apiData={apiData}
          exams={filteredExams} allEligible={allEligible}
          filter={filter} setFilter={setFilter}
          onExamClick={e=>setSelectedExam(e)}
          onEditProfile={()=>setScreen("profile")}
          apiError={apiError} user={user}
          savedIds={savedIds} onToggleSave={toggleSave}
          onGoSaved={()=>setScreen("saved")} onLogout={handleLogout}
          onLogoClick={()=>setScreen("home")}
        />
      )}
      {screen === "saved" && (
        <SavedScreen
          savedExams={savedExams} savedIds={savedIds} user={user}
          onBack={()=>setScreen(apiData?"dashboard":"home")}
          onExamClick={e=>setSelectedExam(e)}
          onToggleSave={toggleSave} onLogout={handleLogout}
          onLogoClick={()=>setScreen("home")}
        />
      )}
      {screen === "admin" && <AdminDashboard onBack={() => setScreen("home")} />}
      {selectedExam && (
        <ExamModal
          exam={selectedExam} profile={profile}
          isSaved={savedIds.includes(selectedExam.id)}
          onToggleSave={()=>toggleSave(selectedExam)}
          onClose={()=>setSelectedExam(null)}
        />
      )}

      {screen !== "admin" && <StudyChatbot />}
    </>
  );
}

// ─── TOP NAV ──────────────────────────────────────────────────────────────
function TopNav({ user, onLogout, onGoSaved, onLogin, onRegister, rightExtra, onLogoClick }) {
  return (
    <div style={{
      background:C.surface, borderBottom:`1px solid ${C.borderL}`,
      padding:"14px 32px", display:"flex", justifyContent:"space-between", alignItems:"center",
      position:"sticky", top:0, zIndex:50, boxShadow:"0 4px 20px rgba(0,0,0,.4)",
    }}>
      <div onClick={onLogoClick} style={{ display:"flex", alignItems:"center", gap:10, cursor:onLogoClick?"pointer":"default" }}>
        <span style={{ fontSize:20 }}>🏛️</span>
        <span className="font-display" style={{ fontSize:24, fontWeight:700, color:C.text }}>EasyHire</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        {rightExtra}
        {user ? (
          <>
            <button className="btn-ghost" onClick={onGoSaved} style={{ fontSize:13 }}>🔖 Saved</button>
            <div style={{ color:C.textMid, fontSize:13, padding:"0 4px", borderLeft:`1px solid ${C.borderL}`, paddingLeft:12 }}>
              {user.name}
            </div>
            <button className="btn-outline" onClick={onLogout} style={{ fontSize:13, padding:"8px 16px" }}>Log out</button>
          </>
        ) : (
          <>
            <button className="btn-ghost" onClick={onLogin} style={{ fontSize:13 }}>Log in</button>
            <button className="btn-primary" onClick={onRegister} style={{ fontSize:13, padding:"9px 20px" }}>Register</button>
          </>
        )}
      </div>
    </div>
  );
}



// ─── HOME SCREEN ──────────────────────────────────────────────────────────
function HomeScreen({ onLogin, onRegister, user, onLogout, onGoSaved, onCheckEligibility, onGoDashboard, onGoAdmin, hasData }) {
  return (
    <div className="grid-bg" style={{ minHeight:"100vh", display:"flex", flexDirection:"column" }}>
      <TopNav user={user} onLogout={onLogout} onGoSaved={onGoSaved} onLogin={onLogin} onRegister={onRegister} onLogoClick={()=>{}} />

      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", padding:"64px 24px 80px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:"-80px", right:"-80px", width:400, height:400, background:"radial-gradient(circle,rgba(212,168,67,.1) 0%,transparent 70%)", pointerEvents:"none" }} />
        <div style={{ position:"absolute", bottom:"-60px", left:"-60px", width:300, height:300, background:"radial-gradient(circle,rgba(96,165,250,.06) 0%,transparent 70%)", pointerEvents:"none" }} />

        <div className="fade-up" style={{ position:"relative", width:"100%", maxWidth:680, textAlign:"center" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:16 }}>
            <span style={{ fontSize:56 }}>🏛️</span>
            <h1 className="font-display hero-h1" style={{ fontSize:70, lineHeight:1, fontWeight:700, color:C.text, letterSpacing:"-.01em" }}>
              Easy<span style={{ color:C.gold }}>Hire</span>
            </h1>
          </div>
          <h2 className="font-serif hero-h1" style={{ fontSize:28, lineHeight:1.3, fontWeight:600, fontStyle:"italic", color:C.gold, marginBottom:36 }}>
            Your Govt Job, Your Timeline.
          </h2>

          <p style={{ fontSize:17, color:C.textSub, lineHeight:1.85, maxWidth:520, margin:"0 auto 48px" }}>
            Tell us your qualifications once. We find every Central &amp; Kerala state government exam you're eligible for — with live deadlines, an AI-powered Study Assistant, and previous year papers.
          </p>

          {/* ── LOGGED IN ── */}
          {user ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:14 }}>
              <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap" }}>
                {hasData ? (
                  <button className="btn-primary" onClick={onGoDashboard} style={{ fontSize:15, padding:"15px 48px", borderRadius:10 }}>
                    GO TO DASHBOARD →
                  </button>
                ) : (
                  <button className="btn-primary" onClick={onCheckEligibility} style={{ fontSize:15, padding:"15px 48px", borderRadius:10 }}>
                    CHECK MY ELIGIBILITY →
                  </button>
                )}
                <button className="btn-outline" onClick={onGoSaved} style={{ fontSize:15, padding:"15px 28px", borderRadius:10 }}>
                  🔖 My Saved Exams
                </button>
              </div>
              {hasData && (
                <button className="btn-ghost" onClick={onCheckEligibility} style={{ fontSize:13, color:C.textMid }}>
                  ✏️ Update my details
                </button>
              )}
              <div style={{ marginTop:4, padding:"12px 20px", background:C.greenL, border:`1px solid ${C.greenB}`, borderRadius:10, display:"inline-block", fontSize:14, color:C.green }}>
                {"✓"} Logged in as <strong>{user.name}</strong>
              </div>
            </div>
          ) : (
            /* ── GUEST ── */
            <div>
              <div style={{ display:"flex", gap:14, justifyContent:"center", flexWrap:"wrap", marginBottom:20 }}>
                <button className="btn-outline" onClick={onCheckEligibility} style={{ fontSize:15, padding:"15px 36px", borderRadius:10 }}>
                  CHECK ELIGIBILITY
                </button>
                <button className="btn-primary" onClick={onRegister} style={{ fontSize:15, padding:"15px 36px", borderRadius:10 }}>
                  REGISTER FREE →
                </button>
              </div>
              <p style={{ fontSize:13, color:C.textMid }}>
                Already have an account?{" "}
                <button className="btn-ghost" onClick={onLogin} style={{ color:C.gold, fontWeight:700, padding:"0 2px", fontSize:13 }}>Log in</button>
              </p>
            </div>
          )}

          <div style={{ width:80, height:2, background:`linear-gradient(90deg,transparent,${C.gold},transparent)`, margin:"60px auto 0" }} />
          <div style={{ marginTop: 20, textAlign: "center" }}>
            <button className="btn-ghost" onClick={onGoAdmin} style={{ fontSize: 12, color: C.textMid, padding: "4px 8px" }}>
              🛡️ Admin Panel
            </button>
          </div>

          <div style={{ marginTop:52, textAlign:"left" }}>
            <p className="font-display" style={{ fontSize:34, fontWeight:700, color:C.text, marginBottom:44, textAlign:"center" }}>
              Features
            </p>
            <div style={{ display:"flex", flexDirection:"column" }}>
              {[
                { icon:"🎯", label:"Smart Eligibility Matching", desc:"Enter your qualification and reservation category once — we filter every exam you legally qualify for, automatically applying OBC, SC/ST, PwD, and Ex-Servicemen age relaxations." },
                { icon:"⏰", label:"Live Deadline Tracking",     desc:"Every exam shows a live countdown to its application closing date, colour-coded from green to urgent red so you can see at a glance what needs immediate attention." },
                { icon:"🔖", label:"Save Exams to Your Account", desc:"Create a free account to bookmark exams you're interested in. Your saved list is stored securely and accessible every time you log in from any device." },
                { icon:"📚", label:"Study Assistant",            desc:"Practice for UPSC, SSC, IBPS, Kerala PSC and Railway exams with our built-in Study Assistant. Get topic-wise MCQs, instant answer feedback, formula lookups, and full mock tests — all without leaving the page. Click the 📚 button at the bottom-right to start." },
                { icon:"📄", label:"Previous Year Papers",       desc:"Direct links to official previous year question papers and the full syllabus for every exam listed, so you can begin practising from day one." },
              ].map((f, i, arr) => (
                <div key={f.label} style={{ display:"flex", alignItems:"flex-start", gap:22, padding:"28px 0", borderBottom:i<arr.length-1?`1px solid ${C.borderL}`:"none" }}>
                  <div style={{ width:50, height:50, flexShrink:0, background:C.goldL, border:`1.5px solid ${C.goldB}`, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
                    {f.icon}
                  </div>
                  <div style={{ paddingTop:4 }}>
                    <div className="font-display" style={{ fontSize:17, fontWeight:600, color:C.text, marginBottom:8 }}>{f.label}</div>
                    <div style={{ fontSize:14, color:C.textSub, lineHeight:1.8 }}>{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p style={{ marginTop:56, color:C.textMid, fontSize:13 }}>
            Covers Central + Kerala PSC exams · 2025–26 cycle · Updated every 6 hours
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────
function LoginScreen({ onLogin, onBack, onRegister, showToast }) {
  const [form, setForm]       = useState({ email:"", password:"" });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.email || !form.email.includes("@")) e.email = "Valid email required";
    if (!form.password) e.password = "Password required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const data = await apiFetch("/auth/login", {
        method:"POST", body:JSON.stringify({ email:form.email, password:form.password }),
      });
      onLogin(data.token, data.user, data.profile);
    } catch (err) {
      setErrors({ general: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="grid-bg" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 20px" }}>
      <div className="fade-up" style={{ width:"100%", maxWidth:460 }}>
        <button className="btn-outline" onClick={onBack} style={{ marginBottom:28, fontSize:13 }}>← Back</button>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🏛️</div>
          <h2 className="font-display" style={{ fontSize:34, fontWeight:700, color:C.text, marginBottom:8 }}>Welcome back</h2>
          <p style={{ color:C.textSub, fontSize:15 }}>Log in to access your saved exams and profile</p>
        </div>
        <div className="card" style={{ padding:"32px" }}>
          {errors.general && (
            <div style={{ background:C.redL, border:`1px solid ${C.redB}`, borderRadius:8, padding:"11px 14px", marginBottom:20, fontSize:14, color:C.red }}>
              {errors.general}
            </div>
          )}
          <AuthField label="Email Address" error={errors.email}>
            <input className="input" type="email" value={form.email}
              onChange={e=>up("email",e.target.value)} placeholder="your@email.com"
              onKeyDown={e=>e.key==="Enter"&&submit()} />
          </AuthField>
          <AuthField label="Password" error={errors.password}>
            <input className="input" type="password" value={form.password}
              onChange={e=>up("password",e.target.value)} placeholder="Your password"
              onKeyDown={e=>e.key==="Enter"&&submit()} />
          </AuthField>
          <button className="btn-primary" onClick={submit} disabled={loading}
            style={{ width:"100%", fontSize:14, padding:"14px", borderRadius:10, marginTop:8 }}>
            {loading?"Logging in…":"LOG IN →"}
          </button>
          <p style={{ textAlign:"center", marginTop:22, fontSize:14, color:C.textMid }}>
            Don't have an account?{" "}
            <button className="btn-ghost" onClick={onRegister} style={{ color:C.gold, fontWeight:700, padding:"0 4px" }}>Register free</button>
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── REGISTER SCREEN ──────────────────────────────────────────────────────
function RegisterScreen({ onRegister, onBack, onLogin, showToast }) {
  const [form, setForm]       = useState({ name:"", email:"", password:"", confirm:"" });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validate = () => {
    const e = {};
    if (!form.name.trim())                        e.name    = "Name required";
    if (!form.email || !form.email.includes("@")) e.email   = "Valid email required";
    if (form.password.length < 8)                 e.password= "At least 8 characters";
    if (form.password !== form.confirm)           e.confirm = "Passwords don't match";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const data = await apiFetch("/auth/register", {
        method:"POST", body:JSON.stringify({ name:form.name, email:form.email, password:form.password }),
      });
      onRegister(data.token, data.user);
    } catch (err) {
      setErrors({ general: err.message });
    } finally { setLoading(false); }
  };

  return (
    <div className="grid-bg" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 20px" }}>
      <div className="fade-up" style={{ width:"100%", maxWidth:460 }}>
        <button className="btn-outline" onClick={onBack} style={{ marginBottom:28, fontSize:13 }}>← Back</button>
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{ fontSize:32, marginBottom:10 }}>🏛️</div>
          <h2 className="font-display" style={{ fontSize:34, fontWeight:700, color:C.text, marginBottom:8 }}>Create your account</h2>
          <p style={{ color:C.textSub, fontSize:15 }}>Free forever — save exams, sync your profile</p>
        </div>
        <div className="card" style={{ padding:"32px" }}>
          {errors.general && (
            <div style={{ background:C.redL, border:`1px solid ${C.redB}`, borderRadius:8, padding:"11px 14px", marginBottom:20, fontSize:14, color:C.red }}>
              {errors.general}
            </div>
          )}
          <AuthField label="Full Name" error={errors.name}>
            <input className="input" value={form.name} onChange={e=>up("name",e.target.value)} placeholder="Your full name" />
          </AuthField>
          <AuthField label="Email Address" error={errors.email}>
            <input className="input" type="email" value={form.email} onChange={e=>up("email",e.target.value)} placeholder="your@email.com" />
          </AuthField>
          <AuthField label="Password" error={errors.password}>
            <input className="input" type="password" value={form.password} onChange={e=>up("password",e.target.value)} placeholder="At least 8 characters" />
          </AuthField>
          <AuthField label="Confirm Password" error={errors.confirm}>
            <input className="input" type="password" value={form.confirm} onChange={e=>up("confirm",e.target.value)}
              placeholder="Repeat your password" onKeyDown={e=>e.key==="Enter"&&submit()} />
          </AuthField>
          <p style={{ fontSize:12, color:C.textMid, marginBottom:20, lineHeight:1.6 }}>
            By registering you agree to our terms. Your data is stored locally on the EasyHire server and is not shared with third parties.
          </p>
          <button className="btn-primary" onClick={submit} disabled={loading}
            style={{ width:"100%", fontSize:14, padding:"14px", borderRadius:10 }}>
            {loading?"Creating account…":"CREATE ACCOUNT →"}
          </button>
          <p style={{ textAlign:"center", marginTop:22, fontSize:14, color:C.textMid }}>
            Already have an account?{" "}
            <button className="btn-ghost" onClick={onLogin} style={{ color:C.gold, fontWeight:700, padding:"0 4px" }}>Log in</button>
          </p>
        </div>
      </div>
    </div>
  );
}

function AuthField({ label, error, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:7, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase" }}>
        {label}
        {error && <span style={{ color:C.red, marginLeft:8, fontSize:12, textTransform:"none", letterSpacing:0, fontWeight:500 }}>{error}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── PROFILE SCREEN ───────────────────────────────────────────────────────
function ProfileScreen({ onSubmit, onBack, loading, initialProfile, userName }) {
  const [form, setForm] = useState({
    dob:"", gender:"", qualification:"", percentage:"",
    category:"", stream:"", preferredLevel:"Both",
    ...initialProfile,
  });
  const [errors, setErrors] = useState({});
  const up = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const calcAge = (dob) => {
    if (!dob) return 0;
    const b=new Date(dob), t=new Date();
    let a=t.getFullYear()-b.getFullYear();
    if((t.getMonth()-b.getMonth()||t.getDate()-b.getDate())<0) a--;
    return a;
  };

  const validate = () => {
    const e = {};
    if (!form.dob) e.dob = "Required";
    else {
      const age = calcAge(form.dob);
      if (age < 14) e.dob = "Must be at least 14";
      if (age > 65) e.dob = "Enter a valid date";
    }
    if (!form.qualification) e.qualification = "Required";
    if (!form.category)      e.category      = "Required";
    if (!form.gender)        e.gender        = "Required";
    setErrors(e);
    return !Object.keys(e).length;
  };

  const age = form.dob ? calcAge(form.dob) : null;

  return (
    <div className="grid-bg" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 20px" }}>
      <div className="fade-up" style={{ width:"100%", maxWidth:580 }}>
        <button className="btn-outline" onClick={onBack} style={{ marginBottom:28, fontSize:13 }}>← Back</button>
        {userName && (
          <div style={{ marginBottom:12, fontSize:14, color:C.textMid }}>
            Filling profile for <strong style={{ color:C.gold }}>{userName}</strong>
          </div>
        )}
        <h2 className="font-display" style={{ fontSize:34, fontWeight:700, color:C.text, marginBottom:8 }}>Your Profile</h2>
        <p style={{ color:C.textSub, fontSize:15, marginBottom:32, lineHeight:1.7 }}>
          Fill in your details — we'll match every exam you qualify for.
        </p>
        <div className="card" style={{ padding:"32px" }}>
          <div className="two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            <Field label={`Date of Birth${age!==null?`  (${age} yrs)`:""}`} error={errors.dob}>
              <input type="date" className="input" value={form.dob||""}
                onChange={e=>up("dob",e.target.value)}
                max={new Date().toISOString().split("T")[0]} />
            </Field>
            <Field label="Gender" error={errors.gender}>
              <select className="input" value={form.gender||""} onChange={e=>up("gender",e.target.value)}>
                <option value="" disabled>Select gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other / Not specified</option>
              </select>
            </Field>
          </div>

          <Field label="Highest Qualification" error={errors.qualification}>
            <select className="input" value={form.qualification||""} onChange={e=>up("qualification",e.target.value)}>
              <option value="" disabled>Select qualification</option>
              <option value="10th">SSLC (10th Pass)</option>
              <option value="12th">Plus Two (12th Pass / HSC)</option>
              <option value="iti">ITI</option>
              <option value="diploma">Diploma</option>
              <option value="graduation">UG (Bachelor's Degree)</option>
              <option value="post-graduation">PG (Master's Degree)</option>
              <option value="phd">PhD / Doctorate</option>
            </select>
          </Field>

          <div className="two-col" style={{ display:"grid", gridTemplateColumns:form.qualification?.startsWith("10th")?"1fr":"1fr 1fr", gap:16, marginBottom:20 }}>
            <Field label="Percentage / CGPA (optional)">
              <input type="number" className="input" min="0" max="100"
                value={form.percentage||""} onChange={e=>up("percentage",e.target.value)}
                placeholder="e.g. 72.5" />
            </Field>
            {!form.qualification?.startsWith("10th") && (
              <Field label="Stream / Subject">
                <select className="input" value={form.stream||""} onChange={e=>up("stream",e.target.value)}>
                  <option value="">Select stream (optional)</option>
                  {["Science","Commerce","Arts / Humanities","Engineering","Medicine","Law","Education / B.Ed","Agriculture","Computer Science / IT","Other"].map(s=><option key={s}>{s}</option>)}
                </select>
              </Field>
            )}
          </div>

          <Field label="Reservation Category" error={errors.category}>
            <select className="input" value={form.category||""} onChange={e=>up("category",e.target.value)}>
              <option value="" disabled>Select category</option>
              <option value="General">General / Unreserved</option>
              <option value="OBC">OBC (Other Backward Class)</option>
              <option value="SC_ST">SC / ST</option>
              <option value="EWS">EWS (Economically Weaker Section)</option>
              <option value="PwD">PwD (Persons with Disability)</option>
              <option value="Ex-Servicemen">Ex-Servicemen</option>
            </select>
          </Field>

          <div style={{ marginBottom:28 }}>
            <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:10, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase" }}>
              Preferred Job Level
            </label>
            <div style={{ display:"flex", gap:10 }}>
              {[["Both","🇮🇳 Both"],["Central","🏛️ Central"],["Kerala","🌴 Kerala"]].map(([val,lbl])=>(
                <button key={val} onClick={()=>up("preferredLevel",val)} style={{
                  flex:1, padding:"11px 8px", borderRadius:8,
                  border:`1.5px solid ${form.preferredLevel===val?C.gold:C.border}`,
                  background:form.preferredLevel===val?C.goldL:"transparent",
                  color:form.preferredLevel===val?C.gold:C.textSub,
                  cursor:"pointer", fontSize:14, fontWeight:600, fontFamily:"'Lato',sans-serif", transition:".2s",
                }}>{lbl}</button>
              ))}
            </div>
          </div>

          <button className="btn-primary" onClick={()=>validate()&&onSubmit(form)} disabled={loading}
            style={{ width:"100%", fontSize:14, padding:"14px", borderRadius:10 }}>
            {loading?"Finding your exams…":"FIND MY ELIGIBLE EXAMS →"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom:20 }}>
      <label style={{ display:"block", fontSize:12, color:C.textSub, marginBottom:7, fontWeight:700, letterSpacing:".05em", textTransform:"uppercase" }}>
        {label}
        {error && <span style={{ color:C.red, marginLeft:8, fontSize:12, textTransform:"none", letterSpacing:0, fontWeight:500 }}>{error}</span>}
      </label>
      {children}
    </div>
  );
}

// ─── SAVED SCREEN ─────────────────────────────────────────────────────────
function SavedScreen({ savedExams, savedIds, user, onBack, onExamClick, onToggleSave, onLogout, onLogoClick }) {
  return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      <TopNav user={user} onLogout={onLogout} onGoSaved={()=>{}} onLogoClick={onLogoClick} />
      <div style={{ maxWidth:1140, margin:"0 auto", padding:"32px 24px" }}>
        <button className="btn-outline" onClick={onBack} style={{ marginBottom:28, fontSize:13 }}>← Back</button>
        <h2 className="font-display" style={{ fontSize:32, fontWeight:700, color:C.text, marginBottom:6 }}>🔖 Saved Exams</h2>
        <p style={{ color:C.textSub, fontSize:15, marginBottom:32 }}>
          {savedExams.length>0
            ?`You have ${savedExams.length} exam${savedExams.length>1?"s":""} saved.`
            :"You haven't saved any exams yet. Go to your dashboard and click the 🔖 icon on any exam card."}
        </p>
        {savedExams.length>0&&(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
            {savedExams.map(exam=>(
              <ExamCard key={exam.id} exam={exam} onClick={onExamClick}
                isSaved={savedIds.includes(exam.id)} onToggleSave={onToggleSave} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────
function DashboardScreen({ profile, apiData, exams, allEligible, filter, setFilter, onExamClick, onEditProfile, apiError, user, savedIds, onToggleSave, onGoSaved, onLogout, onLogoClick }) {

  const calcAge = dob=>{if(!dob)return"?";const b=new Date(dob),t=new Date();let a=t.getFullYear()-b.getFullYear();if((t.getMonth()-b.getMonth()||t.getDate()-b.getDate())<0)a--;return a;};
  const age = profile?calcAge(profile.dob):"?";
  const urgentExams = allEligible.filter(e=>{ const d=getDaysRemaining(e.applicationEnd); return d>=0&&d<=7; });
  const categories = ["All",...new Set(allEligible.map(e=>e.category))];
  const stats = { total: exams.length, urgent: exams.filter(e=>getDaysRemaining(e.applicationEnd)<=7&&getDaysRemaining(e.applicationEnd)>=0).length, central: exams.filter(e=>e.level==="Central").length, kerala: exams.filter(e=>e.level==="Kerala").length };

  return (
    <div style={{ background:C.bg, minHeight:"100vh" }}>
      <TopNav user={user} onLogout={onLogout} onGoSaved={onGoSaved} onLogoClick={onLogoClick}
        rightExtra={
          <div style={{ display:"flex", alignItems:"center", gap:10, marginRight:8 }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{profile?.name||user?.name||"Candidate"}</div>
              <div style={{ fontSize:11, color:C.textMid }}>{age} yrs · {profile?.qualification} · {profile?.category}</div>
            </div>
            <button className="btn-outline" onClick={onEditProfile} style={{ fontSize:12, padding:"7px 14px" }}>✏️ Edit</button>
          </div>
        }
      />
      <div style={{ maxWidth:1140, margin:"0 auto", padding:"32px 24px" }}>

        {apiError && (
          <div style={{ background:C.redL, border:`1.5px solid ${C.red}44`, borderRadius:10, padding:"16px 20px", marginBottom:24 }}>
            <div style={{ fontSize:15, fontWeight:700, color:C.red, marginBottom:4 }}>⚠️ Backend Error</div>
            <div style={{ fontSize:13, color:C.textSub, lineHeight:1.6 }}>{apiError}</div>
            <div style={{ fontSize:12, color:C.textMid, marginTop:8 }}>
              Make sure Python is running: <code style={{ background:C.surfaceL, padding:"2px 8px", borderRadius:4, color:C.amber }}>python app.py</code>
            </div>
          </div>
        )}

        {urgentExams.length>0&&(
          <div className="fade-up" style={{ background:C.redL, border:`1.5px solid ${C.red}44`, borderRadius:12, padding:"14px 20px", marginBottom:28, display:"flex", alignItems:"center", gap:12 }}>
            <span style={{ fontSize:20 }}>🚨</span>
            <span style={{ color:C.red, fontWeight:700, fontSize:15 }}>{urgentExams.length} exam{urgentExams.length>1?"s":""} closing within 7 days!</span>
            <span style={{ color:C.textMid, fontSize:13 }}>Apply immediately.</span>
          </div>
        )}

        <div className="stats-4" style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:32 }}>
          {[
            {icon:"🎯",val:exams.length,label:"Total Eligible",color:C.gold},
            {icon:"🔥",val:stats.urgent,label:"Closing Soon",color:C.red},
            {icon:"🏛️",val:stats.central,label:"Central Govt",color:C.blue},
            {icon:"🌴",val:stats.kerala,label:"Kerala PSC",color:C.green},
          ].map(s=>(
            <div key={s.label} className="stat-tile">
              <div style={{ fontSize:24, marginBottom:6 }}>{s.icon}</div>
              <div className="font-display" style={{ fontSize:38, fontWeight:700, color:s.color, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:12, color:C.textMid, marginTop:5, fontWeight:600 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ marginBottom:24, padding:"20px" }}>
          <div style={{ display:"flex", gap:10, marginBottom:14, flexWrap:"wrap" }}>
            <input className="input" placeholder="Search exams, bodies, tags…" style={{ flex:1, minWidth:200, padding:"10px 14px", fontSize:14 }}
              value={filter.search} onChange={e=>setFilter(f=>({...f,search:e.target.value}))} />
            <select className="input" style={{ width:"auto", padding:"10px 14px", fontSize:14 }}
              value={filter.sort} onChange={e=>setFilter(f=>({...f,sort:e.target.value}))}>
              <option value="deadline">Sort: Application Deadline</option>
              <option value="exam">Sort: Exam Date</option>
              <option value="vacancies">Sort: Most Vacancies</option>
              <option value="name">Sort: Name A–Z</option>
            </select>
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:10 }}>
            {["All","Central","Kerala"].map(l=>(
              <button key={l} className={`pill ${filter.level===l?"active":""}`} onClick={()=>setFilter(f=>({...f,level:l}))}>
                {l==="All"?"All Levels":l==="Central"?"🏛️ Central":"🌴 Kerala PSC"}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {categories.map(c=>(
              <button key={c} className={`pill ${filter.category===c?"active":""}`} onClick={()=>setFilter(f=>({...f,category:c}))}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:18, color:C.textMid, fontSize:14 }}>
          Showing <strong style={{ color:C.text }}>{exams.length}</strong> exams
          {(filter.category!=="All"||filter.level!=="All"||filter.search)&&` (filtered from ${allEligible.length})`}
          {savedIds.length>0&&<span style={{ marginLeft:16, color:C.gold }}>🔖 {savedIds.length} saved</span>}
        </div>

        {exams.length===0?(
          <div style={{ textAlign:"center", padding:"64px 20px" }}>
            <div style={{ fontSize:44, marginBottom:14 }}>🔍</div>
            <div className="font-display" style={{ fontSize:20, marginBottom:8, color:C.textSub }}>No exams match your filters</div>
            <div style={{ fontSize:14, color:C.textMid }}>Try clearing the search or changing the category</div>
          </div>
        ):(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:16 }}>
            {exams.map(exam=>(
              <ExamCard key={exam.id} exam={exam} onClick={onExamClick}
                isSaved={savedIds.includes(exam.id)} onToggleSave={onToggleSave} />
            ))}
          </div>
        )}

        <div style={{ textAlign:"center", marginTop:60, color:C.textDim, fontSize:12 }}>
          EasyHire · Always verify details at official websites before applying
        </div>
      </div>
    </div>
  );
}

// ─── EXAM CARD ────────────────────────────────────────────────────────────
function ExamCard({ exam, onClick, isSaved, onToggleSave }) {
  const dl = getDeadlineStatus(exam.applicationEnd);
  const daysToExam = getDaysRemaining(exam.examDate);

  return (
    <div className="card" style={{ display:"flex", flexDirection:"column", transition:"all .25s", position:"relative", overflow:"hidden" }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:`linear-gradient(90deg,${C.gold},#b8902a)`, opacity:0, transition:"opacity .2s" }}
        onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0} />

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
        <span className="badge" style={{ background:exam.level==="Kerala"?C.greenL:C.blueL, color:exam.level==="Kerala"?C.green:C.blue, border:`1px solid ${exam.level==="Kerala"?C.greenB:C.blueB}` }}>
          {exam.level==="Kerala"?"🌴 Kerala PSC":"🏛️ Central"}
        </span>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <button onClick={e=>{e.stopPropagation();onToggleSave(exam)}} title={isSaved?"Remove from saved":"Save exam"}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, lineHeight:1, color:isSaved?C.gold:C.textDim, transition:"color .2s", padding:"2px 4px" }}>
            🔖
          </button>
          <span className="badge" style={{ background:dl.bg, color:dl.color, border:`1px solid ${dl.color}44` }}>{dl.label}</span>
        </div>
      </div>

      <div onClick={()=>onClick(exam)} style={{ flex:1, cursor:"pointer" }}>
        <h3 className="font-display" style={{ fontSize:15, fontWeight:600, lineHeight:1.45, marginBottom:8, color:C.text }}>{exam.name}</h3>
        <p style={{ fontSize:13, color:C.textSub, marginBottom:16, lineHeight:1.65 }}>
          {(exam.description||"").substring(0,95)}{(exam.description||"").length>95?"…":""}
        </p>
        <div style={{ display:"flex", gap:20, marginBottom:16, paddingTop:12, borderTop:`1px solid ${C.borderL}` }}>
          <div>
            <div style={{ fontSize:10, color:C.textMid, fontWeight:700, letterSpacing:".06em", marginBottom:3 }}>VACANCIES</div>
            <div style={{ fontSize:15, fontWeight:700, color:C.green }}>{exam.vacancies?exam.vacancies.toLocaleString("en-IN"):"TBA"}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:C.textMid, fontWeight:700, letterSpacing:".06em", marginBottom:3 }}>APPLY BY</div>
            <div style={{ fontSize:13, fontWeight:600, color:C.text }}>{formatDate(exam.applicationEnd)}</div>
          </div>
          <div>
            <div style={{ fontSize:10, color:C.textMid, fontWeight:700, letterSpacing:".06em", marginBottom:3 }}>EXAM DATE</div>
            <div style={{ fontSize:13, fontWeight:600, color:daysToExam>0?C.blue:C.textMid }}>{formatDate(exam.examDate)}</div>
          </div>
        </div>
        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
          <span className="badge" style={{ background:C.goldL, color:C.gold, border:`1px solid ${C.goldB}`, fontSize:11 }}>{exam.body}</span>
          <span className="badge" style={{ background:C.surfaceL, color:C.textSub, fontSize:11 }}>{exam.category}</span>
          {(exam.tags||[]).slice(0,2).map(t=>(
            <span key={t} className="badge" style={{ background:C.surfaceL, color:C.textMid, fontSize:11 }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── EXAM MODAL ───────────────────────────────────────────────────────────
function ExamModal({ exam, profile, onClose, isSaved, onToggleSave }) {
  const dl = getDeadlineStatus(exam.applicationEnd);
  const daysToExam   = getDaysRemaining(exam.examDate);
  const catRelax     = profile?.category&&exam.ageRelaxation?.[profile.category];
  const effectiveMax = (exam.maxAge||99)+(catRelax||0);

  const calcAge = dob=>{if(!dob)return 0;const b=new Date(dob),t=new Date();let a=t.getFullYear()-b.getFullYear();if((t.getMonth()-b.getMonth()||t.getDate()-b.getDate())<0)a--;return a;};

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box fade-up" onClick={e=>e.stopPropagation()}>
        <div style={{ padding:"28px 28px 20px", borderBottom:`1px solid ${C.borderL}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <span className="badge" style={{ background:exam.level==="Kerala"?C.greenL:C.blueL, color:exam.level==="Kerala"?C.green:C.blue, border:`1px solid ${exam.level==="Kerala"?C.greenB:C.blueB}` }}>
                {exam.level==="Kerala"?"🌴 Kerala PSC":"🏛️ Central Govt"}
              </span>
              <span className="badge" style={{ background:C.surfaceL, color:C.textSub }}>{exam.category}</span>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <button onClick={onToggleSave} style={{ background:"none", border:`1.5px solid ${isSaved?C.gold:C.border}`, borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:13, fontWeight:700, color:isSaved?C.gold:C.textMid, transition:".2s" }}>
                {isSaved?"🔖 Saved":"🔖 Save"}
              </button>
              <button onClick={onClose} style={{ background:"none", border:"none", color:C.textMid, fontSize:22, cursor:"pointer", lineHeight:1 }}>✕</button>
            </div>
          </div>
          <h2 className="font-display" style={{ fontSize:21, fontWeight:700, lineHeight:1.4, marginBottom:10, color:C.text }}>{exam.name}</h2>
          <p style={{ color:C.textSub, fontSize:14, lineHeight:1.8 }}>{exam.description}</p>
        </div>

        <div style={{ padding:"24px 28px", overflowY:"auto", maxHeight:"72vh" }}>
          <div style={{ background:dl.bg, border:`1.5px solid ${dl.color}44`, borderRadius:10, padding:"14px 20px", marginBottom:24, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11, color:dl.color, marginBottom:3, fontWeight:700, letterSpacing:".07em" }}>APPLICATION DEADLINE</div>
              <div className="font-display" style={{ fontSize:20, fontWeight:700, color:dl.color }}>{formatDate(exam.applicationEnd)}</div>
            </div>
            <div className="font-display" style={{ fontSize:30, fontWeight:700, color:dl.color }}>{dl.label}</div>
          </div>

          <div className="two-col" style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:24 }}>
            {[
              {l:"Conducting Body",v:exam.body},
              {l:"Vacancies",v:exam.vacancies?exam.vacancies.toLocaleString("en-IN"):"TBA",c:C.green},
              {l:"Pay Scale",v:exam.salary||"As per norms",small:true},
              {l:"Notification",v:formatDate(exam.notificationDate)},
              {l:"Exam Date",v:formatDate(exam.examDate)},
              {l:"Age Limit",v:`${exam.minAge}–${effectiveMax} yrs${catRelax?` (+${catRelax} relaxed)`:""}`,small:true},
            ].map(item=>(
              <div key={item.l} style={{ background:C.bg, borderRadius:8, padding:"14px", border:`1px solid ${C.borderL}` }}>
                <div style={{ fontSize:10, color:C.textMid, marginBottom:5, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase" }}>{item.l}</div>
                <div style={{ fontSize:item.small?12:14, fontWeight:700, color:item.c||C.text, lineHeight:1.4 }}>{item.v}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom:22 }}>
            <h4 style={{ fontSize:11, color:C.textMid, marginBottom:10, textTransform:"uppercase", letterSpacing:".08em", fontWeight:700 }}>Subjects / Papers</h4>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {(exam.subjects||["As per notification"]).map(s=>(
                <span key={s} className="badge" style={{ background:C.blueL, color:C.blue, fontSize:13, padding:"6px 12px", border:`1px solid ${C.blueB}` }}>{s}</span>
              ))}
            </div>
          </div>

          {Object.keys(exam.ageRelaxation||{}).length>0&&(
            <div style={{ background:C.bg, borderRadius:10, padding:16, marginBottom:22, border:`1px solid ${C.borderL}` }}>
              <h4 style={{ fontSize:11, color:C.textMid, marginBottom:10, textTransform:"uppercase", letterSpacing:".08em", fontWeight:700 }}>Age Relaxations</h4>
              <div style={{ display:"flex", gap:20, flexWrap:"wrap" }}>
                {Object.entries(exam.ageRelaxation).map(([cat,yrs])=>(
                  <div key={cat} style={{ display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ fontSize:13, color:C.textSub }}>{cat.replace("_","/")}</span>
                    <span style={{ fontSize:13, color:C.amber, fontWeight:700 }}>{`+${yrs} yrs`}</span>
                    {profile?.category===cat&&<span style={{ color:C.green, fontSize:11, fontWeight:700 }}>{"✓"} yours</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:22 }}>
            <a href={exam.officialLink} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:140, background:`linear-gradient(135deg,${C.gold},#b8902a)`, color:"#0a0a0f", borderRadius:8, padding:"12px 20px", fontSize:14, fontWeight:700, textAlign:"center", textDecoration:"none" }}>Apply Now →</a>
            <a href={exam.previousPapers} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:140, background:C.blueL, color:C.blue, border:`1.5px solid ${C.blueB}`, borderRadius:8, padding:"12px 20px", fontSize:14, fontWeight:700, textAlign:"center", textDecoration:"none" }}>📄 Previous Papers</a>
            <a href={exam.syllabus} target="_blank" rel="noreferrer" style={{ flex:1, minWidth:140, background:C.greenL, color:C.green, border:`1.5px solid ${C.greenB}`, borderRadius:8, padding:"12px 20px", fontSize:14, fontWeight:700, textAlign:"center", textDecoration:"none" }}>📚 Syllabus</a>
          </div>
        </div>
      </div>
    </div>
  );
}
