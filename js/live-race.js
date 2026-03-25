(async function init() {
  const players = await loadJSON("data/players.json");
  const playersBySlug = Object.fromEntries(players.map(p => [p.slug, p]));
  const gamesIndex = await loadJSON("data/games_index.json");
  const games = await loadAllGamesWithMatchdays(gamesIndex);
  const gamesById = Object.fromEntries(games.map(g => [g.id, g]));
  const sorted = [...gamesIndex].sort((a, b) => (b.start || "").localeCompare(a.start || ""));

  const rows = sorted.map(g => `
    <tr class="row">
      <td><a href="${linkGame(g.id)}"><b>${escapeHtml(g.title || g.id)}</b></a><div class="small">${escapeHtml(g.competition || "")} · ${escapeHtml(g.season || "")}</div></td>
      <td>${fmtShortDate(g.start)} – ${fmtShortDate(g.end)}</td>
      <td>${(() => {
        const full = gamesById[g.id];
        const winnerSlug = (getOverallFromGame(full || g) || [])[0]?.player;
        const p = playersBySlug[winnerSlug];
        if (!p) return "-";
        return `<div class="person"><img class="avatar" src="${escapeHtml(p.photo || "")}" alt=""><div><b>${escapeHtml(p.name)}</b></div></div>`;
      })()}</td>
      <td>${gameStatusBadge(g)}</td>
    </tr>
  `).join("");

  document.getElementById("liveRace").innerHTML = renderTable(rows, ["Tippspiel", "Zeitraum", "Leader", "Status"]);
  applyImageFallbacks(document.getElementById("liveRace"));
})();
