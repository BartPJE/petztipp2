let players = [], playersBySlug = {}, gIndex = [], games = [];

let recentMatchdaysState = {
  slug: null,
  items: [],
  visibleCount: 5
};

function hasRealTips(tip) {
  return !!tip && tip.picks && Object.keys(tip.picks).length > 0;
}

function renderPerfectSeason(game) {
  const rows = computePerfectSeason(game);

  return `
    <table class="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Spieler</th>
          <th>Punkte (max)</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          const p = playersBySlug[r.player];
          return `
            <tr>
              <td>${r.rank}</td>
              <td>
                <div class="person">
                  <img class="avatar" src="${p?.photo || ""}">
                  <b>${p?.name || r.player}</b>
                </div>
              </td>
              <td style="text-align:right;">
                <span class="pill good">${r.points}</span>
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

function renderExpandableTable(items, headers, rowRenderer, opts = {}) {
  const initialCount = opts.initialCount || 5;
  const step = opts.step || initialCount;
  const tableId = opts.tableId || `tbl_${Math.random().toString(36).slice(2)}`;
  const controlsId = `${tableId}_controls`;

  if (!items.length) {
    return `<div class="small">Noch keine Daten vorhanden.</div>`;
  }

  const th = headers.map(h => `<th>${escapeHtml(h)}</th>`).join("");

  const rowsHtml = items
    .map((item, idx) => {
      const row = rowRenderer(item);
      if (idx >= initialCount) {
        return row.replace("<tr", '<tr style="display:none;" data-hidden-row="1"');
      }
      return row;
    })
    .join("");

  const hasMore = items.length > initialCount;

  return `
    <table class="table">
      <thead><tr>${th}</tr></thead>
      <tbody
        id="${tableId}"
        data-visible-count="${Math.min(initialCount, items.length)}"
        data-step="${step}"
        data-initial-count="${initialCount}"
      >
        ${rowsHtml}
      </tbody>
    </table>

    ${hasMore ? `
      <div id="${controlsId}" style="margin-top:10px; text-align:center; display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
        <button
          type="button"
          class="pill positive"
          style="cursor:pointer; color:#000000;"
          onclick="toggleExpandableTable('${tableId}', 'more')"
          data-action="more"
        >
          Mehr
        </button>

        <button
          type="button"
          class="pill neutral"
          style="cursor:pointer; display:none;"
          onclick="toggleExpandableTable('${tableId}', 'less')"
          data-action="less"
        >
          Weniger
        </button>
      </div>
    ` : ""}
  `;
}

function toggleExpandableTable(tableId, action) {
  const tbody = document.getElementById(tableId);
  if (!tbody) return;

  const controls = document.getElementById(`${tableId}_controls`);
  const rows = Array.from(tbody.querySelectorAll('tr[data-expand-row="1"]'));
  const initialCount = Number(tbody.dataset.initialCount || 5);
  const step = Number(tbody.dataset.step || 5);
  let visibleCount = Number(tbody.dataset.visibleCount || initialCount);

  if (action === "more") {
    visibleCount = Math.min(visibleCount + step, rows.length);
  } else if (action === "less") {
    visibleCount = initialCount;
  }

  rows.forEach((row, idx) => {
    if (idx < visibleCount) {
      row.style.setProperty("display", "", "important");
      row.style.removeProperty("display");
    } else {
      row.style.setProperty("display", "none", "important");
    }
  });

  tbody.dataset.visibleCount = String(visibleCount);

  if (controls) {
    const moreBtn = controls.querySelector('[data-action="more"]');
    const lessBtn = controls.querySelector('[data-action="less"]');

    if (moreBtn) {
      moreBtn.style.display = visibleCount < rows.length ? "" : "none";
    }

    if (lessBtn) {
      lessBtn.style.display = visibleCount > initialCount ? "" : "none";
    }
  }
}

function medalRow(label, m) {
  return `
    <div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
        <div><b>${escapeHtml(label)}</b></div>
        <div style="display:flex; gap:8px; flex-wrap:wrap">
          <span class="pill miniPill good">${m.gold}🥇</span>
          <span class="pill miniPill neutral">${m.silver}🥈</span>
          <span class="pill miniPill neutral">${m.bronze}🥉</span>
          <span class="pill miniPill neutral">${m.total}🏅</span>
        </div>
      </div>
    </div>
  `;
}

function computePlayer(slug) {
  const medalsByComp = {};
  const placements = [];

  let points = 0;
  let matchdays = 0;
  let participations = 0;
  let tippedMatches = 0;
  let dayWins = 0;
  let leaderCount = 0;

  let bestMatchdayPoints = -Infinity;
  let bestMatchdayCount = 0;
  let worstMatchdayPoints = Infinity;
  let worstMatchdayCount = 0;

  let longestDayWinStreak = 0;
  let currentDayWinStreak = 0;

  let bestSeasonPoints = -Infinity;
  let bestSeasonPointsGame = null;
  let worstSeasonPoints = Infinity;
  let worstSeasonPointsGame = null;

  let bestSeasonAvg = -Infinity;
  let bestSeasonAvgGame = null;
  let worstSeasonAvg = Infinity;
  let worstSeasonAvgGame = null;

  let mostDayWinsSeason = -Infinity;
  let mostDayWinsSeasonGame = null;
  let leastDayWinsSeason = Infinity;
  let leastDayWinsSeasonGame = null;

  let mostLeaderSeason = -Infinity;
  let mostLeaderSeasonGame = null;

  const seasonStats = [];

  function getDayWinValue(tip) {
    if (!tip) return 0;
    if (tip.dayWin === true) return 1;
    const n = Number(tip.dayWin || 0);
    return Number.isFinite(n) ? n : 0;
  }

  function getTipScore(tip) {
    return Number(tip?.points || 0) + Number(tip?.bonus || 0);
  }

  function computeOverallUntilInGame(matchdays, mdIndex) {
    const totals = {};

    for (let i = 0; i <= mdIndex; i++) {
      const md = matchdays[i];

      for (const tip of (md.tips || [])) {
        const hasPicks = tip.picks && Object.keys(tip.picks).length > 0;
        const hasBonus = Number(tip.bonus || 0) > 0;
        if (!hasPicks && !hasBonus) continue;

        const row = (totals[tip.player] ||= {
          player: tip.player,
          points: 0,
          dayWinsTotal: 0
        });

        row.points += getTipScore(tip);

        if (tip.dayWinsTotal !== undefined && tip.dayWinsTotal !== null && tip.dayWinsTotal !== "") {
          row.dayWinsTotal = Math.max(row.dayWinsTotal, Number(tip.dayWinsTotal || 0));
        } else {
          row.dayWinsTotal += getDayWinValue(tip);
        }
      }
    }

    const arr = Object.values(totals);

    arr.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if ((b.dayWinsTotal || 0) !== (a.dayWinsTotal || 0)) return (b.dayWinsTotal || 0) - (a.dayWinsTotal || 0);
      const an = playersBySlug[a.player]?.name || a.player;
      const bn = playersBySlug[b.player]?.name || b.player;
      return an.localeCompare(bn);
    });

    let rank = 0;
    let lastKey = null;
    arr.forEach((r, idx) => {
      const key = `${r.points}|${r.dayWinsTotal || 0}`;
      if (lastKey === null || key !== lastKey) rank = idx + 1;
      r.rank = rank;
      lastKey = key;
    });

    return arr;
  }

  for (const g of games) {
    let participated = false;
    let seasonPoints = 0;
    let seasonMatchdays = 0;
    let seasonTippedMatches = 0;
    let seasonDayWins = 0;
    let seasonLeaderCount = 0;

    for (let i = 0; i < (g.matchdays || []).length; i++) {
      const md = g.matchdays[i];
      const tip = (md.tips || []).find(x => x.player === slug);
      if (!hasRealTips(tip)) continue;

      participated = true;

      const mdPoints = getTipScore(tip);
      const mdDayWin = getDayWinValue(tip);
      const picksCount = Object.keys(tip.picks || {}).length;

      points += mdPoints;
      matchdays += 1;
      tippedMatches += picksCount;
      dayWins += mdDayWin;

      seasonPoints += mdPoints;
      seasonMatchdays += 1;
      seasonTippedMatches += picksCount;
      seasonDayWins += mdDayWin;

      if (mdPoints > bestMatchdayPoints) {
        bestMatchdayPoints = mdPoints;
        bestMatchdayCount = 1;
      } else if (mdPoints === bestMatchdayPoints) {
        bestMatchdayCount++;
      }

      if (mdPoints < worstMatchdayPoints) {
        worstMatchdayPoints = mdPoints;
        worstMatchdayCount = 1;
      } else if (mdPoints === worstMatchdayPoints) {
        worstMatchdayCount++;
      }

      if (mdDayWin > 0) {
        currentDayWinStreak += 1;
        if (currentDayWinStreak > longestDayWinStreak) longestDayWinStreak = currentDayWinStreak;
      } else {
        currentDayWinStreak = 0;
      }

      const overallAtMd = computeOverallUntilInGame(g.matchdays, i);
      const me = overallAtMd.find(x => x.player === slug);
      if (me && me.rank === 1) {
        leaderCount++;
        seasonLeaderCount++;
      }
    }

    if (participated) participations++;

    const row = getOverallFromGame(g).find(x => x.player === slug);
    if (row) {
      placements.push({
        gameId: g.id,
        title: g.title,
        comp: g.competition,
        season: g.season,
        rank: row.rank,
        points: row.points
      });

      const key = g.competition;
      medalsByComp[key] ||= { gold: 0, silver: 0, bronze: 0, total: 0 };
      if (row.rank === 1) medalsByComp[key].gold++;
      if (row.rank === 2) medalsByComp[key].silver++;
      if (row.rank === 3) medalsByComp[key].bronze++;
      if (row.rank <= 3) medalsByComp[key].total++;
    }

    if (seasonMatchdays > 0) {
      const seasonAvg = seasonPoints / seasonMatchdays;

      seasonStats.push({
        gameId: g.id,
        title: g.title,
        comp: g.competition,
        season: g.season,
        points: seasonPoints,
        avg: seasonAvg,
        dayWins: seasonDayWins,
        leaderCount: seasonLeaderCount,
        tippedMatches: seasonTippedMatches,
        matchdays: seasonMatchdays
      });

      if (seasonPoints > bestSeasonPoints) {
        bestSeasonPoints = seasonPoints;
        bestSeasonPointsGame = g;
      }
      if (seasonPoints < worstSeasonPoints) {
        worstSeasonPoints = seasonPoints;
        worstSeasonPointsGame = g;
      }

      if (seasonAvg > bestSeasonAvg) {
        bestSeasonAvg = seasonAvg;
        bestSeasonAvgGame = g;
      }
      if (seasonAvg < worstSeasonAvg) {
        worstSeasonAvg = seasonAvg;
        worstSeasonAvgGame = g;
      }

      if (seasonDayWins > mostDayWinsSeason) {
        mostDayWinsSeason = seasonDayWins;
        mostDayWinsSeasonGame = g;
      }
      if (seasonDayWins < leastDayWinsSeason) {
        leastDayWinsSeason = seasonDayWins;
        leastDayWinsSeasonGame = g;
      }

      if (seasonLeaderCount > mostLeaderSeason) {
        mostLeaderSeason = seasonLeaderCount;
        mostLeaderSeasonGame = g;
      }
    }
  }

  const total = { gold: 0, silver: 0, bronze: 0, total: 0 };
  for (const k in medalsByComp) {
    total.gold += medalsByComp[k].gold;
    total.silver += medalsByComp[k].silver;
    total.bronze += medalsByComp[k].bronze;
    total.total += medalsByComp[k].total;
  }

  const placementsByComp = {};
  for (const p of placements) {
    (placementsByComp[p.comp] ||= []).push(p);
  }

  const bestPlacementByComp = Object.entries(placementsByComp)
    .map(([comp, arr]) => {
      const sorted = [...arr].sort((a, b) =>
        (a.rank - b.rank) ||
        (b.points - a.points) ||
        (b.season || "").localeCompare(a.season || "")
      );
      return {
        comp,
        rank: sorted[0].rank,
        points: sorted[0].points,
        season: sorted[0].season,
        gameId: sorted[0].gameId,
        title: sorted[0].title
      };
    })
    .sort((a, b) =>
      (a.rank - b.rank) ||
      (b.points - a.points) ||
      a.comp.localeCompare(b.comp)
    );

  const favoriteCompetition = Object.entries(
    seasonStats.reduce((acc, s) => {
      acc[s.comp] ||= { comp: s.comp, seasons: 0, points: 0, matchdays: 0, dayWins: 0 };
      acc[s.comp].seasons += 1;
      acc[s.comp].points += Number(s.points || 0);
      acc[s.comp].matchdays += Number(s.matchdays || 0);
      acc[s.comp].dayWins += Number(s.dayWins || 0);
      return acc;
    }, {})
  )
    .map(([, v]) => ({
      ...v,
      avg: v.matchdays ? v.points / v.matchdays : 0
    }))
    .sort((a, b) =>
      (b.seasons - a.seasons) ||
      (b.points - a.points) ||
      a.comp.localeCompare(b.comp)
    )[0] || null;

  const bestGame = [...placements]
    .sort((a, b) =>
      (a.rank - b.rank) ||
      (b.points - a.points) ||
      (b.season || "").localeCompare(a.season || "")
    )[0] || null;

  const seasonHeatmap = [...seasonStats]
    .sort((a, b) => (a.season || "").localeCompare(b.season || ""))
    .map(s => ({
      gameId: s.gameId,
      title: s.title,
      comp: s.comp,
      season: s.season,
      points: s.points,
      avg: s.avg,
      dayWins: s.dayWins,
      leaderCount: s.leaderCount,
      matchdays: s.matchdays
    }));

  return {
    medalsByComp,
    total,
    placements,
    points,
    matchdays,
    participations,
    tippedMatches,
    avg: matchdays ? points / matchdays : 0,
    avgPerMatch: tippedMatches ? points / tippedMatches : 0,
    dayWins,
    bestMatchdayPoints: Number.isFinite(bestMatchdayPoints) ? bestMatchdayPoints : 0,
    bestMatchdayCount,
    worstMatchdayPoints: Number.isFinite(worstMatchdayPoints) ? worstMatchdayPoints : 0,
    worstMatchdayCount,
    bestSeasonPoints: Number.isFinite(bestSeasonPoints) ? bestSeasonPoints : 0,
    bestSeasonPointsGame,
    worstSeasonPoints: Number.isFinite(worstSeasonPoints) ? worstSeasonPoints : 0,
    worstSeasonPointsGame,
    bestSeasonAvg: Number.isFinite(bestSeasonAvg) ? bestSeasonAvg : 0,
    bestSeasonAvgGame,
    worstSeasonAvg: Number.isFinite(worstSeasonAvg) ? worstSeasonAvg : 0,
    worstSeasonAvgGame,
    mostDayWinsSeason: Number.isFinite(mostDayWinsSeason) ? mostDayWinsSeason : 0,
    mostDayWinsSeasonGame,
    leastDayWinsSeason: Number.isFinite(leastDayWinsSeason) ? leastDayWinsSeason : 0,
    leastDayWinsSeasonGame,
    longestDayWinStreak,
    leaderCount,
    mostLeaderSeason: Number.isFinite(mostLeaderSeason) ? mostLeaderSeason : 0,
    mostLeaderSeasonGame,
    seasonStats,
    bestPlacementByComp,
    favoriteCompetition,
    bestGame,
    seasonHeatmap
  };
}

