let players = [], playersBySlug = {}, gIndex = [], games = [];

const YEAR_WEIGHTS = [1, 0.6, 0.4, 0.2, 0.1];

function competitionWeight(comp) {
  const c = String(comp || "").trim().toLowerCase();

  if (c === "weltmeisterschaft" || c === "europameisterschaft") return 2;
  if (c === "bundesliga") return 1;
  if (c === "champions league" || c === "dfb pokal" || c === "europa league") return 0.3;
  if (c === "ligapokal") return 0.1;

  return 1;
}

function parseGermanOrIsoYear(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) return null;

  const firstPart = raw.split(" - ")[0].trim();

  let m = firstPart.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return Number(m[3]);

  m = firstPart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Number(m[1]);

  const d = parseISODate(firstPart);
  return d ? d.getFullYear() : null;
}

function parseMatchdayYear(md) {
  return parseGermanOrIsoYear(md?.date || md?.dateTo || "");
}

function parseMatchYear(match) {
  return parseGermanOrIsoYear(match?.date || "");
}

function hasRealTips(tip) {
  const hasPicks = tip?.picks && Object.keys(tip.picks).length > 0;
  const hasBonus = Number(tip?.bonus || 0) > 0;
  return !!(hasPicks || hasBonus);
}

function buildYearPool(games) {
  const years = new Set();

  for (const g of games) {
    for (const md of (g.matchdays || [])) {
      for (const m of (md.matches || [])) {
        const y = parseMatchYear(m);
        if (y) years.add(y);
      }

      const bonusYear = parseMatchdayYear(md);
      if (bonusYear) years.add(bonusYear);
    }
  }

  return [...years].sort((a, b) => b - a);
}

function computeRanking(baseYear) {
  const rawByPlayerYear = {};

  for (const p of players) {
    rawByPlayerYear[p.slug] = {};
  }

  for (const g of games) {
    const compFactor = competitionWeight(g.competition);

    for (const md of (g.matchdays || [])) {
      const matches = md.matches || [];
      const bonusYear = parseMatchdayYear(md);

      for (const tip of (md.tips || [])) {
        if (!hasRealTips(tip)) continue;
        if (!rawByPlayerYear[tip.player]) rawByPlayerYear[tip.player] = {};

        for (const match of matches) {
          const matchYear = parseMatchYear(match);
          if (!matchYear) continue;

          const pts = Number(tip?.pickPoints?.[match.id] || 0);
          if (!Number.isFinite(pts) || pts === 0) continue;

          rawByPlayerYear[tip.player][matchYear] =
            (rawByPlayerYear[tip.player][matchYear] || 0) + (pts * compFactor);
        }

        const bonus = Number(tip?.bonus || 0);
        if (bonusYear && Number.isFinite(bonus) && bonus !== 0) {
          rawByPlayerYear[tip.player][bonusYear] =
            (rawByPlayerYear[tip.player][bonusYear] || 0) + (bonus * compFactor);
        }
      }
    }
  }

  const yearsInWindow = YEAR_WEIGHTS.map((_, idx) => baseYear - idx);

  const rows = Object.keys(rawByPlayerYear).map(slug => {
    let total = 0;

    const breakdown = yearsInWindow.map((year, idx) => {
      const raw = Number(rawByPlayerYear[slug][year] || 0);
      const weighted = raw * YEAR_WEIGHTS[idx];
      total += weighted;

      return { year, raw, factor: YEAR_WEIGHTS[idx], weighted };
    });

    return { slug, total, breakdown };
  })
  .filter(r => r.breakdown.some(x => x.raw > 0))
  .sort((a, b) =>
    (b.total - a.total) ||
    ((playersBySlug[a.slug]?.name || a.slug).localeCompare(playersBySlug[b.slug]?.name || b.slug))
  );

  let rank = 0;
  let lastPoints = null;
  rows.forEach((r, idx) => {
    const key = r.total.toFixed(4);
    if (lastPoints === null || key !== lastPoints) rank = idx + 1;
    r.rank = rank;
    lastPoints = key;
  });

  return { rows, yearsInWindow };
}

function renderKpis(baseYear, rows, currentYearRows) {
  return `
    <div class="kpi"><b>${baseYear}</b><span>Wertungsjahr</span></div>
    <div class="kpi"><b>${rows.length}</b><span>Gewertete Spieler</span></div>
    <div class="kpi"><b>${currentYearRows}</b><span>Gewertete Spieler (Jahr)</span></div>
  `;
}

