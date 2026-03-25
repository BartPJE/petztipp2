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
    <div class="featureGrid">
      <div class="featureCard">
        <div class="person">
          <img class="avatar" src="${escapeHtml(pa?.photo || "")}" alt="">
          <div><b>${escapeHtml(pa?.name || a)}</b><div class="small">Spieler A</div></div>
        </div>
        <span class="pill good">${s.winsA} Siege</span>
      </div>

      <div class="featureCard">
        <div class="person">
          <img class="avatar" src="${escapeHtml(pb?.photo || "")}" alt="">
          <div><b>${escapeHtml(pb?.name || b)}</b><div class="small">Spieler B</div></div>
        </div>
        <span class="pill good">${s.winsB} Siege</span>
      </div>

      <div class="featureCard">
        <b>${s.total}</b>
        <div class="small">Verglichene Tippspiele</div>
      </div>

      <div class="featureCard">
        <b>${s.ties}</b>
        <div class="small">Gleichstände</div>
      </div>
    </div>
  `;

  applyImageFallbacks(resultEl);
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
