import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Constants ──────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const GFIT_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GFIT_SCOPE = "https://www.googleapis.com/auth/fitness.activity.read";

// ── Supabase client ────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Google Fit helpers ─────────────────────────────────────
function gGetToken() {
  try { return localStorage.getItem("gfit_token") || ""; } catch { return ""; }
}
function gSetToken(t) {
  try { localStorage.setItem("gfit_token", t); } catch {}
}
async function gFetchSteps(token) {
  try {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const res = await fetch("https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        aggregateBy: [{ dataTypeName: "com.google.step_count.delta" }],
        bucketByTime: { durationMillis: 86400000 },
        startTimeMillis: start.getTime(),
        endTimeMillis: Date.now(),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    let steps = 0;
    data.bucket?.forEach(b => b.dataset?.forEach(ds => ds.point?.forEach(p => p.value?.forEach(v => { steps += v.intVal || 0; }))));
    return steps;
  } catch { return null; }
}

// ── Static data ────────────────────────────────────────────
const DEFAULT_ACTIVITIES = [
  { id: 1, name: "Workout", score: 3, icon: "🏋️", type: "toggle" },
  { id: 2, name: "Run", score: 3, icon: "🏃", type: "toggle" },
  { id: 3, name: "Cook a meal", score: 2, icon: "🍳", type: "counter" },
  { id: 4, name: "Read a chapter", score: 1, icon: "📖", type: "counter" },
  { id: 5, name: "Take supplements", score: 1, icon: "💊", type: "toggle" },
  { id: 6, name: "Eat Nuts", score: 1, icon: "🥜", type: "toggle" },
  { id: 7, name: "Soak chia", score: 1, icon: "🌱", type: "toggle" },
  { id: 8, name: "Code", score: 5, icon: "💻", type: "toggle" },
  { id: 9, name: "Laundry", score: 2, icon: "👕", type: "toggle" },
  { id: 10, name: "Broom", score: 1, icon: "🧹", type: "toggle" },
  { id: 11, name: "Mop", score: 3, icon: "🫧", type: "toggle" },
];
const ICONS = ["🏋️","🏃","🍳","📖","💊","🥜","🌱","💻","👕","🧹","🫧","🎯","🧘","🚴","🎸","✍️","🛁","🌿","🍎","💤","🛒","📦","🏥","📝","🔧","🚗","📞","💈","🎁","🏦"];

// ── Helpers ────────────────────────────────────────────────
// IST = UTC+5:30
const toKey = d => {
  const ist = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
  return ist.toISOString().split("T")[0];
};
const todayKey = toKey(new Date());

function getMotivation(score, max) {
  const pct = max === 0 ? 0 : (score / max) * 100;
  if (pct === 0) return { msg: "Let's get started! 💪", color: "#94a3b8" };
  if (pct < 30) return { msg: "Warming up...", color: "#f97316" };
  if (pct < 60) return { msg: "Good momentum! 🔥", color: "#eab308" };
  if (pct < 90) return { msg: "Crushing it! ⚡", color: "#22c55e" };
  return { msg: "Perfect day! 🌟", color: "#a855f7" };
}

// ── Component ──────────────────────────────────────────────
export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [statsPeriod, setStatsPeriod] = useState("week");

  // data
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState({});
  const [tasks, setTasks] = useState([]);
  const [claimed, setClaimed] = useState(0);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [rewardThreshold, setRewardThreshold] = useState(25);
  const [showRewardPanel, setShowRewardPanel] = useState(false);
  const [historyDate, setHistoryDate] = useState(todayKey);

  // google fit
  const [gToken, setGToken] = useState("");
  const [steps, setSteps] = useState(0);
  const [stepsLoading, setStepsLoading] = useState(false);

  // form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formMode, setFormMode] = useState("activity");
  const [newName, setNewName] = useState("");
  const [newScore, setNewScore] = useState(1);
  const [newIcon, setNewIcon] = useState("🎯");
  const [newType, setNewType] = useState("toggle");
  const [editingId, setEditingId] = useState(null);

  // ── Boot ──
  useEffect(() => {
    // handle OAuth redirect
    const hash = window.location.hash;
    if (hash && hash.includes("access_token")) {
      try {
        const p = new URLSearchParams(hash.replace(/^#/, ""));
        const tok = p.get("access_token");
        if (tok) { gSetToken(tok); setGToken(tok); }
      } catch {}
      window.history.replaceState(null, "", window.location.pathname);
    } else {
      const saved = gGetToken();
      if (saved) setGToken(saved);
    }
    loadAll();
  }, []);

  useEffect(() => {
    if (gToken) {
      setStepsLoading(true);
      gFetchSteps(gToken).then(async s => {
        if (s === null) { gSetToken(""); setGToken(""); }
        else {
          setSteps(s);
          // persist steps score into today's log so cumulative is accurate
          setLogs(prev => {
            const log = { ...(prev[todayKey] || {}), __steps: s };
            supabase.from("logs").upsert({ date: todayKey, data: log });
            return { ...prev, [todayKey]: log };
          });
        }
        setStepsLoading(false);
      });
    }
  }, [gToken]);

  // ── Supabase load ──
  async function loadAll() {
    setLoading(true);
    try {
      const [{ data: acts }, { data: lgArr }, { data: tks }, { data: sets }] = await Promise.all([
        supabase.from("activities").select("*"),
        supabase.from("logs").select("*"),
        supabase.from("tasks").select("*"),
        supabase.from("settings").select("*"),
      ]);
      if (acts && acts.length > 0) setActivities(acts);
      else {
        await supabase.from("activities").insert(DEFAULT_ACTIVITIES);
        setActivities(DEFAULT_ACTIVITIES);
      }
      if (lgArr) {
        const m = {};
        lgArr.forEach(r => { m[r.date] = r.data; });
        setLogs(m);
      }
      if (tks) setTasks(tks);
      if (sets) {
        sets.forEach(r => {
          if (r.key === "claimed") setClaimed(parseInt(r.value) || 0);
          if (r.key === "reward_threshold") setRewardThreshold(parseInt(r.value) || 25);
          if (r.key === "reward_history") { try { setRewardHistory(JSON.parse(r.value) || []); } catch {} }
        });
      }
    } catch (e) { console.error("Load error", e); }
    setLoading(false);
  }

  async function saveSetting(key, value) {
    await supabase.from("settings").upsert({ key, value: String(value) });
  }

  // ── Log helpers ──
  function getLogValue(log, a) {
    if (!log) return a.type === "counter" ? 0 : false;
    const v = log[a.id];
    return a.type === "counter" ? (typeof v === "number" ? v : 0) : !!v;
  }

  async function updateLog(dateKey, newLog) {
    setLogs(prev => ({ ...prev, [dateKey]: newLog }));
    await supabase.from("logs").upsert({ date: dateKey, data: newLog });
  }

  const todayLog = logs[todayKey] || {};

  async function toggleActivity(a) {
    await updateLog(todayKey, { ...todayLog, [a.id]: !todayLog[a.id] });
  }
  async function changeCount(a, delta) {
    const cur = typeof todayLog[a.id] === "number" ? todayLog[a.id] : 0;
    await updateLog(todayKey, { ...todayLog, [a.id]: Math.max(0, cur + delta) });
  }

  // ── Scores ──
  const stepsScore = Math.floor(steps / 1000);
  const maxScore = activities.reduce((s, a) => s + a.score, 0);
  const todayActivityScore = activities.reduce((s, a) => {
    const v = getLogValue(todayLog, a);
    return s + (a.type === "counter" ? v * a.score : v ? a.score : 0);
  }, 0) + stepsScore;
  const pendingTasks = tasks.filter(t => !t.done);
  const todayDoneTasks = tasks.filter(t => t.done && t.done_at === todayKey);
  const todayTaskScore = todayDoneTasks.reduce((s, t) => s + t.score, 0);
  const todayScore = todayActivityScore + todayTaskScore;
  const { msg, color } = getMotivation(todayScore, maxScore);

  const totalEverScore = Object.entries(logs).reduce((tot, [dk, log]) => {
    const actScore = activities.reduce((s, a) => {
      const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0);
      return s + v * a.score;
    }, 0);
    // for today use live stepsScore, for past days read persisted __steps
    const stepPts = dk === todayKey ? 0 : Math.floor((log.__steps || 0) / 1000);
    return tot + actScore + stepPts;
  }, 0) + stepsScore + tasks.filter(t => t.done).reduce((s, t) => s + t.score, 0);
  const netScore = totalEverScore - claimed;
  const canClaim = netScore >= rewardThreshold;

  async function claimReward() {
    if (!canClaim) return;
    const nc = claimed + rewardThreshold;
    const nh = [...rewardHistory, { date: todayKey, pts: rewardThreshold, id: Date.now() }];
    setClaimed(nc); setRewardHistory(nh);
    await Promise.all([saveSetting("claimed", nc), saveSetting("reward_history", JSON.stringify(nh))]);
  }
  async function updateThreshold(val) {
    setRewardThreshold(val); await saveSetting("reward_threshold", val);
  }

  // ── Tasks ──
  async function completeTask(id) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true, done_at: todayKey } : t));
    await supabase.from("tasks").update({ done: true, done_at: todayKey }).eq("id", id);
  }
  async function deleteTask(id) {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  }

  // ── Activities CRUD ──
  function resetForm() { setNewName(""); setNewScore(1); setNewIcon("🎯"); setNewType("toggle"); setEditingId(null); }

  async function addItem() {
    if (!newName.trim()) return;
    if (formMode === "task") {
      const task = { id: Date.now(), name: newName.trim(), score: newScore, icon: newIcon, done: false, created_at: todayKey, done_at: null };
      setTasks(prev => [...prev, task]);
      await supabase.from("tasks").insert(task);
    } else {
      if (editingId !== null) {
        const upd = { name: newName.trim(), score: newScore, icon: newIcon, type: newType };
        setActivities(prev => prev.map(a => a.id === editingId ? { ...a, ...upd } : a));
        await supabase.from("activities").update(upd).eq("id", editingId);
      } else {
        const act = { id: Date.now(), name: newName.trim(), score: newScore, icon: newIcon, type: newType };
        setActivities(prev => [...prev, act]);
        await supabase.from("activities").insert(act);
      }
    }
    resetForm(); setShowAddForm(false);
  }
  async function deleteActivity(id) {
    setActivities(prev => prev.filter(a => a.id !== id));
    await supabase.from("activities").delete().eq("id", id);
  }
  function startEdit(a) { setEditingId(a.id); setNewName(a.name); setNewScore(a.score); setNewIcon(a.icon); setNewType(a.type || "toggle"); setFormMode("activity"); setShowAddForm(true); }

  function loginGoogle() {
    const p = new URLSearchParams({ client_id: GFIT_CLIENT_ID, redirect_uri: window.location.origin, response_type: "token", scope: GFIT_SCOPE });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
  }

  // ── History ──
  const histLog = logs[historyDate] || {};
  const histDoneActivities = activities.filter(a => { const v = getLogValue(histLog, a); return a.type === "counter" ? v > 0 : v; });
  const histDoneTasks = tasks.filter(t => t.done && t.done_at === historyDate);
  const histScore = histDoneActivities.reduce((s, a) => { const v = getLogValue(histLog, a); return s + (a.type === "counter" ? v * a.score : a.score); }, 0) + histDoneTasks.reduce((s, t) => s + t.score, 0);

  // ── Stats ──
  const statsDays = Array.from({ length: statsPeriod === "week" ? 7 : 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - ((statsPeriod === "week" ? 7 : 30) - 1 - i)); return toKey(d);
  });
  const statsDayCount = statsDays.length;
  const activityStats = activities.map(a => {
    let totalCount = 0, totalPts = 0, daysActive = 0;
    statsDays.forEach(dk => {
      const log = logs[dk] || {};
      const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0);
      if (v > 0) { daysActive++; totalCount += v; totalPts += v * a.score; }
    });
    return { ...a, totalCount, totalPts, daysActive, completionRate: Math.round((daysActive / statsDayCount) * 100) };
  }).sort((a, b) => b.totalPts - a.totalPts);
  const dailyScores = statsDays.map(dk => {
    const log = logs[dk] || {};
    const score = activities.reduce((s, a) => { const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0); return s + v * a.score; }, 0)
      + tasks.filter(t => t.done && t.done_at === dk).reduce((s, t) => s + t.score, 0);
    return { date: dk, score, label: new Date(dk + "T00:00:00").toLocaleDateString("en-IN", statsPeriod === "week" ? { weekday: "short" } : { day: "numeric" }) };
  });
  const maxDailyScore = Math.max(...dailyScores.map(d => d.score), 1);
  const maxActivityPts = Math.max(...activityStats.map(a => a.totalPts), 1);

  // ── Styles ──
  const S = {
    wrap: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Inter',sans-serif", paddingBottom: 80 },
    header: { background: "linear-gradient(135deg,#1e293b,#0f172a)", padding: "24px 20px 16px", borderBottom: "1px solid #1e293b" },
    tabs: { display: "flex", gap: 4, padding: "10px 12px", background: "#0f172a", position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid #1e293b" },
    tab: active => ({ flex: 1, padding: "7px 2px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: active ? "#6366f1" : "#1e293b", color: active ? "#fff" : "#94a3b8" }),
    body: { padding: 16 },
    scoreCard: { background: "linear-gradient(135deg,#1e293b,#162032)", borderRadius: 16, padding: 20, marginBottom: 16, border: "1px solid #2d3748", textAlign: "center" },
    sectionTitle: { fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
    divider: { borderTop: "1px solid #1e293b", margin: "18px 0 14px" },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
    card: done => ({ background: done ? "linear-gradient(135deg,#1d2f4a,#162040)" : "#1e293b", border: `1.5px solid ${done ? "#6366f1" : "#2d3748"}`, borderRadius: 12, padding: "10px 8px", cursor: "pointer", position: "relative", userSelect: "none" }),
    check: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 },
    ccCard: cnt => ({ background: cnt > 0 ? "linear-gradient(135deg,#1d2f4a,#162040)" : "#1e293b", border: `1.5px solid ${cnt > 0 ? "#6366f1" : "#2d3748"}`, borderRadius: 12, padding: "10px 8px", position: "relative", userSelect: "none" }),
    cRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    cBtn: { width: 22, height: 22, borderRadius: 6, border: "none", background: "#334155", color: "#e2e8f0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    taskRow: { display: "flex", alignItems: "center", gap: 12, background: "#1e293b", border: "1.5px solid #f59e0b33", borderRadius: 14, padding: "12px 14px", marginBottom: 8 },
    btn: v => ({ padding: v === "sm" ? "6px 12px" : "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: v === "sm" ? 12 : 14, background: v === "danger" ? "#7f1d1d" : v === "ghost" ? "transparent" : v === "amber" ? "#78350f" : "#6366f1", color: v === "danger" ? "#fca5a5" : v === "ghost" ? "#64748b" : v === "amber" ? "#fcd34d" : "#fff" }),
    input: { width: "100%", padding: "10px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" },
    formCard: { background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid #334155" },
    iconGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
    iconBtn: sel => ({ fontSize: 20, background: sel ? "#4f46e5" : "#0f172a", border: sel ? "2px solid #818cf8" : "2px solid transparent", borderRadius: 8, padding: "4px 6px", cursor: "pointer" }),
    actRow: { display: "flex", alignItems: "center", gap: 10, background: "#1e293b", borderRadius: 12, padding: 12, marginBottom: 8, border: "1px solid #2d3748" },
    histCard: { background: "#1e293b", borderRadius: 14, padding: 14, marginBottom: 8, border: "1px solid #2d3748", display: "flex", alignItems: "center", gap: 12 },
    dateInput: { padding: "8px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#e2e8f0", fontSize: 14, marginBottom: 16, width: "100%", boxSizing: "border-box" },
    typePill: sel => ({ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: sel ? "#6366f1" : "#0f172a", color: sel ? "#fff" : "#64748b" }),
    modePill: (sel, amber) => ({ flex: 1, padding: 8, borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: sel ? (amber ? "#92400e" : "#3730a3") : "#0f172a", color: sel ? (amber ? "#fcd34d" : "#a5b4fc") : "#475569" }),
    statBox: { background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 14, border: "1px solid #2d3748" },
  };

  if (loading) return (
    <div style={{ ...S.wrap, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ fontSize: 40 }}>🎯</div>
      <div style={{ fontSize: 16, color: "#64748b" }}>Loading your habits...</div>
    </div>
  );

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 }}>🎯 My Habit Tracker</div>
        <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>{new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      <div style={S.tabs}>
        {[["today","Today"],["history","History"],["stats","Stats"],["manage","Activities"]].map(([k,l]) => (
          <button key={k} style={S.tab(tab === k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={S.body}>

        {/* ── TODAY ── */}
        {tab === "today" && (<>
          <div style={S.scoreCard}>
            <div style={{ fontSize: 48, fontWeight: 800, color }}>{todayScore}</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>of {maxScore} base pts · {todayScore > maxScore ? `+${todayScore - maxScore} bonus!` : `${maxScore - todayScore} remaining`}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color, marginTop: 8 }}>{msg}</div>
            <div style={{ height: 6, background: "#1e293b", borderRadius: 99, marginTop: 12, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: `linear-gradient(90deg,${color},#818cf8)`, width: `${maxScore ? Math.min((todayScore / maxScore) * 100, 100) : 0}%`, transition: "width .5s" }} />
            </div>
          </div>

          <div style={S.sectionTitle}>Daily Activities</div>

          {/* Steps card */}
          <div style={{ background: gToken ? (stepsScore > 0 ? "linear-gradient(135deg,#1d2f4a,#162040)" : "#1e293b") : "#1a1a2e", border: `1.5px solid ${gToken ? (stepsScore > 0 ? "#6366f1" : "#2d3748") : "#334155"}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 28 }}>👟</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Steps Today</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {!gToken ? "Connect Google Fit to track steps" : stepsLoading ? "Fetching steps..." : `${steps.toLocaleString()} steps · 1 pt per 1,000`}
                </div>
              </div>
              {gToken ? (
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: "#818cf8" }}>{stepsScore}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>pts</div>
                </div>
              ) : (
                <button onClick={loginGoogle} style={{ padding: "7px 14px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12, background: "#4285f4", color: "#fff" }}>Connect</button>
              )}
            </div>
            {gToken && steps > 0 && (
              <div style={{ marginTop: 10 }}>
                <div style={{ height: 5, background: "#0f172a", borderRadius: 99, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg,#6366f1,#a855f7)", width: `${Math.min((steps / 10000) * 100, 100)}%`, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 10, color: "#475569", marginTop: 3, textAlign: "right" }}>{Math.min(Math.round((steps / 10000) * 100), 100)}% of 10k goal</div>
              </div>
            )}
          </div>

          <div style={S.grid}>
            {activities.map(a => {
              if (a.type === "counter") {
                const cnt = getLogValue(todayLog, a);
                return (
                  <div key={a.id} style={S.ccCard(cnt)}>
                    {cnt > 0 && <div style={S.check}>✓</div>}
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: cnt > 0 ? "#818cf8" : "#64748b", marginTop: 3 }}>+{a.score} ea</div>
                    <div style={S.cRow}>
                      <button style={S.cBtn} onClick={() => changeCount(a, -1)}>−</button>
                      <span style={{ fontSize: 16, fontWeight: 800, color: "#818cf8" }}>{cnt}</span>
                      <button style={S.cBtn} onClick={() => changeCount(a, 1)}>+</button>
                    </div>
                    {cnt > 0 && <div style={{ textAlign: "center", fontSize: 10, color: "#818cf8", marginTop: 3 }}>{cnt * a.score} pts</div>}
                  </div>
                );
              }
              const done = getLogValue(todayLog, a);
              return (
                <div key={a.id} style={S.card(done)} onClick={() => toggleActivity(a)}>
                  {done && <div style={S.check}>✓</div>}
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.3 }}>{a.name}</div>
                  <div style={{ fontSize: 10, color: done ? "#818cf8" : "#64748b", marginTop: 3 }}>+{a.score} pts</div>
                </div>
              );
            })}
          </div>

          <div style={S.divider} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ ...S.sectionTitle, marginBottom: 0 }}>⚡ One-time Tasks</div>
            <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{pendingTasks.length} pending</span>
          </div>
          {pendingTasks.length === 0 && <div style={{ textAlign: "center", color: "#64748b", padding: "20px", fontSize: 13 }}>✨ No pending tasks — add from Activities tab</div>}
          {pendingTasks.map(t => (
            <div key={t.id} style={S.taskRow}>
              <button style={{ width: 28, height: 28, borderRadius: 8, border: "2px solid #f59e0b", background: "transparent", cursor: "pointer", color: "#f59e0b", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => completeTask(t.id)}>✓</button>
              <span style={{ fontSize: 20 }}>{t.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>+{t.score} pts</div>
              </div>
            </div>
          ))}
          {todayDoneTasks.length > 0 && <div style={{ fontSize: 12, color: "#475569", textAlign: "center", marginTop: 8 }}>✓ {todayDoneTasks.length} task{todayDoneTasks.length > 1 ? "s" : ""} done today (+{todayTaskScore} pts)</div>}
        </>)}

        {/* ── HISTORY ── */}
        {tab === "history" && (<>
          <div style={S.sectionTitle}>Browse History</div>
          <input type="date" style={S.dateInput} value={historyDate} max={todayKey} onChange={e => setHistoryDate(e.target.value)} />
          <div style={{ ...S.scoreCard, marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>{new Date(historyDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}</div>
            <div style={{ fontSize: 48, fontWeight: 800, color: "#6366f1" }}>{histScore}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>pts · {histDoneActivities.length + histDoneTasks.length} activities</div>
          </div>
          {histDoneActivities.length === 0 && histDoneTasks.length === 0 && steps === 0
            ? <div style={{ textAlign: "center", color: "#64748b", padding: 24 }}>😴 No activities logged</div>
            : <>
                {histDoneActivities.map(a => { const v = getLogValue(histLog, a); return (
                  <div key={a.id} style={S.histCard}>
                    <span style={{ fontSize: 24 }}>{a.icon}</span>
                    <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>{a.type === "counter" && <div style={{ fontSize: 12, color: "#64748b" }}>{v}× done</div>}</div>
                    <div style={{ color: "#818cf8", fontWeight: 700 }}>+{a.type === "counter" ? v * a.score : a.score}</div>
                  </div>
                );})}
                {histDoneTasks.length > 0 && <>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", margin: "12px 0 8px" }}>⚡ One-time Tasks</div>
                  {histDoneTasks.map(t => (
                    <div key={t.id} style={{ ...S.histCard, border: "1px solid #f59e0b33" }}>
                      <span style={{ fontSize: 24 }}>{t.icon}</span>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div></div>
                      <div style={{ color: "#f59e0b", fontWeight: 700 }}>+{t.score}</div>
                    </div>
                  ))}
                </>}
                {(() => { const savedSteps = histLog.__steps; return savedSteps > 0 ? (
                  <>
                    <div style={{ fontSize: 12, color: "#64748b", fontWeight: 700, textTransform: "uppercase", margin: "12px 0 8px" }}>👟 Steps</div>
                    <div style={{ ...S.histCard, border: "1px solid #334155" }}>
                      <span style={{ fontSize: 24 }}>👟</span>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>Steps</div><div style={{ fontSize: 12, color: "#64748b" }}>{savedSteps.toLocaleString()} steps</div></div>
                      <div style={{ color: "#818cf8", fontWeight: 700 }}>+{Math.floor(savedSteps / 1000)}</div>
                    </div>
                  </>
                ) : null; })()}
              </>}
        </>)}

        {/* ── STATS ── */}
        {tab === "stats" && (<>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["week","month"].map(p => (
              <button key={p} onClick={() => setStatsPeriod(p)} style={{ flex: 1, padding: 9, borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: statsPeriod === p ? "#6366f1" : "#1e293b", color: statsPeriod === p ? "#fff" : "#64748b" }}>
                {p === "week" ? "This Week" : "This Month"}
              </button>
            ))}
          </div>

          <div style={S.statBox}>
            <div style={S.sectionTitle}>📈 Daily Score — Last {statsPeriod === "week" ? "7" : "30"} Days</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: statsPeriod === "week" ? 8 : 3, height: 100, marginBottom: 6 }}>
              {dailyScores.map(d => (
                <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 3 }}>
                  <div style={{ fontSize: 9, color: "#64748b" }}>{d.score > 0 ? d.score : ""}</div>
                  <div style={{ width: "100%", borderRadius: 4, height: `${Math.max((d.score / maxDailyScore) * 80, d.score > 0 ? 4 : 2)}px`, background: d.date === todayKey ? "linear-gradient(180deg,#a855f7,#6366f1)" : d.score >= maxScore * 0.8 ? "#22c55e" : d.score >= maxScore * 0.5 ? "#6366f1" : d.score > 0 ? "#334155" : "#1e293b", transition: "height .4s" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: statsPeriod === "week" ? 8 : 3 }}>
              {dailyScores.map(d => <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: statsPeriod === "week" ? 10 : 8, color: d.date === todayKey ? "#818cf8" : "#475569", fontWeight: d.date === todayKey ? 700 : 400 }}>{d.label}</div>)}
            </div>
          </div>

          <div style={S.statBox}>
            <div style={S.sectionTitle}>🗓 Activity Heatmap</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {statsDays.map(dk => {
                const log = logs[dk] || {};
                const score = activities.reduce((s, a) => { const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0); return s + v * a.score; }, 0);
                const pct = score / maxScore;
                const bg = score === 0 ? "#0f172a" : pct < 0.3 ? "#1e3a5f" : pct < 0.6 ? "#2563eb" : pct < 0.9 ? "#6366f1" : "#a855f7";
                return <div key={dk} title={`${dk}: ${score} pts`} style={{ width: statsPeriod === "week" ? 36 : 22, height: statsPeriod === "week" ? 36 : 22, borderRadius: 6, background: bg, border: dk === todayKey ? "2px solid #818cf8" : "2px solid transparent" }} />;
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
              <span style={{ fontSize: 11, color: "#475569" }}>Less</span>
              {["#0f172a","#1e3a5f","#2563eb","#6366f1","#a855f7"].map(c => <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />)}
              <span style={{ fontSize: 11, color: "#475569" }}>More</span>
            </div>
          </div>

          <div style={S.sectionTitle}>🏅 Activity Breakdown</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {activityStats.map(a => (
              <div key={a.id} style={{ background: "#1e293b", borderRadius: 14, padding: "14px 12px", border: "1px solid #2d3748" }}>
                <div style={{ fontSize: 26, marginBottom: 6 }}>{a.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3, marginBottom: 8 }}>{a.name}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: "#818cf8", lineHeight: 1 }}>{a.totalCount}</div>
                    <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>times · {a.daysActive}/{statsDayCount} days</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#6366f1" }}>{a.totalPts} pts</div>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── MANAGE ── */}
        {tab === "manage" && (<>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={S.sectionTitle}>My Activities</div>
            <button style={S.btn()} onClick={() => { resetForm(); setFormMode("activity"); setShowAddForm(v => !v); }}>{showAddForm ? "Cancel" : "+ Add"}</button>
          </div>
          {showAddForm && (
            <div style={S.formCard}>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <button style={S.modePill(formMode === "activity", false)} onClick={() => { setFormMode("activity"); resetForm(); }}>🔁 Daily</button>
                <button style={S.modePill(formMode === "task", true)} onClick={() => { setFormMode("task"); resetForm(); }}>⚡ One-time</button>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#e2e8f0" }}>{editingId ? "Edit" : formMode === "task" ? "New One-time Task" : "New Daily Activity"}</div>
              <input style={S.input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
              <div style={{ margin: "10px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>Score:</span>
                {[1,2,3,5,8].map(n => <button key={n} style={{ ...S.btn(newScore===n?"":"ghost"), padding: "5px 10px", fontSize: 13 }} onClick={() => setNewScore(n)}>{n}</button>)}
              </div>
              {formMode === "activity" && (
                <div style={{ margin: "8px 0" }}>
                  <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>Type:</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={S.typePill(newType === "toggle")} onClick={() => setNewType("toggle")}>✓ Once</button>
                    <button style={S.typePill(newType === "counter")} onClick={() => setNewType("counter")}>🔢 Counter</button>
                  </div>
                </div>
              )}
              <div style={{ fontSize: 13, color: "#94a3b8", margin: "8px 0 4px" }}>Icon:</div>
              <div style={S.iconGrid}>{ICONS.map(ic => <button key={ic} style={S.iconBtn(newIcon===ic)} onClick={() => setNewIcon(ic)}>{ic}</button>)}</div>
              <button style={{ ...S.btn(formMode === "task" ? "amber" : ""), marginTop: 12, width: "100%" }} onClick={addItem}>{editingId ? "Save" : formMode === "task" ? "Add Task" : "Add Activity"}</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔁 Daily Activities</div>
          {activities.map(a => (
            <div key={a.id} style={S.actRow}>
              <span style={{ fontSize: 22 }}>{a.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                <div style={{ fontSize: 12, display: "flex", gap: 6, marginTop: 2 }}>
                  <span style={{ color: "#6366f1", fontWeight: 600 }}>{a.score} pts</span>
                  <span style={{ color: "#475569" }}>· {a.type === "counter" ? "🔢" : "✓"}</span>
                </div>
              </div>
              <button style={S.btn("ghost")} onClick={() => startEdit(a)}>✏️</button>
              <button style={S.btn("danger")} onClick={() => deleteActivity(a.id)}>✕</button>
            </div>
          ))}
          {pendingTasks.length > 0 && <>
            <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "14px 0 8px" }}>⚡ Pending Tasks</div>
            {pendingTasks.map(t => (
              <div key={t.id} style={{ ...S.actRow, border: "1px solid #f59e0b33" }}>
                <span style={{ fontSize: 22 }}>{t.icon}</span>
                <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div><div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{t.score} pts</div></div>
                <button style={S.btn("danger")} onClick={() => deleteTask(t.id)}>✕</button>
              </div>
            ))}
          </>}
        </>)}

      </div>

      {/* ── FOOTER ── */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid #1e293b", zIndex: 20 }}>
        {showRewardPanel && (
          <div style={{ borderBottom: "1px solid #1e293b", padding: "14px 16px", maxHeight: 240, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>🎁 Reward History</span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 11, color: "#64748b" }}>Threshold:</span>
                {[10,25,50,100].map(n => <button key={n} onClick={() => updateThreshold(n)} style={{ padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: rewardThreshold === n ? "#6366f1" : "#1e293b", color: rewardThreshold === n ? "#fff" : "#64748b" }}>{n}</button>)}
              </div>
            </div>
            {rewardHistory.length === 0
              ? <div style={{ fontSize: 13, color: "#475569", textAlign: "center", padding: "10px 0" }}>No rewards claimed yet</div>
              : [...rewardHistory].reverse().map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #1e293b" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span>🎁</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Reward claimed</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#a855f7" }}>−{r.pts} pts</span>
                  </div>
                ))
            }
          </div>
        )}
        <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ cursor: "pointer" }} onClick={() => setShowRewardPanel(p => !p)}>
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>Total Score {showRewardPanel ? "▼" : "▲"}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: canClaim ? "#a855f7" : "#6366f1" }}>{netScore} <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>pts</span></div>
          </div>
          <button disabled={!canClaim} onClick={claimReward} style={{ padding: "10px 20px", borderRadius: 12, border: "none", cursor: canClaim ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14, background: canClaim ? "linear-gradient(135deg,#7c3aed,#a855f7)" : "#1e293b", color: canClaim ? "#fff" : "#475569", boxShadow: canClaim ? "0 0 16px #a855f740" : "none" }}>
            🎁 Claim Reward
            <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>{canClaim ? `−${rewardThreshold} pts` : `need ${rewardThreshold - netScore} more`}</div>
          </button>
        </div>
      </div>
    </div>
  );
}