function renderPlacements(list) {
  if (!list.length) return `<div class="small">Noch keine Platzierungen in den Beispieldaten.</div>`;

  const sorted = [...list].sort((a, b) =>
    (Number(a.rank || 999) - Number(b.rank || 999)) ||
    (Number(b.points || 0) - Number(a.points || 0)) ||
    (b.season || "").localeCompare(a.season || "")
  );

  return renderExpandableTable(
    sorted,
    ["Pl.", "Tippspiel", "Punkte"],
    x => `
      <tr class="row">
        <td style="width:20%; white-space:nowrap; text-align:left;">${x.rank}</td>
        <td style="width:70%; text-align:left;">
          <a href="${linkGame(x.gameId)}"><b>${escapeHtml(x.title)}</b></a>
          <div class="small">${escapeHtml(x.comp)} · ${escapeHtml(x.season)}</div>
        </td>
        <td style="width:10%; text-align:right; white-space:nowrap;">
          <span class="pill neutral">${x.points} P</span>
        </td>
      </tr>
    `,
    { initialCount: 5, tableId: "placementsMoreRows" }
  );
}

function computeTeamPointsAllTime(slug) {
  const totals = {};

  function ensureRow(teamKey) {
    if (!totals[teamKey]) {
      totals[teamKey] = {
        team: teamKey,
        points: 0,
        picks: 0,
        exactHits: 0
      };
    }
    return totals[teamKey];
  }

  for (const g of games) {
    for (const md of (g.matchdays || [])) {
      const tip = (md.tips || []).find(x => x.player === slug);
      if (!hasRealTips(tip)) continue;

      for (const match of (md.matches || [])) {
        const pick = tip.picks?.[match.id];
        if (!pick) continue;

        const matchPoints = Number(tip.pickPoints?.[match.id] || 0);
        const isExactHit = matchPoints >= 4;

        const homeKey = match.homeTeam || match.home || "Unbekannt";
        const awayKey = match.awayTeam || match.away || "Unbekannt";

        const home = ensureRow(homeKey);
        const away = ensureRow(awayKey);

        home.points += matchPoints;
        away.points += matchPoints;
        home.picks += 1;
        away.picks += 1;

        if (isExactHit) {
          home.exactHits += 1;
          away.exactHits += 1;
        }
      }
    }
  }

  return Object.values(totals)
    .map(row => ({
      ...row,
      avg: row.picks ? row.points / row.picks : 0
    }))
    .sort((a, b) =>
      (b.points - a.points) ||
      (b.avg - a.avg) ||
      String(teamDisplayName(a.team)).localeCompare(String(teamDisplayName(b.team)))
    );
}

