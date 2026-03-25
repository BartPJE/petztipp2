(async function init() {
  const players = await loadJSON("data/players.json");
  const bySlug = Object.fromEntries(players.map(p => [p.slug, p]));
  const gamesIndex = await loadJSON("data/games_index.json");
  const games = await loadAllGamesWithMatchdays(gamesIndex);

  const acc = {};
  for (const p of players) {
    acc[p.slug] = { points: 0, titles: 0, slug: p.slug };
  }

  for (const g of games) {
    const overall = getOverallFromGame(g) || [];
    for (const r of overall) {
      if (!acc[r.player]) continue;
      acc[r.player].points += Number(r.points || 0);
      if (r.rank === 1) acc[r.player].titles += 1;
    }
  }

  const arr = Object.values(acc).filter(x => x.points > 0);
  const bestPoints = [...arr].sort((a, b) => b.points - a.points)[0];
  const bestTitles = [...arr].sort((a, b) => b.titles - a.titles)[0];

  document.getElementById("awards").innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${escapeHtml(bySlug[bestPoints?.slug]?.name || "-")}</b><span>Meiste Gesamtpunkte (${bestPoints?.points || 0})</span></div>
      <div class="kpi"><b>${escapeHtml(bySlug[bestTitles?.slug]?.name || "-")}</b><span>Meiste Titel (${bestTitles?.titles || 0})</span></div>
      <div class="kpi"><b>${games.length}</b><span>Ausgewertete Tippspiele</span></div>
      <div class="kpi"><b>${arr.length}</b><span>Gewertete Spieler</span></div>
    </div>
  `;
})();
