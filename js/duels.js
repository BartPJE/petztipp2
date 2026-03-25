let players = [], gamesIndex = [], games = [];

function duelStats(a, b) {
  let winsA = 0, winsB = 0, ties = 0, total = 0;

  for (const g of games) {
    const overall = getOverallFromGame(g) || [];
    const rowA = overall.find(r => r.player === a);
    const rowB = overall.find(r => r.player === b);
    if (!rowA || !rowB) continue;

    total += 1;
    if (rowA.rank < rowB.rank) winsA += 1;
    else if (rowB.rank < rowA.rank) winsB += 1;
    else ties += 1;
  }

  return { winsA, winsB, ties, total };
}

function renderDuel() {
  const a = document.getElementById("duelA").value;
  const b = document.getElementById("duelB").value;
  const resultEl = document.getElementById("duelResult");

  if (!a || !b || a === b) {
    resultEl.innerHTML = '<div class="small">Bitte zwei unterschiedliche Spieler auswählen.</div>';
    return;
  }

  const pa = players.find(p => p.slug === a);
  const pb = players.find(p => p.slug === b);
  const s = duelStats(a, b);

  resultEl.innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${s.total}</b><span>Verglichene Tippspiele</span></div>
      <div class="kpi"><b>${s.winsA}</b><span>${escapeHtml(pa?.name || a)} vorne</span></div>
      <div class="kpi"><b>${s.winsB}</b><span>${escapeHtml(pb?.name || b)} vorne</span></div>
      <div class="kpi"><b>${s.ties}</b><span>Gleichstände</span></div>
    </div>
  `;
}

(async function init() {
  players = await loadJSON("data/players.json");
  gamesIndex = await loadJSON("data/games_index.json");
  games = await loadAllGamesWithMatchdays(gamesIndex);

  const opts = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(p => `<option value="${escapeHtml(p.slug)}">${escapeHtml(p.name)}</option>`)
    .join("");

  document.getElementById("duelA").innerHTML = `<option value="">-- auswählen --</option>${opts}`;
  document.getElementById("duelB").innerHTML = `<option value="">-- auswählen --</option>${opts}`;

  document.getElementById("duelA").addEventListener("change", renderDuel);
  document.getElementById("duelB").addEventListener("change", renderDuel);
})();