function renderTeamPointsAllTime(list) {
  if (!list.length) return `<div class="small">Noch keine Team-Punkte vorhanden.</div>`;

  return renderExpandableTable(
    list,
    ["Verein", "Punkte", "Tipps", "Ø / Spiel", "Exakte Tipps"],
    x => {
      const logo = teamLogo(x.team);
      const label = teamDisplayName(x.team) || x.team;
      return `
        <tr class="row" data-expand-row="1">
          <td style="text-align:left;">
            <div class="person">
              ${logo ? `<img class="avatar" src="${escapeHtml(logo)}" alt="">` : ""}
              <b>${escapeHtml(label)}</b>
            </div>
          </td>
          <td style="text-align:right;"><span class="pill good">${Math.round(x.points)} P</span></td>
          <td style="text-align:right;">${x.picks}</td>
          <td style="text-align:right;">${fmt2(x.avg)}</td>
          <td style="text-align:right;">${x.exactHits}</td>
        </tr>
      `;
    },
    { initialCount: 10, tableId: "teamPointsMoreRows" }
  );
}

function renderRecentMatchdays(slug) {
  const rec = [];

  for (const g of games) {
    for (const md of (g.matchdays || [])) {
      const tip = (md.tips || []).find(x => x.player === slug);
      if (!hasRealTips(tip)) continue;

      rec.push({
        gameId: g.id,
        gTitle: g.title,
        comp: g.competition,
        season: g.season,
        md: Number(md.no || 0),
        label: md.label,
        date: md.date,
        rank: Number(tip.rank || 999),
        points: Number(tip.points || 0) + Number(tip.bonus || 0)
      });
    }
  }

  const seasonToSortable = (season) => {
    if (!season) return 0;
    const s = String(season).trim();
    if (/^\d{4}\/\d{2,4}$/.test(s)) return parseInt(s.slice(0, 4), 10);
    if (/^\d{2}\/\d{2}$/.test(s)) return 2000 + parseInt(s.slice(0, 2), 10);
    if (/^\d{4}$/.test(s)) return parseInt(s, 10);
    return 0;
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return 0;
    const firstPart = String(dateStr).split(" - ")[0].trim();
    const m = firstPart.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return 0;
    const [, dd, mm, yyyy] = m;
    return new Date(`${yyyy}-${mm}-${dd}`).getTime();
  };

  const sorted = rec.sort((a, b) =>
    (seasonToSortable(b.season) - seasonToSortable(a.season)) ||
    (parseDate(b.date) - parseDate(a.date)) ||
    (b.md - a.md) ||
    (b.points - a.points)
  );

  recentMatchdaysState = {
    slug,
    items: sorted,
    visibleCount: 5
  };

  return renderRecentMatchdaysView();
}

