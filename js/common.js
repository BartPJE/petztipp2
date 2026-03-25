const $ = (q) => document.querySelector(q);

let teams = [];
let teamsByKey = {};

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadJSON(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return await res.json();
}

async function loadTeams() {
  teams = await loadJSON("data/teams.json");
  teamsByKey = Object.fromEntries((teams || []).map(t => [t.key, t]));
}

function getTeam(teamKey) {
  return teamsByKey[teamKey] || null;
}

function getTeamName(teamKey, mode = "desktop") {
  const t = getTeam(teamKey);
  if (!t) return teamKey || "";

  if (mode === "mobile") return t.mobileName || t.shortName || t.name;
  if (mode === "short") return t.shortName || t.name;
  return t.displayName || t.name;
}

function getTeamLogo(teamKey) {
  const t = getTeam(teamKey);
  return t?.logo || "";
}

function teamLogoSrc(teamKey) {
  return getTeamLogo(teamKey);
}

function getParam(name) {
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("de-DE", { year: "numeric", month: "long", day: "2-digit" });
}

function fmt2(x) {
  const n = Number(x || 0);
  return n.toFixed(2);
}

function pill(text, cls = "neutral") {
  return `<span class="pill ${cls}">${escapeHtml(text)}</span>`;
}

function bar(pct) {
  const v = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="bar"><div style="width:${v}%"></div></div>`;
}

function renderTable(rowHtml, headers) {
  const th = headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");
  return `
    <div class="tableWrap">
      <table class="table">
        <thead><tr>${th}</tr></thead>
        <tbody>${rowHtml}</tbody>
      </table>
    </div>
  `;
}

function slugifyTeam(name) {
  if (!name) return "";

  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\./g, "")
    .replace(/'/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/bor\.\s*/g, "borussia-")
    .replace(/m['’]?gladbach/g, "moenchengladbach")
    .replace(/-/g, " ")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "");
}

function fallbackTeamLogoSrc(team) {
  return `img/teams/${slugifyTeam(team)}.svg`;
}

function linkGame(id) { return `game.html?id=${encodeURIComponent(id)}`; }
function linkPlayer(slug) { return `player.html?slug=${encodeURIComponent(slug)}`; }

function getFlag(home) {
  const map = {
    "Deutschland": "🇩🇪",
    "Vietnam": "🇻🇳",
    "USA": "🇺🇸",
    "Italien": "🇮🇹",
    "Ungarn": "🇭🇺",
    "Brasilien": "🇧🇷",
  };
  return map[home] || "🏳️";
}

function parseISODate(d) {
  if (!d || typeof d !== "string") return null;
  const x = new Date(`${d}T00:00:00`);
  return Number.isNaN(x.getTime()) ? null : x;
}

function fmtShortDate(iso) {
  const d = parseISODate(iso);
  if (!d) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = d.getFullYear();
  return `${dd}.${mm}.${yy}`;
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function gameStatus(g) {
  const t = parseISODate(todayISO());
  const s = parseISODate(g?.start);
  const e = parseISODate(g?.end);
  if (!s || !e) return "unknown";
  if (t < s) return "future";
  if (t > e) return "past";
  return "live";
}

function gameStatusBadge(g) {
  const st = gameStatus(g);
  if (st === "live") return `<span class="badge live">● LIVE</span>`;
  if (st === "future") return `<span class="badge future">⏳ KOMMT</span>`;
  if (st === "past") return `<span class="badge past">ARCHIV</span>`;
  return `<span class="badge past">?</span>`;
}



function applyImageFallbacks(root = document) {
  root.querySelectorAll('img.avatar').forEach(img => {
    img.loading = img.loading || "lazy";
    img.referrerPolicy = img.referrerPolicy || "no-referrer";
    img.addEventListener("error", () => {
      if (!img.dataset.fallbackApplied) {
        img.dataset.fallbackApplied = "1";
        img.src = "img/players/_default.png";
      }
    }, { once: true });
  });

  root.querySelectorAll('img.teamLogo').forEach(img => {
    img.loading = img.loading || "lazy";
    img.addEventListener("error", () => {
      img.style.display = "none";
    }, { once: true });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  applyImageFallbacks();
});

async function loadGameWithMatchdays(id) {
  const game = await loadJSON(`data/game_${id}.json`);

  if (!Array.isArray(game.matchdays)) {
    game.matchdays = [];
    return game;
  }

  const hydratedMatchdays = await Promise.all(
    game.matchdays.map(async (md) => {
      if (!md?.file) return md;
      const fullMd = await loadJSON(md.file);
      return { ...md, ...fullMd, _loaded: true };
    })
  );

  game.matchdays = hydratedMatchdays;
  return game;
}

function getOverallFromGame(game) {
  if (Array.isArray(game.overall) && game.overall.length) return game.overall;

  const last = (game.matchdays || []).slice(-1)[0];
  if (!last || !Array.isArray(last.tips)) return [];

  const rows = (last.tips || []).map(t => {
    const total = (t.total ?? null);
    const points = Number(t.points || 0);
    const bonus = Number(t.bonus || 0);
    return {
      player: t.player,
      points: total !== null ? Number(total) : points + bonus,
    };
  });

  rows.sort((a, b) => b.points - a.points);

  let rank = 0, lastPts = null;
  rows.forEach((r, i) => {
    if (lastPts === null || r.points !== lastPts) rank = i + 1;
    r.rank = rank;
    lastPts = r.points;
  });

  return rows;
}

async function loadAllGamesWithMatchdays(gamesIndex) {
  return Promise.all((gamesIndex || []).map(g => loadGameWithMatchdays(g.id)));
}
