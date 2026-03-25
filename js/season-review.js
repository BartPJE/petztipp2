(async function init() {
  const players = await loadJSON("data/players.json");
  const playersBySlug = Object.fromEntries(players.map(p => [p.slug, p]));
  const gamesIndex = await loadJSON("data/games_index.json");
  const games = await loadAllGamesWithMatchdays(gamesIndex);

  const sorted = [...games].sort((a, b) => (a.start || "").localeCompare(b.start || ""));

  const rows = sorted.map(g => {
    const podium = (getOverallFromGame(g) || []).filter(r => r.rank <= 3).sort((a,b) => a.rank - b.rank);
    const winner = playersBySlug[podium[0]?.player]?.name || "-";
    const second = playersBySlug[podium[1]?.player]?.name || "-";
    const third = playersBySlug[podium[2]?.player]?.name || "-";

    return `
      <tr class="row">
        <td><a href="${linkGame(g.id)}"><b>${escapeHtml(g.title || g.id)}</b></a><div class="small">${escapeHtml(g.competition || "")} · ${escapeHtml(g.season || "")}</div></td>
        <td>${escapeHtml(winner)}</td>
        <td>${escapeHtml(second)}</td>
        <td>${escapeHtml(third)}</td>
      </tr>
    `;
  }).join("");

  document.getElementById("seasonReview").innerHTML = renderTable(rows, ["Tippspiel", "🥇", "🥈", "🥉"]);
})();
