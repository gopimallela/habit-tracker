import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

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

const toKey = d => d.toISOString().split("T")[0];
const today = () => new Date();

function getMotivation(score, max) {
  const pct = max === 0 ? 0 : (score / max) * 100;
  if (pct === 0) return { msg: "Let's get started! 💪", color: "#94a3b8" };
  if (pct < 30) return { msg: "Warming up...", color: "#f97316" };
  if (pct < 60) return { msg: "Good momentum! 🔥", color: "#eab308" };
  if (pct < 90) return { msg: "Crushing it! ⚡", color: "#22c55e" };
  return { msg: "Perfect day! 🌟", color: "#a855f7" };
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("today");
  const [statsPeriod, setStatsPeriod] = useState("week"); // "week" | "month"
  const [activities, setActivities] = useState([]);
  const [logs, setLogs] = useState({});
  const [tasks, setTasks] = useState([]);
  const [claimed, setClaimed] = useState(0);
  const [rewardHistory, setRewardHistory] = useState([]);
  const [rewardThreshold, setRewardThreshold] = useState(25);
  const [showRewardPanel, setShowRewardPanel] = useState(false);
  const [historyDate, setHistoryDate] = useState(toKey(today()));

  const [showAddForm, setShowAddForm] = useState(false);
  const [formMode, setFormMode] = useState("activity");
  const [newName, setNewName] = useState("");
  const [newScore, setNewScore] = useState(1);
  const [newIcon, setNewIcon] = useState("🎯");
  const [newType, setNewType] = useState("toggle");
  const [editingId, setEditingId] = useState(null);

  // ── Load all data on mount ──
  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
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
        // seed default activities on first load
        await supabase.from("activities").insert(DEFAULT_ACTIVITIES);
        setActivities(DEFAULT_ACTIVITIES);
      }

      if (lgArr) {
        const logMap = {};
        lgArr.forEach(r => { logMap[r.date] = r.data; });
        setLogs(logMap);
      }

      if (tks) setTasks(tks);

      if (sets) {
        const claimed_row = sets.find(r => r.key === "claimed");
        const threshold_row = sets.find(r => r.key === "reward_threshold");
        const history_row = sets.find(r => r.key === "reward_history");
        if (claimed_row) setClaimed(parseInt(claimed_row.value) || 0);
        if (threshold_row) setRewardThreshold(parseInt(threshold_row.value) || 25);
        if (history_row) setRewardHistory(JSON.parse(history_row.value) || []);
      }
    } catch (e) { console.error("Load error", e); }
    setLoading(false);
  };

  const saveSetting = async (key, value) => {
    await supabase.from("settings").upsert({ key, value: String(value) });
  };

  // ── Logs ──
  const getLogValue = (log, a) => {
    if (!log) return a.type === "counter" ? 0 : false;
    const v = log[a.id];
    if (a.type === "counter") return typeof v === "number" ? v : 0;
    return !!v;
  };

  const updateLog = async (dateKey, newLog) => {
    setLogs(prev => ({ ...prev, [dateKey]: newLog }));
    await supabase.from("logs").upsert({ date: dateKey, data: newLog });
  };

  const todayKey = toKey(today());
  const todayLog = logs[todayKey] || {};

  const toggleActivity = async (a) => {
    const newLog = { ...todayLog, [a.id]: !todayLog[a.id] };
    await updateLog(todayKey, newLog);
  };

  const changeCount = async (a, delta) => {
    const cur = typeof todayLog[a.id] === "number" ? todayLog[a.id] : 0;
    const newLog = { ...todayLog, [a.id]: Math.max(0, cur + delta) };
    await updateLog(todayKey, newLog);
  };

  // ── Scores ──
  const maxScore = activities.reduce((s, a) => s + a.score, 0);
  const todayActivityScore = activities.reduce((s, a) => {
    const v = getLogValue(todayLog, a);
    return s + (a.type === "counter" ? v * a.score : v ? a.score : 0);
  }, 0);
  const pendingTasks = tasks.filter(t => !t.done);
  const todayDoneTasks = tasks.filter(t => t.done && t.done_at === todayKey);
  const todayTaskScore = todayDoneTasks.reduce((s, t) => s + t.score, 0);
  const todayScore = todayActivityScore + todayTaskScore;
  const { msg, color } = getMotivation(todayScore, maxScore);

  const totalEverScore = Object.values(logs).reduce((total, log) => {
    return total + activities.reduce((s, a) => {
      const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0);
      return s + v * a.score;
    }, 0);
  }, 0) + tasks.filter(t => t.done).reduce((s, t) => s + t.score, 0);

  const netScore = totalEverScore - claimed;
  const canClaim = netScore >= rewardThreshold;

  const claimReward = async () => {
    if (!canClaim) return;
    const newClaimed = claimed + rewardThreshold;
    const newHistory = [...rewardHistory, { date: todayKey, pts: rewardThreshold, id: Date.now() }];
    setClaimed(newClaimed);
    setRewardHistory(newHistory);
    await Promise.all([
      saveSetting("claimed", newClaimed),
      saveSetting("reward_history", JSON.stringify(newHistory)),
    ]);
  };

  const updateThreshold = async (val) => {
    setRewardThreshold(val);
    await saveSetting("reward_threshold", val);
  };

  // ── Tasks ──
  const completeTask = async (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true, done_at: todayKey } : t));
    await supabase.from("tasks").update({ done: true, done_at: todayKey }).eq("id", id);
  };

  const deleteTask = async (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    await supabase.from("tasks").delete().eq("id", id);
  };

  // ── Activities CRUD ──
  const resetForm = () => { setNewName(""); setNewScore(1); setNewIcon("🎯"); setNewType("toggle"); setEditingId(null); };

  const addItem = async () => {
    if (!newName.trim()) return;
    if (formMode === "task") {
      const task = { id: Date.now(), name: newName.trim(), score: newScore, icon: newIcon, done: false, created_at: todayKey, done_at: null };
      setTasks(prev => [...prev, task]);
      await supabase.from("tasks").insert(task);
    } else {
      if (editingId !== null) {
        const updated = { name: newName.trim(), score: newScore, icon: newIcon, type: newType };
        setActivities(prev => prev.map(a => a.id === editingId ? { ...a, ...updated } : a));
        await supabase.from("activities").update(updated).eq("id", editingId);
      } else {
        const act = { id: Date.now(), name: newName.trim(), score: newScore, icon: newIcon, type: newType };
        setActivities(prev => [...prev, act]);
        await supabase.from("activities").insert(act);
      }
    }
    resetForm(); setShowAddForm(false);
  };

  const deleteActivity = async (id) => {
    setActivities(prev => prev.filter(a => a.id !== id));
    await supabase.from("activities").delete().eq("id", id);
  };

  const startEdit = (a) => { setEditingId(a.id); setNewName(a.name); setNewScore(a.score); setNewIcon(a.icon); setNewType(a.type || "toggle"); setFormMode("activity"); setShowAddForm(true); };

  // ── Stats computation ──
  const getStatsDays = () => {
    const days = statsPeriod === "week" ? 7 : 30;
    return Array.from({ length: days }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (days - 1 - i));
      return toKey(d);
    });
  };

  const statsDays = getStatsDays();
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
    const score = activities.reduce((s, a) => {
      const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0);
      return s + v * a.score;
    }, 0) + tasks.filter(t => t.done && t.done_at === dk).reduce((s, t) => s + t.score, 0);
    return { date: dk, score, label: new Date(dk + "T00:00:00").toLocaleDateString("en-IN", statsPeriod === "week" ? { weekday: "short" } : { day: "numeric", month: "short" }) };
  });

  const maxDailyScore = Math.max(...dailyScores.map(d => d.score), 1);
  const maxActivityPts = Math.max(...activityStats.map(a => a.totalPts), 1);
  const histLog = logs[historyDate] || {};
  const histActivityScore = activities.reduce((s, a) => {
    const v = getLogValue(histLog, a);
    return s + (a.type === "counter" ? v * a.score : v ? a.score : 0);
  }, 0);
  const histDoneTasks = tasks.filter(t => t.done && t.done_at === historyDate);
  const histScore = histActivityScore + histDoneTasks.reduce((s, t) => s + t.score, 0);
  const histDoneActivities = activities.filter(a => {
    const v = getLogValue(histLog, a);
    return a.type === "counter" ? v > 0 : v;
  });

  // ── Styles ──
  const s = {
    wrap: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Inter', sans-serif", padding: "0 0 40px" },
    header: { background: "linear-gradient(135deg, #1e293b, #0f172a)", padding: "24px 20px 16px", borderBottom: "1px solid #1e293b" },
    title: { fontSize: 22, fontWeight: 700, color: "#f8fafc", margin: 0 },
    sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
    tabs: { display: "flex", gap: 4, padding: "12px 16px", background: "#0f172a", position: "sticky", top: 0, zIndex: 10, borderBottom: "1px solid #1e293b" },
    tabBtn: (active) => ({ flex: 1, padding: "8px 4px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? "#6366f1" : "#1e293b", color: active ? "#fff" : "#94a3b8", transition: "all .2s" }),
    body: { padding: "16px" },
    scoreCard: { background: "linear-gradient(135deg, #1e293b, #162032)", borderRadius: 16, padding: "20px", marginBottom: 16, border: "1px solid #2d3748", textAlign: "center" },
    bigScore: { fontSize: 48, fontWeight: 800, color },
    progressBar: { height: 6, background: "#1e293b", borderRadius: 99, marginTop: 12, overflow: "hidden" },
    progressFill: { height: "100%", borderRadius: 99, background: `linear-gradient(90deg, ${color}, #818cf8)`, width: `${maxScore ? Math.min((todayScore / maxScore) * 100, 100) : 0}%`, transition: "width .5s" },
    sectionTitle: { fontSize: 13, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
    sectionDivider: { borderTop: "1px solid #1e293b", margin: "20px 0 16px" },
    grid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
    card: (done) => ({ background: done ? "linear-gradient(135deg, #1d2f4a, #162040)" : "#1e293b", border: done ? "1.5px solid #6366f1" : "1.5px solid #2d3748", borderRadius: 12, padding: "10px 8px", cursor: "pointer", transition: "all .2s", position: "relative", userSelect: "none" }),
    cardIcon: { fontSize: 20, marginBottom: 4 },
    cardName: { fontSize: 11, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.3 },
    cardScore: (done) => ({ fontSize: 10, color: done ? "#818cf8" : "#64748b", marginTop: 3, fontWeight: 600 }),
    check: { position: "absolute", top: 6, right: 6, width: 16, height: 16, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 },
    counterCard: (count) => ({ background: count > 0 ? "linear-gradient(135deg, #1d2f4a, #162040)" : "#1e293b", border: count > 0 ? "1.5px solid #6366f1" : "1.5px solid #2d3748", borderRadius: 12, padding: "10px 8px", transition: "all .2s", position: "relative", userSelect: "none" }),
    counterRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 },
    counterBtn: { width: 22, height: 22, borderRadius: 6, border: "none", background: "#334155", color: "#e2e8f0", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
    counterVal: { fontSize: 16, fontWeight: 800, color: "#818cf8" },
    taskRow: { display: "flex", alignItems: "center", gap: 12, background: "#1e293b", border: "1.5px solid #f59e0b33", borderRadius: 14, padding: "12px 14px", marginBottom: 8 },
    taskDoneBtn: { width: 28, height: 28, borderRadius: 8, border: "2px solid #f59e0b", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, color: "#f59e0b" },
    btn: (variant) => ({ padding: variant === "sm" ? "6px 12px" : "10px 18px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 600, fontSize: variant === "sm" ? 12 : 14, background: variant === "danger" ? "#7f1d1d" : variant === "ghost" ? "transparent" : variant === "amber" ? "#78350f" : "#6366f1", color: variant === "danger" ? "#fca5a5" : variant === "ghost" ? "#64748b" : variant === "amber" ? "#fcd34d" : "#fff" }),
    input: { width: "100%", padding: "10px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#e2e8f0", fontSize: 14, boxSizing: "border-box" },
    formCard: { background: "#1e293b", borderRadius: 16, padding: 16, marginBottom: 16, border: "1px solid #334155" },
    iconGrid: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 },
    iconBtn: (sel) => ({ fontSize: 20, background: sel ? "#4f46e5" : "#0f172a", border: sel ? "2px solid #818cf8" : "2px solid transparent", borderRadius: 8, padding: "4px 6px", cursor: "pointer" }),
    actRow: { display: "flex", alignItems: "center", gap: 10, background: "#1e293b", borderRadius: 12, padding: "12px", marginBottom: 8, border: "1px solid #2d3748" },
    histCard: { background: "#1e293b", borderRadius: 14, padding: "14px", marginBottom: 8, border: "1px solid #2d3748", display: "flex", alignItems: "center", gap: 12 },
    emptyState: { textAlign: "center", color: "#64748b", padding: "24px 20px", fontSize: 14 },
    dateInput: { padding: "8px 12px", background: "#1e293b", border: "1px solid #334155", borderRadius: 10, color: "#e2e8f0", fontSize: 14, marginBottom: 16, width: "100%", boxSizing: "border-box" },
    typePill: (sel) => ({ padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: sel ? "#6366f1" : "#0f172a", color: sel ? "#fff" : "#64748b", transition: "all .2s" }),
    modePill: (sel, amber) => ({ flex: 1, padding: "8px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: sel ? (amber ? "#92400e" : "#3730a3") : "#0f172a", color: sel ? (amber ? "#fcd34d" : "#a5b4fc") : "#475569", transition: "all .2s" }),
  };

  if (loading) return (
    <div style={{ ...s.wrap, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", gap: 16 }}>
      <div style={{ fontSize: 40 }}>🎯</div>
      <div style={{ fontSize: 16, color: "#64748b" }}>Loading your habits...</div>
    </div>
  );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.title}>🎯 My Habit Tracker</div>
        <div style={s.sub}>{today().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      <div style={s.tabs}>
        {[["today","Today"],["history","History"],["stats","Stats"],["manage","Activities"]].map(([k,l]) => (
          <button key={k} style={s.tabBtn(tab===k)} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={s.body}>
        {tab === "today" && (
          <>
            <div style={s.scoreCard}>
              <div style={s.bigScore}>{todayScore}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>of {maxScore} base pts · {todayScore > maxScore ? `+${todayScore - maxScore} bonus!` : `${maxScore - todayScore} remaining`}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color, marginTop: 8 }}>{msg}</div>
              <div style={s.progressBar}><div style={s.progressFill} /></div>
            </div>

            <div style={s.sectionTitle}>Daily Activities</div>
            <div style={s.grid}>
              {activities.map(a => {
                if (a.type === "counter") {
                  const count = getLogValue(todayLog, a);
                  return (
                    <div key={a.id} style={s.counterCard(count)}>
                      {count > 0 && <div style={s.check}>✓</div>}
                      <div style={s.cardIcon}>{a.icon}</div>
                      <div style={s.cardName}>{a.name}</div>
                      <div style={s.cardScore(count > 0)}>+{a.score} ea</div>
                      <div style={s.counterRow}>
                        <button style={s.counterBtn} onClick={() => changeCount(a, -1)}>−</button>
                        <span style={s.counterVal}>{count}</span>
                        <button style={s.counterBtn} onClick={() => changeCount(a, 1)}>+</button>
                      </div>
                      {count > 0 && <div style={{ textAlign: "center", fontSize: 10, color: "#818cf8", marginTop: 3 }}>{count * a.score} pts</div>}
                    </div>
                  );
                }
                const done = getLogValue(todayLog, a);
                return (
                  <div key={a.id} style={s.card(done)} onClick={() => toggleActivity(a)}>
                    {done && <div style={s.check}>✓</div>}
                    <div style={s.cardIcon}>{a.icon}</div>
                    <div style={s.cardName}>{a.name}</div>
                    <div style={s.cardScore(done)}>+{a.score} pts</div>
                  </div>
                );
              })}
            </div>

            <div style={s.sectionDivider} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ ...s.sectionTitle, marginBottom: 0 }}>⚡ One-time Tasks</div>
              <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{pendingTasks.length} pending</span>
            </div>
            {pendingTasks.length === 0 && <div style={s.emptyState}>✨ No pending tasks — add from Activities tab</div>}
            {pendingTasks.map(t => (
              <div key={t.id} style={s.taskRow}>
                <button style={s.taskDoneBtn} onClick={() => completeTask(t.id)}>✓</button>
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>+{t.score} pts</div>
                </div>
              </div>
            ))}
            {todayDoneTasks.length > 0 && (
              <div style={{ fontSize: 12, color: "#475569", textAlign: "center", marginTop: 8 }}>
                ✓ {todayDoneTasks.length} task{todayDoneTasks.length > 1 ? "s" : ""} completed today (+{todayTaskScore} pts)
              </div>
            )}
          </>
        )}

        {tab === "stats" && (
          <>
            {/* Period toggle */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              {["week","month"].map(p => (
                <button key={p} onClick={() => setStatsPeriod(p)}
                  style={{ flex: 1, padding: "9px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, background: statsPeriod === p ? "#6366f1" : "#1e293b", color: statsPeriod === p ? "#fff" : "#64748b", transition: "all .2s" }}>
                  {p === "week" ? "This Week" : "This Month"}
                </button>
              ))}
            </div>

            {/* Daily score bar chart */}
            <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px", marginBottom: 16, border: "1px solid #2d3748" }}>
              <div style={s.sectionTitle}>📈 Daily Score — Last {statsPeriod === "week" ? "7" : "30"} Days</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: statsPeriod === "week" ? 8 : 3, height: 100, marginBottom: 6 }}>
                {dailyScores.map((d, i) => (
                  <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end", gap: 3 }}>
                    <div style={{ fontSize: 9, color: "#64748b", fontWeight: 600 }}>{d.score > 0 ? d.score : ""}</div>
                    <div style={{
                      width: "100%", borderRadius: 4,
                      height: `${Math.max((d.score / maxDailyScore) * 80, d.score > 0 ? 4 : 2)}px`,
                      background: d.date === todayKey
                        ? "linear-gradient(180deg, #a855f7, #6366f1)"
                        : d.score >= maxScore * 0.8 ? "#22c55e"
                        : d.score >= maxScore * 0.5 ? "#6366f1"
                        : d.score > 0 ? "#334155" : "#1e293b",
                      transition: "height .4s"
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: statsPeriod === "week" ? 8 : 3 }}>
                {dailyScores.map(d => (
                  <div key={d.date} style={{ flex: 1, textAlign: "center", fontSize: statsPeriod === "week" ? 10 : 8, color: d.date === todayKey ? "#818cf8" : "#475569", fontWeight: d.date === todayKey ? 700 : 400 }}>
                    {d.label}
                  </div>
                ))}
              </div>
            </div>

            {/* Heatmap */}
            <div style={{ background: "#1e293b", borderRadius: 16, padding: "16px", marginBottom: 16, border: "1px solid #2d3748" }}>
              <div style={s.sectionTitle}>🗓 Activity Heatmap</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {statsDays.map(dk => {
                  const log = logs[dk] || {};
                  const score = activities.reduce((s, a) => {
                    const v = typeof log[a.id] === "number" ? log[a.id] : (log[a.id] ? 1 : 0);
                    return s + v * a.score;
                  }, 0);
                  const pct = score / maxScore;
                  const bg = score === 0 ? "#0f172a" : pct < 0.3 ? "#1e3a5f" : pct < 0.6 ? "#2563eb" : pct < 0.9 ? "#6366f1" : "#a855f7";
                  const label = new Date(dk + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
                  return (
                    <div key={dk} title={`${label}: ${score} pts`} style={{
                      width: statsPeriod === "week" ? 36 : 24, height: statsPeriod === "week" ? 36 : 24,
                      borderRadius: 6, background: bg,
                      border: dk === todayKey ? "2px solid #818cf8" : "2px solid transparent",
                      cursor: "default", transition: "background .3s"
                    }} />
                  );
                })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10 }}>
                <span style={{ fontSize: 11, color: "#475569" }}>Less</span>
                {["#0f172a","#1e3a5f","#2563eb","#6366f1","#a855f7"].map(c => (
                  <div key={c} style={{ width: 14, height: 14, borderRadius: 3, background: c }} />
                ))}
                <span style={{ fontSize: 11, color: "#475569" }}>More</span>
              </div>
            </div>

            {/* Per-activity stats */}
            <div style={s.sectionTitle}>🏅 Activity Breakdown</div>
            {activityStats.map(a => (
              <div key={a.id} style={{ background: "#1e293b", borderRadius: 14, padding: "14px", marginBottom: 10, border: "1px solid #2d3748" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ fontSize: 22 }}>{a.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{a.daysActive} of {statsDayCount} days · {a.totalCount} times · {a.totalPts} pts</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: a.completionRate >= 80 ? "#22c55e" : a.completionRate >= 50 ? "#eab308" : "#64748b" }}>{a.completionRate}%</div>
                    <div style={{ fontSize: 10, color: "#475569" }}>completion</div>
                  </div>
                </div>
                {/* pts bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 3 }}>
                    <span>Points earned</span><span>{a.totalPts} pts</span>
                  </div>
                  <div style={{ height: 6, background: "#0f172a", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: "linear-gradient(90deg, #6366f1, #a855f7)", width: `${(a.totalPts / maxActivityPts) * 100}%`, transition: "width .5s" }} />
                  </div>
                </div>
                {/* completion rate bar */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#475569", marginBottom: 3 }}>
                    <span>Completion rate</span><span>{a.completionRate}%</span>
                  </div>
                  <div style={{ height: 6, background: "#0f172a", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 99, background: a.completionRate >= 80 ? "#22c55e" : a.completionRate >= 50 ? "#eab308" : "#f97316", width: `${a.completionRate}%`, transition: "width .5s" }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === "history" && (
          <>
            <div style={s.sectionTitle}>Browse History</div>
            <input type="date" style={s.dateInput} value={historyDate} max={todayKey} onChange={e => setHistoryDate(e.target.value)} />
            <div style={{ ...s.scoreCard, marginBottom: 16 }}>
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4 }}>
                {new Date(historyDate + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
              </div>
              <div style={{ ...s.bigScore, color: "#6366f1" }}>{histScore}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>points earned · {histDoneActivities.length + histDoneTasks.length} activities</div>
            </div>
            {histDoneActivities.length === 0 && histDoneTasks.length === 0
              ? <div style={s.emptyState}>😴 No activities logged on this day</div>
              : <>
                  {histDoneActivities.map(a => {
                    const v = getLogValue(histLog, a);
                    const pts = a.type === "counter" ? v * a.score : a.score;
                    return (
                      <div key={a.id} style={s.histCard}>
                        <span style={{ fontSize: 24 }}>{a.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                          {a.type === "counter" && <div style={{ fontSize: 12, color: "#64748b" }}>{v}× done</div>}
                        </div>
                        <div style={{ color: "#818cf8", fontWeight: 700 }}>+{pts}</div>
                      </div>
                    );
                  })}
                  {histDoneTasks.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "12px 0 8px" }}>⚡ One-time Tasks</div>
                      {histDoneTasks.map(t => (
                        <div key={t.id} style={{ ...s.histCard, border: "1px solid #f59e0b33" }}>
                          <span style={{ fontSize: 24 }}>{t.icon}</span>
                          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div></div>
                          <div style={{ color: "#f59e0b", fontWeight: 700 }}>+{t.score}</div>
                        </div>
                      ))}
                    </>
                  )}
                </>
            }
          </>
        )}

        {tab === "manage" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={s.sectionTitle}>My Activities</div>
              <button style={s.btn()} onClick={() => { resetForm(); setFormMode("activity"); setShowAddForm(v => !v); }}>
                {showAddForm ? "Cancel" : "+ Add"}
              </button>
            </div>

            {showAddForm && (
              <div style={s.formCard}>
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button style={s.modePill(formMode === "activity", false)} onClick={() => { setFormMode("activity"); resetForm(); }}>🔁 Daily Activity</button>
                  <button style={s.modePill(formMode === "task", true)} onClick={() => { setFormMode("task"); resetForm(); }}>⚡ One-time Task</button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, color: "#e2e8f0" }}>
                  {editingId ? "Edit Activity" : formMode === "task" ? "New One-time Task" : "New Daily Activity"}
                </div>
                <input style={s.input} placeholder="Name" value={newName} onChange={e => setNewName(e.target.value)} />
                <div style={{ margin: "10px 0", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: "#94a3b8" }}>Score:</span>
                  {[1,2,3,5,8].map(n => (
                    <button key={n} style={{ ...s.btn(newScore===n?"":"ghost"), padding: "5px 10px", fontSize: 13 }} onClick={() => setNewScore(n)}>{n}</button>
                  ))}
                </div>
                {formMode === "activity" && (
                  <div style={{ margin: "10px 0" }}>
                    <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8 }}>Type:</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button style={s.typePill(newType === "toggle")} onClick={() => setNewType("toggle")}>✓ Once a day</button>
                      <button style={s.typePill(newType === "counter")} onClick={() => setNewType("counter")}>🔢 Counter</button>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 4, marginTop: 8 }}>Icon:</div>
                <div style={s.iconGrid}>
                  {ICONS.map(ic => <button key={ic} style={s.iconBtn(newIcon===ic)} onClick={() => setNewIcon(ic)}>{ic}</button>)}
                </div>
                <button style={{ ...s.btn(formMode === "task" ? "amber" : ""), marginTop: 14, width: "100%" }} onClick={addItem}>
                  {editingId ? "Save Changes" : formMode === "task" ? "Add Task" : "Add Activity"}
                </button>
              </div>
            )}

            <div style={{ fontSize: 12, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🔁 Daily Activities</div>
            {activities.map(a => (
              <div key={a.id} style={s.actRow}>
                <span style={{ fontSize: 22 }}>{a.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{a.name}</div>
                  <div style={{ fontSize: 12, display: "flex", gap: 8, marginTop: 2 }}>
                    <span style={{ color: "#6366f1", fontWeight: 600 }}>{a.score} pts</span>
                    <span style={{ color: "#475569" }}>·</span>
                    <span style={{ color: "#475569" }}>{a.type === "counter" ? "🔢 Counter" : "✓ Toggle"}</span>
                  </div>
                </div>
                <button style={s.btn("ghost")} onClick={() => startEdit(a)}>✏️</button>
                <button style={s.btn("danger")} onClick={() => deleteActivity(a.id)}>✕</button>
              </div>
            ))}

            {pendingTasks.length > 0 && (
              <>
                <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, margin: "16px 0 8px" }}>⚡ Pending One-time Tasks</div>
                {pendingTasks.map(t => (
                  <div key={t.id} style={{ ...s.actRow, border: "1px solid #f59e0b33" }}>
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t.name}</div>
                      <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>{t.score} pts</div>
                    </div>
                    <button style={s.btn("danger")} onClick={() => deleteTask(t.id)}>✕</button>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* Sticky footer */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#0f172a", borderTop: "1px solid #1e293b", zIndex: 20 }}>
        {showRewardPanel && (
          <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "14px 16px", maxHeight: 260, overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#e2e8f0" }}>🎁 Reward History</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Threshold:</span>
                {[10, 25, 50, 100].map(n => (
                  <button key={n} onClick={() => updateThreshold(n)}
                    style={{ padding: "3px 8px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: rewardThreshold === n ? "#6366f1" : "#1e293b", color: rewardThreshold === n ? "#fff" : "#64748b" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {rewardHistory.length === 0
              ? <div style={{ fontSize: 13, color: "#475569", textAlign: "center", padding: "12px 0" }}>No rewards claimed yet</div>
              : [...rewardHistory].reverse().map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #1e293b" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 16 }}>🎁</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Reward claimed</div>
                        <div style={{ fontSize: 11, color: "#475569" }}>{new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</div>
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
            <div style={{ fontSize: 11, color: "#475569", fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, display: "flex", alignItems: "center", gap: 4 }}>
              Total Score <span style={{ fontSize: 10 }}>{showRewardPanel ? "▼" : "▲"}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: canClaim ? "#a855f7" : "#6366f1", lineHeight: 1.2 }}>
              {netScore} <span style={{ fontSize: 13, color: "#475569", fontWeight: 500 }}>pts</span>
            </div>
          </div>
          <button disabled={!canClaim} onClick={claimReward}
            style={{ padding: "10px 20px", borderRadius: 12, border: "none", cursor: canClaim ? "pointer" : "not-allowed", fontWeight: 700, fontSize: 14, background: canClaim ? "linear-gradient(135deg, #7c3aed, #a855f7)" : "#1e293b", color: canClaim ? "#fff" : "#475569", boxShadow: canClaim ? "0 0 16px #a855f740" : "none", transition: "all .3s" }}>
            🎁 Claim Reward
            <div style={{ fontSize: 10, fontWeight: 500, opacity: 0.8, marginTop: 1 }}>{canClaim ? `−${rewardThreshold} pts` : `need ${rewardThreshold - netScore} more`}</div>
          </button>
        </div>
      </div>
      <div style={{ height: 72 }} />
    </div>
  );
}