function renderRecentMatchdaysView() {
  const { items, visibleCount } = recentMatchdaysState;

  if (!items.length) {
    return `<div class="small">Noch keine Daten vorhanden.</div>`;
  }

  const visibleItems = items.slice(0, visibleCount);

  const cards = visibleItems.map(x => `
    <div class="player-matchday-card">
      <div class="pm-top">
        <div class="pm-md">
          <div class="pm-label">${escapeHtml(x.label)}</div>
          <div class="small">
            Platz ${x.rank}${x.date ? ` · ${fmtDate(x.date)}` : ""}
          </div>
        </div>

        <div class="pm-points">
          <span class="pill good">${x.points} P</span>
        </div>
      </div>

      <div class="pm-game">
        <a href="${linkGame(x.gameId)}&md=${x.md}"><b>${escapeHtml(x.gTitle)}</b></a>
        <div class="small">${escapeHtml(x.comp)} · ${escapeHtml(x.season)}</div>
      </div>
    </div>
  `).join("");

  const controls = items.length > 5 ? `
    <div class="player-matchday-controls">
      ${visibleCount < items.length ? `
        <button
          type="button"
          class="pill positive"
          style="cursor:pointer; color:#000000;"
          onclick="showMoreRecentMatchdays()"
        >
          Mehr
        </button>
      ` : ""}

      ${visibleCount > 5 ? `
        <button
          type="button"
          class="pill neutral"
          style="cursor:pointer;"
          onclick="showLessRecentMatchdays()"
        >
          Weniger
        </button>
      ` : ""}
    </div>
  ` : "";

  return `
    <div class="player-matchday-list">
      ${cards}
    </div>
    ${controls}
  `;
}