function renderRankingTable(rows, yearsInWindow) {
  const headerYears = yearsInWindow.map((year, idx) =>
    `<th class="wr-main-col-year-${idx + 1} wr-main-year-col">${year}</th>`
  ).join("");

  const tableRows = rows.map(r => {
    const p = playersBySlug[r.slug];

    const yearCells = r.breakdown.map((b, idx) => `
      <td class="wr-main-col-year-${idx + 1} wr-main-year-col">
        <div><b>${b.raw.toFixed(1)}</b></div>
        <div class="small">${b.weighted.toFixed(1)}</div>
      </td>
    `).join("");

    return `
      <tr class="row">
        <td class="wr-main-col-rank">${r.rank}</td>
        <td class="wr-main-col-player">
          <div class="person">
            <img class="avatar" src="${escapeHtml(p?.photo || "")}" alt="">
            <div class="worldranking-year-table-player-name">
              <a href="${linkPlayer(r.slug)}"><b>${escapeHtml(p?.name || r.slug)}</b></a>
              <div class="small">${escapeHtml(p?.nickname || "")}</div>
            </div>
          </div>
        </td>
        ${yearCells}
        <td class="wr-main-col-total">
          <span class="pill good">${r.total.toFixed(2)}</span>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="worldranking-main-table-wrap">
      <table class="worldranking-main-table">
        <thead>
          <tr>
            <th class="wr-main-col-rank">#</th>
            <th class="wr-main-col-player">Spieler</th>
            ${headerYears}
            <th class="wr-main-col-total">Gesamt</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderCurrentYearTable(rows, yearsInWindow) {
  const currentYear = yearsInWindow[0];

  const preparedRows = [...rows]
    // ❗ 1. 0 Punkte raus
    .filter(r => Number(r.breakdown?.[0]?.raw ?? 0) > 0)

    // ❗ 2. korrekt sortieren
    .sort((a, b) => {
      const aPoints = Number(a.breakdown?.[0]?.raw ?? 0);
      const bPoints = Number(b.breakdown?.[0]?.raw ?? 0);
      return bPoints - aPoints;
    })

    // ❗ 3. Ränge neu vergeben
    .map((r, i) => ({ ...r, rank: i + 1 }));

  const tableRows = preparedRows.map(r => {
    const p = playersBySlug[r.slug];
    const current = r.breakdown?.[0] || { raw: 0 };

    return `
      <tr class="row">
        <td class="wr-year-col-rank">${r.rank}</td>
        <td class="wr-year-col-player">
          <div class="person">
            <img class="avatar" src="${escapeHtml(p?.photo || "")}" alt="">
            <div>
              <a href="${linkPlayer(r.slug)}"><b>${escapeHtml(p?.name || r.slug)}</b></a>
              <div class="small">${escapeHtml(p?.nickname || "")}</div>
            </div>
          </div>
        </td>
        <td class="wr-year-col-points">
          <span class="pill green">${current.raw.toFixed(1)}</span>
        </td>
      </tr>
    `;
  }).join("");

  return `
    <div class="worldranking-year-table-wrap">
      <table class="worldranking-year-table">
        <thead>
          <tr>
            <th class="wr-year-col-rank">#</th>
            <th class="wr-year-col-player">Spieler</th>
            <th class="wr-year-col-points">${currentYear}</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}
function renderYearOptions(years, selectedYear) {
  $("#rankingYear").innerHTML = years.map(y => `
    <option value="${y}"${y === selectedYear ? " selected" : ""}>${y}</option>
  `).join("");
}

function renderAll(selectedYear) {
  const { rows, yearsInWindow } = computeRanking(selectedYear);

    // 👉 Anzahl Spieler mit Punkten im aktuellen Jahr
  const currentYearCount = rows.filter(r => 
    Number(r.breakdown?.[0]?.raw ?? 0) > 0
  ).length;

  $("#rankingKpis").innerHTML = renderKpis(selectedYear, rows, currentYearCount);
/*  $("#rankingMeta").textContent =
    `<Wertung: ${yearsInWindow[0]} × 1.0, ${yearsInWindow[1]} × 0.6, ${yearsInWindow[2]} × 0.4, ${yearsInWindow[3]} × 0.2, ${yearsInWindow[4]} × 0.1`;
*/
  $("#rankingYearTitle").textContent = `Jahrestabelle ${yearsInWindow[0]}`;
  $("#rankingYearMeta").textContent = "Nur die Rohpunkte aus dem aktuellen Wertungsjahr.";

  $("#rankingTable").innerHTML = renderRankingTable(rows, yearsInWindow);
  $("#rankingYearTable").innerHTML = renderCurrentYearTable(rows, yearsInWindow);
}

(async function init() {
  players = await loadJSON("data/players.json");
  playersBySlug = Object.fromEntries(players.map(p => [p.slug, p]));
  gIndex = await loadJSON("data/games_index.json");
  games = await loadAllGamesWithMatchdays(gIndex);

  const years = buildYearPool(games);
  const selectedYear = Number(getParam("year")) || years[0];

  renderYearOptions(years, selectedYear);
  renderAll(selectedYear);

  $("#rankingYear").addEventListener("change", (e) => {
    const y = Number(e.target.value);
    const url = new URL(window.location.href);
    url.searchParams.set("year", y);
    history.replaceState({}, "", url);
    renderAll(y);
  });
})();
