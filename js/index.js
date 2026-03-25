let players = [], gamesIndex = [];

// --- helpers for points ---
function n(x){ const v = Number(x); return Number.isFinite(v) ? v : 0; }
function tipDayPoints(tip){
  // AE + AI
  return n(tip?.points) + n(tip?.bonus);
}

function computeAll(players, games) {
  const acc = {};
  for (const p of players) {
    acc[p.slug] = {
      slug: p.slug,
      name: p.name,
      nickname: p.nickname,
      home: p.home,
      photo: p.photo,

      titles: 0,
      medals: 0,
      gold: 0,
      silver: 0,
      bronze: 0,

      totalPoints: 0,    // Summe (AE + AI) über alle Spieltage
      matchdays: 0,      // Anzahl Spieltage mit Tip
      participations: 0, // Anzahl Tippspiele (Saisons/Wettbewerbe) mit Teilnahme

      avg: 0
    };
  }

  for (const g of games) {
    // Teilnahme (wer irgendwo in einem Spieltag getippt hat)
    const set = new Set();
    for (const md of (g.matchdays || [])) {
      for (const t of (md.tips || [])) set.add(t.player);
    }
    for (const slug of set) {
      if (acc[slug]) acc[slug].participations++;
    }

    // Punkte + Spieltage
    for (const md of (g.matchdays || [])) {
      for (const tip of (md.tips || [])) {
        const a = acc[tip.player];
        if (!a) continue;
        a.totalPoints += tipDayPoints(tip);   // <-- Bonus wird hier sauber mitgerechnet
        a.matchdays += 1;
      }
    }

    // Medaillen / Titel: über dein vorhandenes overall
    // (sollte bei dir über totals / kumulierte Punkte korrekt sein)
    const overall = getOverallFromGame(g) || [];
    for (const r of overall) {
      const a = acc[r.player];
      if (!a) continue;

      if (r.rank === 1) { a.gold++; a.titles++; a.medals++; }
      else if (r.rank === 2) { a.silver++; a.medals++; }
      else if (r.rank === 3) { a.bronze++; a.medals++; }
    }
  }

  // Derived stats
  for (const slug in acc) {
    const a = acc[slug];
    const denom = Math.max(1, a.matchdays);
    a.avg = a.totalPoints / denom; // Punkte / Spieltag (inkl. Bonus)
  }

  return Object.values(acc)
    .filter(x => x.participations > 0)
    .sort((a, b) =>
      (b.titles - a.titles) ||
      (b.medals - a.medals) ||
      (b.totalPoints - a.totalPoints) ||
      (b.avg - a.avg) ||
      a.name.localeCompare(b.name)
    );
}

function renderKpis(players, gamesIndex) {
  const startYears = gamesIndex
    .map(g => Number(String(g.season || "").slice(0, 4)))
    .filter(Boolean);

  const endYears = gamesIndex
    .map(g => {
      const s = String(g.season || "");
      const parts = s.split("/");
      return Number(parts[1] || parts[0]);
    })
    .filter(Boolean);

  const start = startYears.length ? Math.min(...startYears) : null;
  const end = endYears.length ? Math.max(...endYears) : null;

  const range = start && end ? `${start}–${end}` : "—";
  const comps = new Set(gamesIndex.map(g => g.competition)).size;

  return `
    <div class="kpi"><b>${players.length}</b><span>Spieler</span></div>
    <div class="kpi"><b>${range}</b><span>Zeitraum</span></div>
    <div class="kpi"><b>${gamesIndex.length}</b><span>Tippspiele</span></div>
    <div class="kpi"><b>${comps}</b><span>Wettbewerbe</span></div>
  `;
}

function renderLeaderboard(allStats, maxRows = 10) {
  const top = allStats.slice(0, maxRows);
  const maxTotal = Math.max(1, ...top.map(x => x.totalPoints || 0)); // Skala für Form-Bar

  const rows = top.map((s, idx) => {
    const formPct = Math.round(Math.min(1, (s.totalPoints || 0) / maxTotal) * 100);

    return `
      <tr class="row">
        <td>${idx + 1}</td>

        <td>
          <div class="person">
            <img class="avatar" src="${escapeHtml(s.photo)}" alt="">
            <div>
              <a href="${linkPlayer(s.slug)}"><b>${escapeHtml(s.name)}</b></a>
              <div class="small">${getFlag(s.home)}</div>
            </div>
          </div>
        </td>

        <td>
          <div style="display:flex; gap:8px; flex-wrap:nowrap">
            <span class="pill miniPill good">${s.gold}🥇</span>
            <span class="pill miniPill neutral">${s.silver}🥈</span>
            <span class="pill miniPill neutral">${s.bronze}🥉</span>
          </div>
        </td>

        <td>
          <span class="pill smallPill ${s.avg >= 6 ? 'good' : 'neutral'}">
            ${Number.isFinite(s.avg) ? s.avg.toFixed(2) : "0.00"}
          </span>
        </td>


        <td><span class="pill smallPill neutral">${s.participations}×</span></td>
      </tr>
    `;
  }).join("");

  return renderTable(rows, ["#", "Spieler", "Podium", "Pkt./SpT.", "Teiln."]);
}