function showMoreRecentMatchdays() {
  recentMatchdaysState.visibleCount = Math.min(
    recentMatchdaysState.visibleCount + 5,
    recentMatchdaysState.items.length
  );
  const el = document.getElementById("pMatchdays");
  if (el) el.innerHTML = renderRecentMatchdaysView();
}

function showLessRecentMatchdays() {
  recentMatchdaysState.visibleCount = 5;
  const el = document.getElementById("pMatchdays");
  if (el) el.innerHTML = renderRecentMatchdaysView();
}

function gameLabel(g) {
  if (!g) return "—";
  return `${g.competition} ${g.season}`;
}

function compColorClass(avg) {
  if (avg >= 14) return "green";
  if (avg >= 10) return "yellow";
  if (avg >= 7) return "neutral";
  return "red";
}

function renderBestPlacementByComp(list) {
  if (!list.length) return `<div class="small">Keine Wettbewerbe vorhanden.</div>`;

  const rows = list.map(x => `
    <div class="best-placement-item">
      <div class="bp-comp">
        <div class="bp-competition">${escapeHtml(x.comp)}</div>
      </div>

      <div class="bp-rank">
        <span class="pill good">Platz ${x.rank}</span>
      </div>

      <div class="bp-game">
        <a href="${linkGame(x.gameId)}"><b>${escapeHtml(x.title)}</b></a>
        <div class="small">${escapeHtml(x.season)} · ${x.points} P</div>
      </div>
    </div>
  `).join("");

  return `
    <div class="best-placements-block">
      <div class="best-placements-head">
        <div>Wettbewerb</div>
        <div>Beste Platz.</div>
        <div>Tippspiel</div>
      </div>
      <div class="best-placements-list">
        ${rows}
      </div>
    </div>
  `;
}

