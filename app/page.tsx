"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DICE_TYPES,
  RollMode,
  executeNotation,
  parseNotation,
  rollDice
} from "@/lib/dice";


interface ChatMsg {
  role: "user" | "ai";
  text: string;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const LS_KEY = "vdr_history_v1";

function loadLocal(): RollRecord[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RollRecord[];
  } catch {
    return [];
  }
}

export default function Home() {
  const [sides, setSides] = useState<number>(20);
  const [qty, setQty] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normal");
  const [note, setNote] = useState("");
  const [rolling, setRolling] = useState(false);
  const [current, setCurrent] = useState<RollRecord | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [custom, setCustom] = useState("2d6+3");
  const [customError, setCustomError] = useState("");
  const [history, setHistory] = useState<RollRecord[]>([]);
  const [search, setSearch] = useState("");
  const [filterSides, setFilterSides] = useState<string>("all");
  const [chat, setChat] = useState<ChatMsg[]>([
    {
      role: "ai",
      text: "Greetings, traveler! I am **Dice Master AI**. Ask me for roll recommendations, notation help, encounter ideas, or probability math."
    }
  ]);
  const [prompt, setPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const local = loadLocal();
      setHistory(local);
    })();
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(history.slice(0, 300)));
    } catch {
      /* ignore */
    }
  }, [history]);

  const persist = async (rec: any) => {
    setHistory((h) => [rec, ...h].slice(0, 300));
    try {
      const history = loadLocal();
      localStorage.setItem(LS_KEY, JSON.stringify([rec, ...history].slice(0, 300)));
    } catch {
      /* ignore */
    }
  };

  const animateAndSettle = (finalize: () => RollRecord) => {
    setRolling(true);
    setShakeKey((k) => k + 1);
    // shuffle preview
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCurrent((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          results: prev.results.map(() => 1 + Math.floor(Math.random() * sides)),
          total: 0
        } as RollRecord;
      });
    }, 90);
    setTimeout(() => {
      if (timer.current) clearInterval(timer.current);
      const rec = finalize();
      setCurrent(rec);
      persist(rec);
      setRolling(false);
    }, 650);
  };

  const doRoll = () => {
    if (rolling) return;
    // seed preview so animation has something to shuffle
    setCurrent({
      id: uid(),
      created_at: new Date().toISOString(),
      notation: `${qty}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ""}`,
      dice_type: sides,
      quantity: qty,
      results: rollDice(qty, sides),
      modifier,
      total: 0,
      mode,
      note
    });
    animateAndSettle(() => {
      let results: number[];
      let total: number;
      let notation = `${qty}d${sides}${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ""}`;
      if (sides === 20 && qty === 1 && mode !== "normal") {
        const [a, b] = rollDice(2, 20);
        const picked = mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
        results = [a, b];
        total = picked + modifier;
        notation = `1d20(${mode} ${a},${b}→${picked})${modifier ? (modifier > 0 ? `+${modifier}` : `${modifier}`) : ""}`;
      } else {
        results = rollDice(qty, sides);
        total = results.reduce((x, y) => x + y, 0) + modifier;
      }
      return {
        id: uid(),
        created_at: new Date().toISOString(),
        notation,
        dice_type: sides,
        quantity: qty,
        results,
        modifier,
        total,
        mode,
        note
      };
    });
  };

  const doReroll = () => {
    const rec = current;
    if (!rec || rec.mode === "custom") {
      // Re-run the custom notation if that's what was last shown
      if (rec?.mode === "custom") return doCustomRoll();
      return doRoll();
    }
    const rs = rec.dice_type ?? sides;
    const rq = rec.quantity ?? qty;
    const rm = rec.modifier ?? modifier;
    setSides(rs);
    setQty(Math.min(20, Math.max(1, rq)));
    setModifier(Math.max(-20, Math.min(20, rm)));
    setMode((rec.mode as RollMode) ?? "normal");
    // Roll explicitly with rec's params (avoids stale-state bug)
    if (rolling) return;
    setRolling(true);
    setShakeKey((k) => k + 1);
    setTimeout(() => {
      let results: number[];
      let total: number;
      let notation = `${rq}d${rs}${rm ? (rm > 0 ? `+${rm}` : `${rm}`) : ""}`;
      if (rs === 20 && rq === 1 && (rec.mode === "advantage" || rec.mode === "disadvantage")) {
        const [a, b] = rollDice(2, 20);
        const picked = rec.mode === "advantage" ? Math.max(a, b) : Math.min(a, b);
        results = [a, b];
        total = picked + rm;
        notation = `1d20(${rec.mode} ${a},${b}→${picked})${rm ? (rm > 0 ? `+${rm}` : `${rm}`) : ""}`;
      } else {
        results = rollDice(rq, rs);
        total = results.reduce((x, y) => x + y, 0) + rm;
      }
      const next: RollRecord = {
        id: uid(),
        created_at: new Date().toISOString(),
        notation,
        dice_type: rs,
        quantity: rq,
        results,
        modifier: rm,
        total,
        mode: rec.mode,
        note: rec.note
      };
      setCurrent(next);
      persist(next);
      setRolling(false);
    }, 650);
  };

  const doReset = () => {
    setSides(20);
    setQty(1);
    setModifier(0);
    setMode("normal");
    setNote("");
    setCurrent(null);
    setCustom("2d6+3");
    setCustomError("");
  };

  const doCustomRoll = () => {
    if (rolling) return;
    try {
      setCustomError("");
      const parsed = parseNotation(custom);
      // preview
      const preview = executeNotation(parsed);
      setCurrent({
        id: uid(),
        created_at: new Date().toISOString(),
        notation: preview.notation,
        dice_type: parsed.terms.length === 1 ? parsed.terms[0].sides : null,
        quantity: parsed.terms.reduce((a, t) => a + Math.abs(t.count), 0),
        results: preview.individual,
        modifier: 0,
        total: 0,
        mode: "custom",
        note
      });
      setRolling(true);
      setShakeKey((k) => k + 1);
      setTimeout(() => {
        const final = executeNotation(parsed);
        const rec: RollRecord = {
          id: uid(),
          created_at: new Date().toISOString(),
          notation: final.notation,
          dice_type: parsed.terms.length === 1 ? parsed.terms[0].sides : null,
          quantity: final.individual.length,
          results: final.individual,
          modifier: final.modifier,
          total: final.total,
          mode: "custom",
          note
        };
        setCurrent(rec);
        persist(rec);
        setRolling(false);
      }, 650);
    } catch (e) {
      setCustomError(e instanceof Error ? e.message : "Invalid notation");
    }
  };

  const stats = useMemo(() => {
    if (history.length === 0)
      return { count: 0, high: 0, low: 0, avg: 0, nat20: 0 };
    const totals = history.map((h) => h.total);
    return {
      count: history.length,
      high: Math.max(...totals),
      low: Math.min(...totals),
      avg: totals.reduce((a, b) => a + b, 0) / totals.length,
      nat20: history.filter((h) => h.results.includes(20)).length
    };
  }, [history]);

  const filtered = useMemo(
    () =>
      history.filter((h) => {
        const q = search.trim().toLowerCase();
        const okQ =
          !q ||
          h.notation.toLowerCase().includes(q) ||
          h.note.toLowerCase().includes(q) ||
          String(h.total).includes(q);
        const okS = filterSides === "all" || String(h.dice_type) === filterSides;
        return okQ && okS;
      }),
    [history, search, filterSides]
  );

  const exportCSV = () => {
    const rows = [
      ["id", "created_at", "notation", "dice_type", "quantity", "results", "modifier", "total", "mode", "note"],
      ...filtered.map((h) => [
        h.id,
        h.created_at,
        h.notation,
        String(h.dice_type ?? ""),
        String(h.quantity ?? ""),
        h.results.join("|"),
        String(h.modifier),
        String(h.total),
        h.mode,
        `"${(h.note ?? "").replace(/"/g, '""')}"`
      ])
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dice-history.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const clearHistory = async () => {
    if (!confirm("Clear all roll history?")) return;
    setHistory([]);
    try {
      localStorage.removeItem(LS_KEY);
    } catch { /* ignore */ }
  };

  const historySummary = useMemo(() => {
    if (!history.length) return "";
    const last = history.slice(0, 20);
    return `count=${history.length}, avg=${stats.avg.toFixed(1)}, high=${stats.high}, low=${stats.low}; recent: ${last
      .map((h) => `${h.notation}=${h.total}`)
      .join(", ")}`;
  }, [history, stats]);

  const askAI = async (text?: string) => {
    const q = (text ?? prompt).trim();
    if (!q || aiLoading) return;
    setPrompt("");
    setChat((c) => [...c, { role: "user", text: q }]);
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: q, historySummary })
      });
      const data = await res.json();
      setChat((c) => [
        ...c,
        { role: "ai", text: data.answer ?? data.error ?? "Something went wrong." }
      ]);
    } catch {
      setChat((c) => [...c, { role: "ai", text: "Network error talking to Dice Master AI." }]);
    } finally {
      setAiLoading(false);
    }
  };

  const crit = current && current.dice_type === 20 && current.results.includes(20);
  const fumble = current && current.dice_type === 20 && current.results.includes(1) && !rolling;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-8">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            🎲 Virtual Dice Roller <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">for Tabletop</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            D4–D100 • custom notation • history & stats • Dice Master AI •{" "}
            <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs">