function renderGamesList(filter = "") {
  const f = filter.trim().toLowerCase();
const allItems = [...gamesIndex]
  .filter(g => !f || `${g.title} ${g.competition} ${g.season}`.toLowerCase().includes(f))
  .sort((a, b) => {
    const as = parseISODate(a.start)?.getTime() ?? 0;
    const bs = parseISODate(b.start)?.getTime() ?? 0;
    return bs - as;
  });

// ohne Suche nur die letzten 7, mit Suche alle Treffer
const items = f ? allItems : allItems.slice(0, 7);

  const html = items.map(g => `
    <div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
        <div>
          <a href="${linkGame(g.id)}"><b>${escapeHtml(g.title)}</b></a>
          <div class="small">${escapeHtml(g.competition)} · ${escapeHtml(g.season)}</div>
        </div>
<div style="display:flex; gap:8px; flex-wrap:wrap">
  ${pill(g.competition, g.compShort)}
</div>
      </div>
    </div>
  `).join("");

  $("#gamesList").innerHTML = html || `<div class="small">Keine Tippspiele gefunden.</div>`;
}

function renderPlayersList(filter = "", eligibleSlugs = null) {
  const f = filter.trim().toLowerCase();
  const base = eligibleSlugs ? players.filter(p => eligibleSlugs.has(p.slug)) : players;

const allItems = base
  .filter(p => !f || `${p.name} ${p.nickname || ""}`.toLowerCase().includes(f))
  .sort((a, b) => a.name.localeCompare(b.name));

// ohne Suche nur 10 anzeigen, mit Suche alle Treffer
const items = f ? allItems : allItems.slice(0, 10);

  const html = items.map(p => `
    <div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
        <div class="person">
          <img class="avatar" src="${escapeHtml(p.photo)}" alt="">
          <div>
            <a href="${linkPlayer(p.slug)}"><b>${escapeHtml(p.name)}</b></a>
            <div class="small">${escapeHtml(p.nickname || "")}</div>
          </div>
        </div>
        <a class="pill good" href="${linkPlayer(p.slug)}">Profil</a>
      </div>
    </div>
  `).join("");

  const moreHint = (!f && allItems.length > 10)
  ? `<div class="small">Weitere Spieler über die Suche finden…</div>`
  : "";

  $("#playersList").innerHTML = html ? (html + moreHint) : `<div class="small">Keine Spieler gefunden.</div>`;
  applyImageFallbacks($("#playersList"));
}

(async function init() {
  players = await loadJSON("data/players.json");
  gamesIndex = await loadJSON("data/games_index.json");

  const games = await loadAllGamesWithMatchdays(gamesIndex);
  const allStats = computeAll(players, games);

  $("#kpis").innerHTML = renderKpis(players, gamesIndex);
  $("#leaderboard").innerHTML = renderLeaderboard(allStats, 10);

  // Nur Spieler zeigen, die wirklich teilgenommen haben
  const eligible = new Set(allStats.map(s => s.slug));

  // Quicklinks: neueste Tippspiele + Top-Spieler
  const q = [];
  const latest = [...gamesIndex]
    .sort((a, b) => {
  const as = parseISODate(a.start)?.getTime() ?? 0;
  const bs = parseISODate(b.start)?.getTime() ?? 0;
  return bs - as;
})
    .slice(0, 2);

  for (const g of latest) {
    q.push(`<div style="margin:10px 10px"><a class="pill" href="${linkGame(g.id)}">🎯 ${escapeHtml(g.title)}</a></div>`);
  }
  for (const p of allStats.slice(0, 3)) {
    q.push(`<div style="margin:10px 10px"><a class="pill" href="${linkPlayer(p.slug)}">👤 ${escapeHtml(p.name)}</a></div>`);
  }
  $("#quicklinks").innerHTML = q.join("");
  applyImageFallbacks($("#leaderboard"));

  renderGamesList("");
  renderPlayersList("", eligible);

  $("#gameFilter").addEventListener("input", e => renderGamesList(e.target.value));
  $("#playerFilter").addEventListener("input", e => renderPlayersList(e.target.value, eligible));
})();