function renderSeasonHeatmap(list) {
  if (!list.length) return `<div class="small">Keine Saisondaten vorhanden.</div>`;

  const cells = list.map(x => `
    <a href="${linkGame(x.gameId)}"
       class="card"
       style="padding:12px; text-decoration:none; display:block;">
      <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
        <div>
          <div><b>${escapeHtml(x.season)}</b></div>
          <div class="small">${escapeHtml(x.comp)}</div>
        </div>
        <span class="pill ${compColorClass(x.avg)}">${fmt2(x.avg)} Ø</span>
      </div>

      <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
        <span class="pill neutral">${Math.round(x.points)} Pkt.</span>
        <span class="pill neutral">${x.matchdays} SpT.</span>
        <span class="pill neutral">🏆 ${fmt2(x.dayWins)}</span>
        <span class="pill neutral">👑 ${x.leaderCount}</span>
      </div>
    </a>
  `).join("");

  return `
    <div style="
      display:grid;
      grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
      gap:12px;
    ">
      ${cells}
    </div>
  `;
}

function parseScore(score) {
  if (!score || typeof score !== "string") return null;
  const m = score.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return null;
  return {
    home: Number(m[1]),
    away: Number(m[2])
  };
}

function createStandingRow(team) {
  return {
    team,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDiff: 0,
    points: 0
  };
}

function computePerfectCompetitionTable(game, slug) {
  if (!game) return [];

  const standings = {};

  for (const md of (game.matchdays || [])) {
    const tip = (md.tips || []).find(x => x.player === slug);
    if (!tip || !tip.picks) continue;

    for (const match of (md.matches || [])) {
      const pick = tip.picks[match.id];
      const parsed = parseScore(pick);
      if (!parsed) continue;

      const homeTeam = match.homeTeam || match.home || "Unbekannt";
      const awayTeam = match.awayTeam || match.away || "Unbekannt";

      if (!standings[homeTeam]) standings[homeTeam] = createStandingRow(homeTeam);
      if (!standings[awayTeam]) standings[awayTeam] = createStandingRow(awayTeam);

      const home = standings[homeTeam];
      const away = standings[awayTeam];

      home.played += 1;
      away.played += 1;

      home.goalsFor += parsed.home;
      home.goalsAgainst += parsed.away;
      away.goalsFor += parsed.away;
      away.goalsAgainst += parsed.home;

      if (parsed.home > parsed.away) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else if (parsed.home < parsed.away) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    }
  }

  const rows = Object.values(standings).map(r => ({
    ...r,
    goalDiff: r.goalsFor - r.goalsAgainst
  }));

  rows.sort((a, b) =>
    (b.points - a.points) ||
    (b.goalDiff - a.goalDiff) ||
    (b.goalsFor - a.goalsFor) ||
    String(a.team).localeCompare(String(b.team))
  );

  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return rows;
}

function teamDisplayName(teamKey) {
  if (!teamKey) return "";

  const isMobile = window.innerWidth <= 640;

  if (typeof getTeam === "function") {
    const team = getTeam(teamKey);

    if (team) {
      return isMobile
        ? (team.mobileName || team.shortName || team.name)
        : (team.displayName || team.name);
    }
  }

  return teamKey;
}

function teamLogo(teamKey) {
  if (!teamKey) return "";

  if (typeof getTeam === "function") {
    const team = getTeam(teamKey);
    return team?.logo || "";
  }

  return "";
}

function renderPerfectCompetitionTable(game, slug) {
  const rows = computePerfectCompetitionTable(game, slug);

  if (!rows.length) {
    return `<div class="small">Keine getippten Ergebnisse für diese Saison vorhanden.</div>`;
  }

  const htmlRows = rows.map(r => {
    const logo = teamLogo(r.team);
    const label = teamDisplayName(r.team);

    return `
      <tr
        class="row"
        data-rank="${r.rank}"
        data-team="${escapeHtml(String(label).toLowerCase())}"
        data-played="${r.played}"
        data-wins="${r.wins}"
        data-draws="${r.draws}"
        data-losses="${r.losses}"
        data-goalsfor="${r.goalsFor}"
        data-goalsagainst="${r.goalsAgainst}"
        data-goaldiff="${r.goalDiff}"
        data-points="${r.points}"
      >
        <td>${r.rank}</td>
        <td>
          <div class="person">
            ${logo ? `<img class="avatar" src="${escapeHtml(logo)}" alt="">` : ""}
            <div><b>${escapeHtml(label)}</b></div>
          </div>
        </td>
        <td>${r.played}</td>
        <td>${r.wins}</td>
        <td>${r.draws}</td>
        <td>${r.losses}</td>
        <td>${r.goalsFor}:${r.goalsAgainst}</td>
        <td>${r.goalDiff > 0 ? "+" : ""}${r.goalDiff}</td>
        <td><span class="pill good">${r.points}</span></td>
      </tr>
    `;
  }).join("");

  return `
    <div class="tableWrap">
      <table class="table" id="perfectCompetitionTable">
        <thead>
          <tr>
            <th><button type="button" class="sort-btn" data-sort-key="rank" data-sort-type="number">#</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="team" data-sort-type="text">Team</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="played" data-sort-type="number">Sp</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="wins" data-sort-type="number">S</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="draws" data-sort-type="number">U</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="losses" data-sort-type="number">N</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="goalsfor" data-sort-type="number">Tore</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="goaldiff" data-sort-type="number">Diff</button></th>
            <th><button type="button" class="sort-btn" data-sort-key="points" data-sort-type="number">Pkt</button></th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    </div>
  `;
}

