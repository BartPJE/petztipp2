let gamesIndex = [];

function normalizeGamesIndex(raw) {
  return Array.isArray(raw) ? raw : (raw?.games || []);
}

function competitionOptions(items) {
  const vals = [...new Set(items.map(g => g.competition).filter(Boolean))];
  return ["Alle", ...vals.sort((a, b) => a.localeCompare(b))];
}

function sortByStart(items) {
  return [...items].sort((a, b) => {
    const as = parseISODate(a.start)?.getTime() ?? 0;
    const bs = parseISODate(b.start)?.getTime() ?? 0;
    return as - bs;
  });
}

function renderGameCard(g) {
  const dates = (g.start && g.end) ? `${fmtShortDate(g.start)} – ${fmtShortDate(g.end)}` : "";
  return `
    <div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap">
        <div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
            <a href="${linkGame(g.id)}">${pill(g.competition || "", g.compShort)}</a>
            <a href="${linkGame(g.id)}">${pill(g.season || "", "neutral")}</a>
          </div>

          <div style="margin-top:8px">
            <a href="${linkGame(g.id)}"><b>${escapeHtml(g.title)}</b></a>
          </div>

          <div class="small" style="margin-top:6px">
            <a href="${linkGame(g.id)}">${escapeHtml(dates)}</a>
          </div>
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <a href="${linkGame(g.id)}">${pill("Öffnen", "good")}</a>
        </div>
      </div>
    </div>
  `;
}

function renderCards(items) {
  $("#gamesTimeline").innerHTML = "";
  $("#gamesList").innerHTML = items.map(renderGameCard).join("") || `<div class="small">Keine Tippspiele gefunden.</div>`;
}

function renderTimeline(items) {
  $("#gamesList").innerHTML = "";

  const groups = {};
  for (const g of items) {
    let year = "Unbekannt";

    if (g.season) {
      const parts = String(g.season).split("/");
      year = Number(parts[1] || parts[0]);
    } else {
      year = parseISODate(g.start)?.getFullYear() || "Unbekannt";
    }
    groups[year] ||= [];
    groups[year].push(g);
  }

  const years = Object.keys(groups).sort((a, b) => Number(a) - Number(b));

  const html = years.map(year => `
    <div class="card" style="margin:10px 0">
      <div class="bd">
        <div style="font-weight:800; font-size:18px; margin-bottom:10px">${escapeHtml(String(year))}</div>
        <div style="display:flex; flex-direction:column; gap:10px">
          ${groups[year].map(g => `
            <a href="${linkGame(g.id)}" style="text-decoration:none">
              <div style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
                <div>
<!--                  <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center">
                    ${gameStatusBadge(g)}
                    ${pill(g.competition || "", "neutral")}
                    ${pill(g.season || "", "neutral")}
                  </div>-->
                  <div style="margin-top:6px"><b>${escapeHtml(g.title)}</b></div>
                  <div class="small" style="margin-top:4px">${escapeHtml(fmtShortDate(g.start))} – ${escapeHtml(fmtShortDate(g.end))}</div>
                </div>
              </div>
            </a>
          `).join("")}
        </div>
      </div>
    </div>
  `).join("");

  $("#gamesTimeline").innerHTML = html || `<div class="small">Keine Tippspiele gefunden.</div>`;
}

function applyFilters() {
  const search = ($("#gameFilter")?.value || "").trim().toLowerCase();
  const comp = ($("#competitionFilter")?.value || "Alle");
  const mode = ($("#viewMode")?.value || "cards");

  let items = gamesIndex.filter(g => {
    const matchesText = !search || `${g.title} ${g.competition} ${g.season}`.toLowerCase().includes(search);
    const matchesComp = comp === "Alle" || g.competition === comp;
    return matchesText && matchesComp;
  });

  items = sortByStart(items);

  if ($("#countLabel")) {
    $("#countLabel").textContent = `${items.length} Tippspiele`;
  }

  if (mode === "timeline") renderTimeline(items);
  else renderCards(items);
}

(async function init() {
  const raw = await loadJSON("data/games_index.json");
  gamesIndex = normalizeGamesIndex(raw);

  const compEl = $("#competitionFilter");
  if (compEl) {
    compEl.innerHTML = competitionOptions(gamesIndex)
      .map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`)
      .join("");
  }

  applyFilters();

  $("#gameFilter")?.addEventListener("input", applyFilters);
  $("#competitionFilter")?.addEventListener("change", applyFilters);
  $("#viewMode")?.addEventListener("change", applyFilters);
})();