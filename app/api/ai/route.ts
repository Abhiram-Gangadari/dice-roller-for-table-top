import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { expectedValue, parseNotation, probabilityAtLeast } from "@/lib/dice";

export const runtime = "nodejs";

const SYSTEM = `You are Dice Master AI, an expert tabletop RPG assistant inside a Virtual Dice Roller app.
You can: (1) recommend dice combinations for scenarios, (2) explain notation like 3d6+2, (3) suggest balanced homebrew mechanics, (4) generate encounters/challenges/random events, (5) explain probabilities with correct math, (6) analyze roll history stats, (7) convert natural-language requests into concrete rolls (e.g. "sneak past guards" -> Stealth 1d20+4).
Always give the exact notation to roll, keep answers concise and beginner-friendly, use bullet points, never invent API details.`;

function offlineAnswer(prompt: string, history?: string): string {
  const p = prompt.toLowerCase();
  // Notation explanation
  const m = p.match(/(\d*)\s*d\s*(\d+)\s*([+-]\s*\d+)?/);
  if (p.includes("notation") || p.includes("explain") || p.includes("what does") || m) {
    try {
      const notation = (prompt.match(/\d*d\d+([+-]\d+)?/i) ?? ["1d20"])[0];
      const parsed = parseNotation(notation);
      const ev = parsed.terms.reduce(
        (a, t) => a + (Math.abs(t.count) * (t.sides + 1)) / 2,
        parsed.modifier
      );
      const min =
        parsed.terms.reduce((a, t) => a + Math.abs(t.count) * 1, 0) + Math.min(0, parsed.modifier);
      void min;
      const minTotal =
        parsed.terms.reduce((a, t) => a + Math.abs(t.count), 0) + parsed.modifier;
      const maxTotal =
        parsed.terms.reduce((a, t) => a + Math.abs(t.count) * t.sides, 0) + parsed.modifier;
      return `**${parsed.raw}** means:\n- ${parsed.terms
        .map((t) => `Roll ${Math.abs(t.count)} × d${t.sides} (each 1–${t.sides})`)
        .join("\n- ")}\n- Add modifier ${parsed.modifier >= 0 ? "+" : ""}${parsed.modifier}\n- Range: **${minTotal}–${maxTotal}**, average ≈ **${ev.toFixed(1)}**\n\nExample: roll it with the Custom Roll box as \`${notation}\`.`;
    } catch {
      /* fall through */
    }
  }
  if (p.includes("probab") || p.includes("chance") || p.includes("odds")) {
    const mm = p.match(/d\s*(\d+)/);
    const sides = mm ? parseInt(mm[1], 10) : 20;
    const t = (p.match(/(\d{1,3})\s*\+/) ?? [])[1];
    const target = t ? parseInt(t, 10) : 15;
    const single = probabilityAtLeast(1, Math.min(sides, 1000), Math.min(target, 1000));
    const ev = expectedValue(1, sides, 0);
    return `**Probability quick math (d${sides}):**\n- P(≥ ${target}) = ${(single * 100).toFixed(1)}%\n- P(nat 20 on d20) = 5%. With advantage ≈ 9.75%, crit-fail both ≈ 0.25%.\n- Average of 1d${sides} = ${ev.toFixed(2)}.\n\nTip: advantage ≈ +3 to +5 effective bonus. (Offline answer — add GEMINI_API_KEY for full AI.)`;
  }
  if (p.includes("encounter") || p.includes("challenge") || p.includes("event") || p.includes("quest")) {
    return `**Sample encounter: Goblin Toll Bridge (level 1–3)**\n- Hook: goblins demand 2d6 gp toll. Roll **1d20+2 Persuasion** to haggle (DC 13).\n- Twist (roll 1d6): 1-2 ambush, 3-4 bridge trap (DEX save 1d20+2 vs 12, fail = 1d6 damage), 5-6 friendly trader.\n- Reward: 3d10 gp + random trinket (1d100 table).\n\nWant another biome? Ask "generate a haunted forest encounter". (Offline answer.)`;
  }
  if (history) {
    return `Based on your recent rolls:\n${history}\n\nTip: large pools (e.g. 4d8) cluster near the average; single d20s stay swingy. For consistent damage use more dice, for swingy drama use one big die. (Offline answer — add GEMINI_API_KEY for deeper analysis.)`;
  }
  // Natural language -> roll
  if (p.includes("sneak") || p.includes("stealth")) return "Roll **Stealth: `1d20+4`** vs guard Passive Perception 12. Advantage if dark/foggy. (Offline answer.)";
  if (p.includes("attack") || p.includes("hit")) return "Roll **attack: `1d20+5`** vs AC. On hit roll damage, e.g. longsword `1d8+3` (×2 dice on crit). (Offline answer.)";
  if (p.includes("fireball") || p.includes("damage")) return "Fireball: **8d6** (avg 28, DEX save DC 15 for half). Single-target strike: **1d20+7** to hit, **2d6+4** damage. (Offline answer.)";
  return `I'm **Dice Master AI (offline mode)** — add a GEMINI_API_KEY on the server for full Gemini answers.\n\nI can still help:\n- Explain notation: try "explain 3d6+2"\n- Probability: try "probability of 15+ on d20"\n- Encounters: try "generate a tavern challenge"\n- Quick rolls: "I sneak past guards" → roll \`1d20+4\` stealth.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = (body?.prompt ?? "").toString().slice(0, 4000);
    const historySummary: string = (body?.historySummary ?? "").toString().slice(0, 4000);
    if (!prompt.trim()) return NextResponse.json({ error: "Empty prompt" }, { status: 400 });

    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      return NextResponse.json({ answer: offlineAnswer(prompt, historySummary), offline: true });
    }

    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const full = historySummary
      ? `${SYSTEM}\n\nUser roll-history summary:\n${historySummary}\n\nUser request: ${prompt}`
      : `${SYSTEM}\n\nUser request: ${prompt}`;
    const result = await model.generateContent(full);
    const answer = result.response.text();
    return NextResponse.json({ answer, offline: false });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "AI error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