function makePerfectCompetitionTableSortable(root) {
  if (!root) return;

  const table = root.querySelector("#perfectCompetitionTable");
  if (!table) return;

  const tbody = table.querySelector("tbody");
  const buttons = table.querySelectorAll(".sort-btn");

  let currentSort = { key: "rank", direction: "asc" };

  const getValue = (row, key, type) => {
    const raw = row.dataset[key] ?? "";
    if (type === "number") return Number(raw) || 0;
    return String(raw);
  };

  const renderSortIndicators = () => {
    buttons.forEach(btn => {
      const isActive = btn.dataset.sortKey === currentSort.key;
      const baseLabel = btn.textContent.replace(/[↑↓]\s*$/, "").trim();
      if (!isActive) {
        btn.textContent = baseLabel;
        return;
      }

      btn.textContent = `${baseLabel} ${currentSort.direction === "asc" ? "↑" : "↓"}`;
    });
  };

  const sortRows = (key, type, direction) => {
    const dir = direction === "desc" ? -1 : 1;

    const sortedRows = [...tbody.querySelectorAll("tr")].sort((a, b) => {
      const av = getValue(a, key, type);
      const bv = getValue(b, key, type);

      if (type === "text") {
        const cmp = av.localeCompare(bv, "de");
        if (cmp !== 0) return cmp * dir;
      } else {
        const cmp = av - bv;
        if (cmp !== 0) return cmp * dir;
      }

      const fallback = Number(a.dataset.rank || 0) - Number(b.dataset.rank || 0);
      return fallback;
    });

    tbody.innerHTML = "";
    sortedRows.forEach((row, idx) => {
      row.children[0].textContent = String(idx + 1);
      tbody.appendChild(row);
    });
  };

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sortKey;
      const type = btn.dataset.sortType || "number";
      if (!key) return;

      const nextDirection = currentSort.key === key && currentSort.direction === "asc"
        ? "desc"
        : "asc";

      currentSort = { key, direction: nextDirection };
      sortRows(key, type, nextDirection);
      renderSortIndicators();
    });
  });

  sortRows(currentSort.key, "number", currentSort.direction);
  renderSortIndicators();
}

function initPerfectCompetitionSelector(slug) {
  const select = document.getElementById("perfectTableSelect");
  const target = document.getElementById("perfectTable");
  if (!select || !target) return;

  const competitionGames = [...games]
    .sort((a, b) => {
      const compCompare = String(a.competition || "").localeCompare(String(b.competition || ""));
      if (compCompare !== 0) return compCompare;
      return String(b.season || "").localeCompare(String(a.season || ""));
    });

  if (!competitionGames.length) {
    select.innerHTML = "";
    target.innerHTML = `<div class="small">Keine Wettbewerbe gefunden.</div>`;
    return;
  }

  select.innerHTML = competitionGames.map(g => `
    <option value="${escapeHtml(g.id)}">${escapeHtml(g.competition)} ${escapeHtml(g.season || "")}</option>
  `).join("");

  const renderSelected = () => {
    const selectedGame = competitionGames.find(g => g.id === select.value) || competitionGames[0];
    target.innerHTML = renderPerfectCompetitionTable(selectedGame, slug);
    makePerfectCompetitionTableSortable(target);
  };

  select.addEventListener("change", renderSelected);

  const initialGame = competitionGames.find(g => String(g.competition).toLowerCase().includes("bundesliga")) || competitionGames[0];
  select.value = initialGame.id;
  renderSelected();
}

