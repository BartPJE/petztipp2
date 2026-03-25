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
  const topPoints = [...arr].sort((a, b) => b.points - a.points).slice(0, 5);
  const topTitles = [...arr].sort((a, b) => b.titles - a.titles).slice(0, 5);

  const listRows = (rows, key) => rows.map(r => {
    const p = bySlug[r.slug];
    return `
      <div class="featureCard">
        <div class="person">
          <img class="avatar" src="${escapeHtml(p?.photo || "")}" alt="">
          <div><b>${escapeHtml(p?.name || r.slug)}</b></div>
        </div>
        <span class="pill">${r[key]}</span>
      </div>
    `;
  }).join("");

  document.getElementById("awards").innerHTML = `
    <div class="kpis">
      <div class="kpi"><b>${escapeHtml(bySlug[bestPoints?.slug]?.name || "-")}</b><span>Meiste Gesamtpunkte (${bestPoints?.points || 0})</span></div>
      <div class="kpi"><b>${escapeHtml(bySlug[bestTitles?.slug]?.name || "-")}</b><span>Meiste Titel (${bestTitles?.titles || 0})</span></div>
      <div class="kpi"><b>${games.length}</b><span>Ausgewertete Tippspiele</span></div>
      <div class="kpi"><b>${arr.length}</b><span>Gewertete Spieler</span></div>
    </div>

    <div class="hr"></div>
    <h3>Top 5 nach Punkten</h3>
    <div class="featureGrid">${listRows(topPoints, "points")}</div>

    <div class="hr"></div>
    <h3>Top 5 nach Titeln</h3>
    <div class="featureGrid">${listRows(topTitles, "titles")}</div>
  `;
  applyImageFallbacks(document.getElementById("awards"));
})();