● Local mode
</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportCSV}>⬇ Export CSV</button>
          <button className="btn-ghost" onClick={clearHistory}>🗑 Clear</button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Roller */}
        <section className="card p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold">🎯 Dice Roller Dashboard</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {DICE_TYPES.map((d) => (
              <button
                key={d}
                onClick={() => setSides(d)}
                className={`rounded-xl px-4 py-2 font-bold transition active:scale-95 ${
                  sides === d
                    ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-lg"
                    : "border border-white/15 bg-white/5 hover:bg-white/10"
                }`}
              >
                D{d}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">QUANTITY</span>
              <div className="mt-1 flex items-center gap-2">
                <button className="btn-ghost" onClick={() => setQty((q) => Math.max(1, q - 1))}>−</button>
                <span className="w-10 text-center text-xl font-black">{qty}</span>
                <button className="btn-ghost" onClick={() => setQty((q) => Math.min(20, q + 1))}>+</button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">MODIFIER</span>
              <div className="mt-1 flex items-center gap-2">
                <button className="btn-ghost" onClick={() => setModifier((m) => Math.max(-20, m - 1))}>−</button>
                <span className="w-10 text-center text-xl font-black">{modifier >= 0 ? `+${modifier}` : modifier}</span>
                <button className="btn-ghost" onClick={() => setModifier((m) => Math.min(20, m + 1))}>+</button>
              </div>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">D20 MODE</span>
              <div className="mt-1 flex gap-1">
                {(["normal", "advantage", "disadvantage"] as RollMode[]).map((m) => (
                  <button
                    key={m}
                    disabled={sides !== 20}
                    onClick={() => setMode(m)}
                    className={`rounded-lg px-2 py-2 text-xs font-bold capitalize transition ${
                      mode === m ? "bg-cyan-500 text-slate-950" : "border border-white/15 bg-white/5 hover:bg-white/10"
                    } disabled:opacity-30`}
                  >
                    {m === "normal" ? "Normal" : m === "advantage" ? "Adv ▲" : "Disadv ▼"}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <input
            className="input mt-4"
            placeholder="Session note (optional) — e.g. Boss fight round 3"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {/* Animated stage */}
          <div key={shakeKey} className={`mt-6 rounded-2xl border border-violet-500/30 bg-slate-900/70 p-6 text-center ${rolling ? "animate-shake" : ""}`}>
            {!current && !rolling && (
              <p className="py-8 text-slate-500">Pick your dice and smash <b>ROLL</b> ✨</p>
            )}
            {current && (
              <>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {current.results.map((v, i) => (
                    <div key={i} className={`dice-face h-16 w-16 text-2xl ${rolling ? "animate-shake" : "animate-pop"}`}>
                      {rolling ? "?" : v}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  {rolling ? (
                    <p className="animate-pulse text-lg font-bold text-violet-300">Rolling…</p>
                  ) : (
                    <>
                      <p className="text-sm text-slate-400">{current.notation}</p>
                      <p className="text-5xl font-black text-transparent bg-gradient-to-r from-amber-200 to-fuchsia-400 bg-clip-text">
                        {current.total}
                      </p>
                      {crit && <p className="mt-1 font-bold text-emerald-400">✨ CRITICAL! Nat 20!</p>}
                      {fumble && <p className="mt-1 font-bold text-red-400">💀 Fumble… Nat 1</p>}
                      {current.modifier !== 0 && (
                        <p className="text-xs text-slate-500">includes modifier {current.modifier >= 0 ? "+" : ""}{current.modifier}</p>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={doRoll} disabled={rolling} className="btn-primary flex-1 animate-glow">
              {rolling ? "🎲 Rolling…" : `🎲 ROLL ${qty}D${sides}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`}
            </button>
            <button onClick={doReroll} disabled={rolling || !current} className="btn-ghost">↻ Reroll</button>
            <button onClick={doReset} className="btn-ghost">Reset</button>
          </div>

          {/* Custom */}
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h3 className="text-sm font-bold text-slate-300">⚗️ Custom dice notation</h3>
            <div className="mt-2 flex gap-2">
              <input
                className="input font-mono"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doCustomRoll()}
                placeholder="e.g. 2d6+3"
              />
              <button onClick={doCustomRoll} disabled={rolling} className="btn-primary whitespace-nowrap">Roll</button>
            </div>
            {customError && <p className="mt-1 text-xs text-red-400">{customError}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {["2d6+3", "1d20+5", "4d8", "1d100", "8d6", "2d6+1d8+2"].map((ex) => (
                <button key={ex} onClick={() => { setCustom(ex); }} className="btn-ghost font-mono text-xs">{ex}</button>
              ))}
            </div>
          </div>
        </section>

        {/* Stats + AI */}
        <div className="flex flex-col gap-6">
          <section className="card p-6">
            <h2 className="mb-3 text-lg font-bold">📊 Statistics</h2>
            <div className="grid grid-cols-2 gap-2 text-center">
              {[
                ["Total rolls", stats.count],
                ["Average", stats.count ? stats.avg.toFixed(1) : "—"],
                ["Highest", stats.count ? stats.high : "—"],
                ["Lowest", stats.count ? stats.low : "—"]
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                  <p className="text-xl font-black">{v}</p>
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">Nat 20s rolled: {stats.nat20}</p>
          </section>

          <section className="card flex min-h-[420px] flex-1 flex-col p-6">
            <h2 className="mb-1 text-lg font-bold">🤖 Dice Master AI</h2>
            <p className="mb-3 text-xs text-slate-500">Powered by Gemini (server-side). Falls back to offline math when no key.</p>
            <div className="mb-3 flex max-h-64 flex-1 flex-col gap-2 overflow-y-auto">
              {chat.map((m, i) => (
                <div key={i} className={`whitespace-pre-wrap rounded-xl p-3 text-sm ${m.role === "user" ? "ml-6 bg-violet-600/30" : "mr-6 bg-white/5"}`}>
                  {m.text}
                </div>
              ))}
              {aiLoading && <p className="animate-pulse text-xs text-violet-300">Dice Master is thinking…</p>}
            </div>
            <div className="mb-2 flex flex-wrap gap-1">
              {["Explain 3d6+2", "Probability of 15+ on d20?", "Generate a tavern encounter", "I sneak past guards — what do I roll?"].map((s) => (
                <button key={s} onClick={() => askAI(s)} className="btn-ghost text-[11px]">{s}</button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                className="input"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && askAI()}
                placeholder="Ask Dice Master…"
              />
              <button onClick={() => askAI()} disabled={aiLoading} className="btn-primary px-4">➤</button>
            </div>
          </section>
        </div>
      </div>

      {/* History */}
      <section className="card mt-6 p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-lg font-bold">📜 Roll History ({filtered.length}/{history.length})</h2>
          <input className="input max-w-52" placeholder="🔍 Search notation, note…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input max-w-32" value={filterSides} onChange={(e) => setFilterSides(e.target.value)}>
            <option value="all">All dice</option>
            {DICE_TYPES.map((d) => <option key={d} value={String(d)}>D{d}</option>)}
          </select>
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">No rolls yet — your history will appear here.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="p-2">Time</th><th className="p-2">Notation</th><th className="p-2">Dice</th><th className="p-2">Modifier</th><th className="p-2">Total</th><th className="p-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((h) => (
                  <tr key={h.id} className="border-t border-white/5 hover:bg-white/5">
                    <td className="p-2 text-xs text-slate-400">{new Date(h.created_at).toLocaleString()}</td>
                    <td className="p-2 font-mono font-bold">{h.notation}</td>
                    <td className="p-2 text-xs">[{h.results.join(", ")}]</td>
                    <td className="p-2">{h.modifier >= 0 ? `+${h.modifier}` : h.modifier}</td>
                    <td className="p-2 text-lg font-black text-amber-300">{h.total}</td>
                    <td className="p-2 text-xs text-slate-400">{h.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-xs text-slate-600">
        Cryptographically secure RNG (crypto.getRandomValues / randomInt) • Local storage • Gemini via /api/ai • Deploy: push to Vercel + set env vars
      </footer>
    </main>
  );
}