(async function init() {
  await loadTeams();
  players = await loadJSON("data/players.json");
  playersBySlug = Object.fromEntries(players.map(p => [p.slug, p]));
  gIndex = await loadJSON("data/games_index.json");
  games = await loadAllGamesWithMatchdays(gIndex);

  const slug = getParam("slug") || players[0]?.slug;
  const p = playersBySlug[slug];
  if (!p) {
    $("#pName").textContent = "Spieler nicht gefunden";
    return;
  }

  $("#pPhoto").src = p.photo;
  $("#pPhoto").alt = p.name;
  $("#pName").textContent = p.name;
  $("#pMeta").innerHTML = `${pill(p.nickname, "good")} ${pill(`${getFlag(p.home)} ${p.home}`, "neutral")}`;

  const s = computePlayer(slug);
  $("#pKpis").innerHTML = `
  <div class="kpi"><b>${s.participations}</b><span>Teilnahmen</span></div>
  <div class="kpi"><b>${Math.round(s.points)}</b><span>Punkte</span></div>
  <div class="kpi"><b>${s.matchdays}</b><span>Spieltage</span></div>
  <div class="kpi"><b>${s.tippedMatches}</b><span>Getippte Spiele</span></div>

  <div class="kpi"><b>${s.avg.toFixed(2)}</b><span>Punkte pro Spieltag</span></div>
  <div class="kpi"><b>${s.avgPerMatch.toFixed(2)}</b><span>Punkte pro Spiel</span></div>
  <div class="kpi"><b>${fmt2(s.dayWins)}</b><span>Tagessiege</span></div>
  <div class="kpi"><b>${s.leaderCount}</b><span>Wie oft Tabellenführer</span></div>

  <div class="kpi">
    <b>${Math.round(s.bestSeasonPoints)}</b>
    <span>Meiste Punkte in einer Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.bestSeasonPointsGame))}</div>
  </div>

  <div class="kpi">
    <b>${Math.round(s.worstSeasonPoints)}</b>
    <span>Wenigste Punkte in einer Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.worstSeasonPointsGame))}</div>
  </div>

  <div class="kpi">
    <b>${s.bestMatchdayPoints}</b>
    <span>Meiste Punkte an einem Spieltag</span>
    <div class="small">${s.bestMatchdayCount}x</div>
  </div>

  <div class="kpi">
    <b>${s.worstMatchdayPoints}</b>
    <span>Wenigste Punkte an einem Spieltag</span>
    <div class="small">${s.worstMatchdayCount}x</div>
  </div>

  <div class="kpi">
    <b>${s.bestSeasonAvg.toFixed(2)}</b>
    <span>Bester Punkteschnitt Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.bestSeasonAvgGame))}</div>
  </div>

  <div class="kpi">
    <b>${s.worstSeasonAvg.toFixed(2)}</b>
    <span>Schlechtester Punkteschnitt Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.worstSeasonAvgGame))}</div>
  </div>

  <div class="kpi">
    <b>${fmt2(s.mostDayWinsSeason)}</b>
    <span>Meiste Tagessiege in einer Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.mostDayWinsSeasonGame))}</div>
  </div>

  <div class="kpi">
    <b>${fmt2(s.leastDayWinsSeason)}</b>
    <span>Wenigste Tagessiege in einer Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.leastDayWinsSeasonGame))}</div>
  </div>

  <div class="kpi">
    <b>${s.longestDayWinStreak}</b>
    <span>Aufeinanderfolgende Tagessiege</span>
  </div>

  <div class="kpi">
    <b>${s.mostLeaderSeason}</b>
    <span>Meiste Tabellenführungen in einer Saison</span>
    <div class="small">${escapeHtml(gameLabel(s.mostLeaderSeasonGame))}</div>
  </div>

        <div class="kpi">
          <b>${s.bestGame ? `Platz ${s.bestGame.rank}` : "—"}</b>
          <span>Bestes Tippspiel</span>
          <div class="small">
            ${s.bestGame ? `
              <a href="${linkGame(s.bestGame.gameId)}">${escapeHtml(s.bestGame.title)}</a><br>
              ${escapeHtml(s.bestGame.season)} · ${s.bestGame.points} P
            ` : "—"}
          </div>
</div>
                  <div class="kpi">
          <b>${s.favoriteCompetition ? escapeHtml(s.favoriteCompetition.comp) : "—"}</b>
          <span>Lieblingswettbewerb</span>
          <div class="small">
            ${s.favoriteCompetition ? `
              ${s.favoriteCompetition.seasons} Teilnahmen ·
              ${Math.round(s.favoriteCompetition.points)} P ·
              ${fmt2(s.favoriteCompetition.avg)} Ø
            ` : "—"}
          </div>
</div>

`;

  const extraHtml = `

  <div class="card" style="margin-top:14px;">
    <div class="bd">
      <div class="hd">
        <h3>Beste Platzierung pro Wettbewerb</h3>
        <p>Die stärkste Endplatzierung in jedem Wettbewerb.</p>
      </div>
      <div style="margin-top:10px;">
        ${renderBestPlacementByComp(s.bestPlacementByComp)}
      </div>
    </div>
  </div>

  <div class="card" style="margin-top:14px;">
    <div class="bd">
      <div class="hd">
        <h3>Heatmap je Saison</h3>
        <p>Schnellblick auf Form, Punkte und Schnitt pro Saison.</p>
      </div>
      <div style="margin-top:10px;">
        ${renderSeasonHeatmap(s.seasonHeatmap)}
      </div>
    </div>
  </div>
`;


  const blocks = [];
  blocks.push(medalRow("Gesamt", s.total));
  Object.keys(s.medalsByComp).sort().forEach(k => {
    blocks.push(medalRow(k, s.medalsByComp[k]));
  });
  $("#pMedals").innerHTML = blocks.join("");

  $("#pPlacements").innerHTML = renderPlacements(s.placements);
  $("#pTeamPoints").innerHTML = renderTeamPointsAllTime(computeTeamPointsAllTime(slug));
  $("#pMatchdays").innerHTML = renderRecentMatchdays(slug);
  $("#pMatchdays").insertAdjacentHTML("afterend", extraHtml);

  initPerfectCompetitionSelector(slug);

})();
