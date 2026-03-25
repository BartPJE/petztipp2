(async function init() {
  const gamesIndex = await loadJSON("data/games_index.json");
  const sorted = [...gamesIndex].sort((a, b) => (b.start || "").localeCompare(a.start || ""));

  const rows = sorted.map(g => `
    <tr class="row">
      <td><a href="${linkGame(g.id)}"><b>${escapeHtml(g.title || g.id)}</b></a><div class="small">${escapeHtml(g.competition || "")} · ${escapeHtml(g.season || "")}</div></td>
      <td>${fmtShortDate(g.start)} – ${fmtShortDate(g.end)}</td>
      <td>${gameStatusBadge(g)}</td>
    </tr>
  `).join("");

  document.getElementById("liveRace").innerHTML = renderTable(rows, ["Tippspiel", "Zeitraum", "Status"]);
})();
