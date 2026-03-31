let players = [],
  playersBySlug = {},
  gIndex = [],
  game = null;

function fmt2(x) {
  const n = Number(x || 0);
  return n.toFixed(2);
}

function syncMobileCompNav() {
  const mobileNav = document.getElementById("mobileCompNav");
  const prevBtn = document.getElementById("mobileCompPrev");
  const nextBtn = document.getElementById("mobileCompNext");
  const currentText = document.querySelector(".comp-nav-current-text");

  if (!mobileNav || !prevBtn || !nextBtn || !currentText || !game) return;

  currentText.textContent = game.title || `${game.competition} ${game.season}`;

  const allGames = Array.isArray(gIndex) ? gIndex : [];
  const currentIndex = allGames.findIndex((g) => g.id === game.id);

  const prevGame = currentIndex > 0 ? allGames[currentIndex - 1] : null;
  const nextGame =
    currentIndex >= 0 && currentIndex < allGames.length - 1
      ? allGames[currentIndex + 1]
      : null;

  if (prevGame) {
    prevBtn.style.visibility = "visible";

    prevBtn.onclick = (e) => {
      e.preventDefault();
      window.location.href = linkGame(prevGame.id);
    };
  } else {
    prevBtn.style.visibility = "hidden";
    prevBtn.onclick = null;
  }

  if (nextGame) {
    nextBtn.style.visibility = "visible";

    nextBtn.onclick = (e) => {
      e.preventDefault();
      window.location.href = linkGame(nextGame.id);
    };
  } else {
    nextBtn.style.visibility = "hidden";
    nextBtn.onclick = null;
  }

  mobileNav.classList.remove("is-switching");
  void mobileNav.offsetWidth;
  mobileNav.classList.add("is-switching");
}

function resolveTeamLabel(val) {
  const raw = String(val ?? "").trim();
  if (!raw || raw === "-" || raw === "—") return raw || "—";

  const isMobile = window.innerWidth <= 640;

  if (typeof getTeam === "function") {
    const team = getTeam(raw);
    if (team) {
      return isMobile
        ? team.mobileName || team.shortName || team.name || raw
        : team.mobileName || team.name || raw;
    }
  }

  if (typeof getTeamName === "function") {
    const name = getTeamName(raw, isMobile ? "mobile" : "desktop");
    if (name) return name;
  }

  return raw;
}

function normalizeBonusValue(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v).split(","))
      .map((v) => String(v).trim())
      .filter(Boolean);
  }

  if (value === null || value === undefined || value === "") {
    return [];
  }

  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function hasDecidedBonusResult(value) {
  const vals = normalizeBonusValue(value);
  if (!vals.length) return false;
  return vals.some((v) => {
    const s = String(v).trim();
    return s !== "" && s !== "-" && s !== "—";
  });
}

function bonusPointsForQuestion(key, playerValue, resultValue, pointsRow) {
  const pts = Number(pointsRow?.predictions?.[key] || 0);
  if (!Number.isFinite(pts) || pts <= 0) return 0;

  const playerVals = normalizeBonusValue(playerValue);
  const resultVals = normalizeBonusValue(resultValue);

  if (!playerVals.length || !resultVals.length) return 0;

  // Einzeltipp gegen mehrere richtige Antworten
  if (playerVals.length === 1) {
    return resultVals.some(
      (x) => x.toLowerCase() === playerVals[0].toLowerCase(),
    )
      ? pts
      : 0;
  }

  // Mehrfachantworten: jede richtige Antwort zählt
  let score = 0;
  const resultSet = new Set(resultVals.map((x) => x.toLowerCase()));

  for (const val of playerVals) {
    if (resultSet.has(val.toLowerCase())) {
      score += pts;
    }
  }

  return score;
}

function bonusHitsForQuestion(playerValue, resultValue) {
  const playerVals = normalizeBonusValue(playerValue);
  const resultVals = normalizeBonusValue(resultValue);

  if (!playerVals.length || !resultVals.length) return [];

  const resultSet = new Set(resultVals.map((x) => x.toLowerCase()));
  return playerVals.map((v) => ({
    value: v,
    hit: resultSet.has(v.toLowerCase()),
  }));
}

function tipClass(points) {
  if (points >= 4) return "tip-4";
  if (points === 3) return "tip-3";
  if (points === 2) return "tip-2";
  if (points === 1) return "tip-1";
  return "";
}

function playerChip(slug) {
  const p = playersBySlug[slug];
  if (!p) return escapeHtml(slug);
  return `<a href="${linkPlayer(slug)}" class="person">
    <img class="avatar" src="${escapeHtml(p.photo)}" alt="">
    <span><b>${escapeHtml(p.name)}</b></span>
  </a>`;
}

// Spieltagspunkte inkl. Bonus (AE + AI)
function tipDayScore(tip) {
  const pts = Number(tip?.points || 0);
  const bonus = Number(tip?.bonus || 0);
  return pts + bonus;
}

// Gesamtstand nach Spieltag (AJ), falls vorhanden, sonst (AE+AI) kumuliert
function tipTotalAfterMatchday(tip) {
  const t = tip?.total;
  if (t === null || t === undefined || t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function computeOverallUntil(matchdayIndex) {
  const totals = {};

  for (let i = 0; i <= matchdayIndex; i++) {
    const md = await loadMatchday(game.matchdays[i]);

    for (const tip of md.tips || []) {
      const hasPicks = tip.picks && Object.keys(tip.picks).length > 0;
      const hasBonus = Number(tip.bonus || 0) > 0;
      if (!hasPicks && !hasBonus) continue;

      const s = (totals[tip.player] ||= {
        player: tip.player,
        points: 0,
        dayWinsTotal: 0,
      });

      s.points += Number(tip.points || 0) + Number(tip.bonus || 0);

      if (
        tip.dayWinsTotal !== undefined &&
        tip.dayWinsTotal !== null &&
        tip.dayWinsTotal !== ""
      ) {
        s.dayWinsTotal = Math.max(
          s.dayWinsTotal,
          Number(tip.dayWinsTotal || 0),
        );
      } else {
        if (tip.dayWin === true) s.dayWinsTotal += 1;
        else {
          const dayWinShare = Number(tip.dayWin || 0);
          if (Number.isFinite(dayWinShare) && dayWinShare > 0)
            s.dayWinsTotal += dayWinShare;
        }
      }
    }
  }

  const arr = Object.values(totals);

  arr.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if ((b.dayWinsTotal || 0) !== (a.dayWinsTotal || 0)) {
      return (b.dayWinsTotal || 0) - (a.dayWinsTotal || 0);
    }

    const an = playersBySlug[a.player]?.name || a.player;
    const bn = playersBySlug[b.player]?.name || b.player;
    return an.localeCompare(bn);
  });

  let rank = 0;
  let lastKey = null;

  arr.forEach((r, idx) => {
    const key = `${r.points}|${r.dayWinsTotal || 0}`;
    if (lastKey === null || key !== lastKey) {
      rank = idx + 1;
    }
    r.rank = rank;
    lastKey = key;
  });

  return arr;
}

function renderMatchday(md) {
  const dateBits = [
    md.date ? pill(fmtDate(md.date), "neutral") : "",
    md.dateTo ? pill(`bis ${fmtDate(md.dateTo)}`, "neutral") : "",
  ]
    .filter(Boolean)
    .join("");

  const head = `<div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
    ${pill(md.label, "good")}
    ${dateBits}
  </div>`;

  const matchRows = (md.matches || [])
    .map((m) => {
      const tipLines = (md.tips || [])
        .map((t) => {
          const pick = t.picks?.[m.id] ?? "—";
          const pts =
            t.pickPoints && m.id in t.pickPoints
              ? Number(t.pickPoints[m.id] || 0)
              : null;
          const ptsClass = pts === null ? "" : tipClass(pts);

          return `
  <div class="tipRow">
    <div class="tipName">${escapeHtml(playersBySlug[t.player]?.name || t.player)}:</div>
    <div class="tipPick"><b>${escapeHtml(pick)}</b></div>
    <div class="tipPts">${pts === null ? "" : `<span class="pill miniPill ${ptsClass}">${pts}</span>`}</div>
  </div>
`;
        })
        .join("");

      const isMobile = window.innerWidth <= 640;

      const homeName =
        typeof getTeamName === "function" && m.homeTeam
          ? getTeamName(m.homeTeam, isMobile ? "mobile" : "desktop")
          : m.home || m.homeTeam || "";

      const awayName =
        typeof getTeamName === "function" && m.awayTeam
          ? getTeamName(m.awayTeam, isMobile ? "mobile" : "desktop")
          : m.away || m.awayTeam || "";

      const homeLogo =
        typeof getTeamLogo === "function" && m.homeTeam
          ? getTeamLogo(m.homeTeam)
          : "";

      const awayLogo =
        typeof getTeamLogo === "function" && m.awayTeam
          ? getTeamLogo(m.awayTeam)
          : "";

      return `
<div class="card matchCard" style="margin:10px 0">

  <div class="matchHeader" onclick="toggleMatch(this)">
<div class="matchTitle">
  ${homeLogo ? `<img class="teamLogo" src="${escapeHtml(homeLogo)}" alt="">` : ""}
  <b>${escapeHtml(homeName)}</b>
  <span class="small">vs.</span>
  ${awayLogo ? `<img class="teamLogo" src="${escapeHtml(awayLogo)}" alt="">` : ""}
  <b>${escapeHtml(awayName)}</b>
</div>

<div class="matchHeaderRight">
  ${pill(m.result || "—", "neutral")}
  <span class="toggleIcon">▾</span>
</div>
  </div>

  <div class="matchBody">
    <div class="hr"></div>
    ${tipLines}
  </div>

</div>
`;
    })
    .join("");

  // Bonus-Meta (wie "Abstieg: Aachen" etc.)
  const bonusMeta = (md.bonusMeta || []).length
    ? `<div class="card" style="margin:10px 0">
        <div class="bd">
          <div class="hd"><h3>Bonus</h3><p>Events &amp; Punkte.</p></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            ${(md.bonusMeta || []).map((b) => pill(`${b.value}: ${b.label}`, "neutral")).join("")}
          </div>
        </div>
      </div>`
    : "";

  $("#mdContent").innerHTML = head + matchRows + bonusMeta;
  renderDayTable(md);
}

function renderDayTable(md) {
  const tips = (md.tips || []).filter((t) => {
    const hasPicks = t.picks && Object.keys(t.picks).length > 0;
    const hasBonus = Number(t.bonus || 0) > 0;
    return hasPicks || hasBonus;
  });

  // Sortierung: Tagespunkte OHNE Bonus desc
  // Tiebreaker: Bonus desc, dann Name
  const sorted = [...tips].sort((a, b) => {
    const ap = Number(a.points || 0);
    const bp = Number(b.points || 0);
    if (bp !== ap) return bp - ap;

    const ab = Number(a.bonus || 0);
    const bb = Number(b.bonus || 0);
    if (bb !== ab) return bb - ab;

    const an = playersBySlug[a.player]?.name || a.player;
    const bn = playersBySlug[b.player]?.name || b.player;
    return an.localeCompare(bn);
  });

  // Rank neu vergeben (1,2,2,4 bei Gleichstand in points)
  let rank = 0;
  let lastPts = null;
  const ranked = sorted.map((t, idx) => {
    const pts = Number(t.points || 0);
    if (lastPts === null || pts !== lastPts) rank = idx + 1;
    lastPts = pts;
    return { rank, tip: t };
  });

  const rows = ranked
    .map(({ rank, tip }) => {
      const dayPts = Number(tip.points || 0); // ohne Bonus
      const bonus = Number(tip.bonus || 0);
      const total =
        tip.total === null || tip.total === undefined || tip.total === ""
          ? null
          : Number(tip.total || 0);

      const metaBits = [];
      if (bonus) metaBits.push(`Bonus: +${Math.round(bonus)}`);
      if (total !== null) metaBits.push(`Gesamt: ${Math.round(total)}`);

      return `
      <tr class="row">
        <td>${rank}</td>
        <td>${playerChip(tip.player)}</td>
        <td>
          <span class="pill good">${Math.round(dayPts)} P</span>
          ${metaBits.length ? `<div class="small" style="opacity:.85">${metaBits.join(" · ")}</div>` : ""}
        </td>
      </tr>
    `;
    })
    .join("");

  $("#mdTable").innerHTML = renderTable(rows, ["#", "Spieler", "Punkte"]);
  $("#mdTableMeta").textContent =
    `Rangliste für ${md.label} (Punkte ohne Bonus, Bonus separat).`;
}

async function renderOverall(matchdayIndex) {
  const md = await loadMatchday(game.matchdays[matchdayIndex]);
  const overall = await computeOverallUntil(matchdayIndex);
  const dayWinners = new Set(
    (md.tips || [])
      .filter(
        (t) =>
          (t.dayWin === true || Number(t.dayWin || 0) > 0) &&
          t.picks &&
          Object.keys(t.picks).length,
      )
      .map((t) => t.player),
  );

  // Podium bleibt wie gehabt, nur mit Klassen (siehe CSS unten)
  const podium = overall.slice(0, 3);

  const podiumCards = podium
    .map((r, i) => {
      const cls = i === 0 ? "pod-gold" : i === 1 ? "pod-silver" : "pod-bronze";
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉";
      return `
    <div class="card podiumCard ${cls}" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
        <div>${playerChip(r.player)}<div class="small">Platz ${r.rank}</div></div>
<div class="scoreCols">
  <div class="scoreCol">
    <div class="scoreVal">${pill(`${Math.round(r.points)} P`, "neutral")}</div>
  </div>
  <div class="scoreCol">
    <div class="scoreVal">${pill(`🏆 ${fmt2(r.dayWinsTotal || 0)}`, "neutral")}</div>
  </div>
</div>      </div>
    </div>`;
    })
    .join("");

  const rows = overall
    .slice(3)
    .map(
      (r) => `
  <tr class="row ${dayWinners.has(r.player) ? "daywinRow" : ""}">
    <td>${r.rank}</td>
    <td>${playerChip(r.player)}</td>
    <td><span class="pill neutral">${Math.round(r.points)} P</span></td>
    <td><span class="pill neutral">🏆 ${fmt2(r.dayWinsTotal || 0)}</span></td>
  </tr>
`,
    )
    .join("");

  $("#overall").innerHTML = `
  ${podiumCards}
  <div class="hr"></div>
  ${renderTable(rows, ["#", "Spieler", "Punkte", "Tagessiege"])}
`;
}

function hasBonusTab() {
  return !!(
    game?.bonusTips?.picks &&
    Array.isArray(game.bonusTips.picks) &&
    game.bonusTips.picks.length
  );
}

let seasonStatsCache = null;
let seasonStatsPromise = null;
const sortableTablesState = {};

function safeDiv(a, b) {
  const x = Number(a || 0);
  const y = Number(b || 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || y <= 0) return 0;
  return x / y;
}

function rankRows(rows, valueKey, tiebreakFn) {
  const sorted = [...rows].sort((a, b) => {
    if (Number(b[valueKey] || 0) !== Number(a[valueKey] || 0)) {
      return Number(b[valueKey] || 0) - Number(a[valueKey] || 0);
    }
    return tiebreakFn(a, b);
  });
  let rank = 0;
  let lastVal = null;
  sorted.forEach((r, idx) => {
    const val = Number(r[valueKey] || 0);
    if (lastVal === null || val !== lastVal) rank = idx + 1;
    r.rank = rank;
    lastVal = val;
  });
  return sorted;
}

async function computeSeasonStats() {
  if (seasonStatsCache) return seasonStatsCache;
  if (seasonStatsPromise) return seasonStatsPromise;

  seasonStatsPromise = (async () => {
    const matchdays = game?.matchdays || [];
    const playerStats = {};
    const matchdayStats = [];
    const cumulative = {};

    const playerNameSort = (a, b) => {
      const an = playersBySlug[a.player]?.name || a.player;
      const bn = playersBySlug[b.player]?.name || b.player;
      return an.localeCompare(bn);
    };

    const ensurePlayer = (slug) => {
      if (playerStats[slug]) return playerStats[slug];
      playerStats[slug] = {
        player: slug,
        totalPoints: 0,
        pickedGames: 0,
        tippedMatchdays: 0,
        dayWinsCumulative: 0,
        dayWinnerCount: 0,
        bonusPoints: 0,
        days20Plus: 0,
        daysZeroWithPick: 0,
        highestDayPoints: null,
        lowestDayPoints: null,
        totalRank: 0,
        rankCount: 0,
        firstPlaceCount: 0,
        bestRank: null,
        worstRank: null,
        exactHits: 0,
        diffHits: 0,
        tendencyHits: 0,
        wrongHits: 0,
        dayWinStreakBest: 0,
        _currentDayWinStreak: 0,
      };
      return playerStats[slug];
    };

    for (let i = 0; i < matchdays.length; i++) {
      const md = await loadMatchday(matchdays[i]);
      const tips = (md.tips || []).filter((t) => {
        const hasPicks = t.picks && Object.keys(t.picks).length > 0;
        const hasBonus = Number(t.bonus || 0) > 0;
        return hasPicks || hasBonus;
      });

      const winners = tips.filter(
        (t) => t.dayWin === true || Number(t.dayWin || 0) > 0,
      );
      let dayTotalPoints = 0;
      let dayPlayers = 0;
      let dayWinnerPoints = 0;

      tips.forEach((t) => {
        const p = ensurePlayer(t.player);
        const pickEntries = Object.entries(t.picks || {});
        const pickedGames = pickEntries.length;
        const tipPoints = Number(t.points || 0);
        const bonusPoints = Number(t.bonus || 0);
        const dayPoints = tipPoints + bonusPoints;
        const dayWinVal = t.dayWin === true ? 1 : Number(t.dayWin || 0);

        dayTotalPoints += dayPoints;
        dayPlayers += 1;
        dayWinnerPoints = Math.max(dayWinnerPoints, dayPoints);

        p.totalPoints += dayPoints;
        p.pickedGames += pickedGames;
        p.tippedMatchdays += 1;
        p.dayWinsCumulative += Number.isFinite(dayWinVal) ? dayWinVal : 0;
        p.bonusPoints += bonusPoints;

        if (tipPoints >= 20) p.days20Plus += 1;
        if (pickedGames > 0 && tipPoints === 0) p.daysZeroWithPick += 1;

        p.highestDayPoints =
          p.highestDayPoints === null
            ? tipPoints
            : Math.max(p.highestDayPoints, tipPoints);
        p.lowestDayPoints =
          p.lowestDayPoints === null
            ? tipPoints
            : Math.min(p.lowestDayPoints, tipPoints);

        if (dayWinVal > 0) {
          p.dayWinnerCount += 1;
          p._currentDayWinStreak += 1;
          p.dayWinStreakBest = Math.max(
            p.dayWinStreakBest,
            p._currentDayWinStreak,
          );
        } else {
          p._currentDayWinStreak = 0;
        }

        Object.values(t.pickPoints || {}).forEach((raw) => {
          const v = Number(raw || 0);
          if (v === 4) p.exactHits += 1;
          else if (v === 3) p.diffHits += 1;
          else if (v === 2) p.tendencyHits += 1;
          else if (v === 0) p.wrongHits += 1;
        });

        cumulative[t.player] = (cumulative[t.player] || 0) + dayPoints;
      });

      const cumulativeRows = rankRows(
        Object.entries(cumulative).map(([player, points]) => ({
          player,
          points,
        })),
        "points",
        playerNameSort,
      );
      cumulativeRows.forEach((r) => {
        const p = ensurePlayer(r.player);
        p.totalRank += r.rank;
        p.rankCount += 1;
        p.bestRank =
          p.bestRank === null ? r.rank : Math.min(p.bestRank, r.rank);
        p.worstRank =
          p.worstRank === null ? r.rank : Math.max(p.worstRank, r.rank);
        if (r.rank === 1) p.firstPlaceCount += 1;
      });

      const gamesCount = (md.matches || []).length;
      matchdayStats.push({
        index: i + 1,
        label: md.label || `Spieltag ${i + 1}`,
        winners: winners.map((w) => w.player),
        winnerPoints: dayWinnerPoints,
        totalPoints: dayTotalPoints,
        gamesCount,
        pointsPerGame: safeDiv(dayTotalPoints, gamesCount),
        playersCount: dayPlayers,
        pointsPerPlayer: safeDiv(dayTotalPoints, dayPlayers),
      });
    }

    const playerRows = Object.values(playerStats).map((p) => ({
      ...p,
      pointsPerPickedGame: safeDiv(p.totalPoints, p.pickedGames),
      avgRank: safeDiv(p.totalRank, p.rankCount),
    }));

    seasonStatsCache = { playerRows, matchdayStats };
    return seasonStatsCache;
  })();

  return seasonStatsPromise;
}

function renderSortableTable({
  mountId,
  tableId,
  columns,
  rows,
  defaultSortKey,
  defaultSortDir = "desc",
}) {
  if (!rows.length) {
    $(mountId).innerHTML = `<div class="small">Keine Daten vorhanden.</div>`;
    return;
  }

  const state = sortableTablesState[tableId] || {
    key: defaultSortKey,
    dir: defaultSortDir,
  };
  sortableTablesState[tableId] = state;

  const sorted = [...rows].sort((a, b) => {
    const col = columns.find((c) => c.key === state.key) || columns[0];
    const av = col.getSortValue ? col.getSortValue(a) : a[col.key];
    const bv = col.getSortValue ? col.getSortValue(b) : b[col.key];
    let cmp = 0;
    if (typeof av === "string" || typeof bv === "string") {
      cmp = String(av ?? "").localeCompare(String(bv ?? ""), "de");
    } else {
      cmp = Number(av || 0) - Number(bv || 0);
    }
    if (cmp === 0 && col.key !== "player") {
      cmp = String(playersBySlug[a.player]?.name || "").localeCompare(
        String(playersBySlug[b.player]?.name || ""),
        "de",
      );
    }
    return state.dir === "asc" ? cmp : -cmp;
  });

  const headers = columns
    .map((c) => {
      const active = c.key === state.key;
      const dir = active ? (state.dir === "asc" ? "↑" : "↓") : "";
      return `<th><button class="sortBtn ${active ? "active" : ""}" data-table="${tableId}" data-key="${c.key}">${escapeHtml(c.label)} ${dir}</button></th>`;
    })
    .join("");

  const body = sorted
    .map(
      (r) =>
        `<tr class="row">${columns.map((c) => `<td>${c.render ? c.render(r) : escapeHtml(r[c.key])}</td>`).join("")}</tr>`,
    )
    .join("");
  $(mountId).innerHTML =
    `<div class="tableWrap gameStatsTableWrap"><table class="table gameStatsTable"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;

  document
    .querySelectorAll(`button.sortBtn[data-table="${tableId}"]`)
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const t = sortableTablesState[tableId];
        if (t.key === key) {
          t.dir = t.dir === "asc" ? "desc" : "asc";
        } else {
          t.key = key;
          t.dir = "desc";
        }
        renderSortableTable({
          mountId,
          tableId,
          columns,
          rows,
          defaultSortKey,
          defaultSortDir,
        });
      });
    });
}

function sortRowsByState(rows, columns, state) {
  return [...rows].sort((a, b) => {
    const col = columns.find((c) => c.key === state.key) || columns[0];
    const av = col.getSortValue ? col.getSortValue(a) : a[col.key];
    const bv = col.getSortValue ? col.getSortValue(b) : b[col.key];
    let cmp = 0;
    if (typeof av === "string" || typeof bv === "string")
      cmp = String(av ?? "").localeCompare(String(bv ?? ""), "de");
    else cmp = Number(av || 0) - Number(bv || 0);
    if (cmp === 0 && col.key !== "player") {
      cmp = String(playersBySlug[a.player]?.name || "").localeCompare(
        String(playersBySlug[b.player]?.name || ""),
        "de",
      );
    }
    return state.dir === "asc" ? cmp : -cmp;
  });
}

function renderLinkedSortableTable({
  mountId,
  linkedTableId,
  columns,
  rows,
  allColumns,
}) {
  const state = sortableTablesState[linkedTableId];
  const sorted = sortRowsByState(rows, allColumns, state);

  const headers = columns
    .map((c) => {
      const active = c.key === state.key;
      const dir = active ? (state.dir === "asc" ? "↑" : "↓") : "";
      return `<th><button class="sortBtn ${active ? "active" : ""}" data-linked-table="${linkedTableId}" data-key="${c.key}">${escapeHtml(c.label)} ${dir}</button></th>`;
    })
    .join("");

  const body = sorted
    .map(
      (r) =>
        `<tr class="row">${columns.map((c) => `<td>${c.render ? c.render(r) : escapeHtml(r[c.key])}</td>`).join("")}</tr>`,
    )
    .join("");
  $(mountId).innerHTML =
    `<div class="tableWrap gameStatsTableWrap"><table class="table gameStatsTable"><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function setStatsSectionsVisibility(visible) {
  const dayCard = document.getElementById("matchdayTableSection");
  const overallCard = document.getElementById("overallSection");
  if (dayCard) dayCard.style.display = visible ? "" : "none";
  if (overallCard) overallCard.style.display = visible ? "" : "none";
}

async function renderPlayerStatsTab() {
  const { playerRows } = await computeSeasonStats();
  setStatsSectionsVisibility(false);
  $("#mdContent").innerHTML = `
    <div id="playerStatsMountA"></div>
    <div style="height:12px"></div>
    <div id="playerStatsMountB"></div>
  `;
  $("#mdTable").innerHTML = "";
  $("#mdTableMeta").textContent =
    "Saisonstatistiken aller Spieler (sortierbar).";
  $("#overall").innerHTML = "";

  renderSortableTable({
    mountId: "#playerStatsMount",
    tableId: "playerStats",
    defaultSortKey: "totalPoints",
    columns: [
      {
        key: "player",
        label: "Spieler",
        getSortValue: (r) => playersBySlug[r.player]?.name || r.player,
        render: (r) => playerChip(r.player),
      },
      {
        key: "pointsPerPickedGame",
        label: "Punkte/Spiel",
        render: (r) => fmt2(r.pointsPerPickedGame),
      },
      {
        key: "totalPoints",
        label: "Gesamtpunkte",
        render: (r) => Math.round(r.totalPoints),
      },
      { key: "pickedGames", label: "Getippte Spiele" },
      {
        key: "dayWinsCumulative",
        label: "Tagessiege kumuliert",
        render: (r) => fmt2(r.dayWinsCumulative),
      },
      { key: "dayWinnerCount", label: "Tagessieger-Tage" },
      { key: "bonusPoints", label: "Bonuspunkte" },
      { key: "days20Plus", label: ">=20 Punkte" },
      { key: "daysZeroWithPick", label: "0 Punkte (mit Tipp)" },
      {
        key: "highestDayPoints",
        label: "Höchste Tagespunkte",
        render: (r) => r.highestDayPoints ?? "—",
      },
      {
        key: "lowestDayPoints",
        label: "Niedrigste Tagespunkte",
        render: (r) => r.lowestDayPoints ?? "—",
      },
      { key: "firstPlaceCount", label: "Wie oft Platz 1 Gesamt" },
      {
        key: "bestRank",
        label: "Bester Platz",
        render: (r) => r.bestRank ?? "—",
      },
      {
        key: "worstRank",
        label: "Schlechtester Platz",
        render: (r) => r.worstRank ?? "—",
      },
      {
        key: "avgRank",
        label: "Durchschnittsplatz",
        render: (r) => fmt2(r.avgRank),
      },
      { key: "exactHits", label: "Richtige Ergebnisse (4P)" },
      { key: "diffHits", label: "Richtiges Torverhältnis (3P)" },
      { key: "tendencyHits", label: "Richtige Tendenz (2P)" },
      { key: "wrongHits", label: "Falsch (0P)" },
      { key: "tippedMatchdays", label: "Getippte Spieltage" },
    ],
    rows: playerRows,
  });
}

async function renderMatchdayStatsTab() {
  const { matchdayStats } = await computeSeasonStats();
  setStatsSectionsVisibility(false);
  $("#mdContent").innerHTML = `<div id="matchdayStatsMount"></div>`;
  $("#mdTable").innerHTML = "";
  $("#mdTableMeta").textContent = "Statistik je Spieltag (sortierbar).";
  $("#overall").innerHTML = "";

  renderSortableTable({
    mountId: "#matchdayStatsMount",
    tableId: "matchdayStats",
    defaultSortKey: "index",
    defaultSortDir: "asc",
    columns: [
      { key: "index", label: "Spieltag", render: (r) => escapeHtml(r.label) },
      {
        key: "winners",
        label: "Tagessieger",
        getSortValue: (r) => r.winners.length,
        render: (r) =>
          r.winners.length
            ? r.winners.map((w) => playerChip(w)).join(" ")
            : "—",
      },
      {
        key: "winnerPoints",
        label: "Punkte Tagessieger",
        render: (r) => Math.round(r.winnerPoints),
      },
      {
        key: "totalPoints",
        label: "Punkte gesamt",
        render: (r) => Math.round(r.totalPoints),
      },
      { key: "gamesCount", label: "Spiele" },
      {
        key: "pointsPerGame",
        label: "Punkte/Spiel",
        render: (r) => fmt2(r.pointsPerGame),
      },
      { key: "playersCount", label: "Spieler" },
      {
        key: "pointsPerPlayer",
        label: "Punkte/Spieler",
        render: (r) => fmt2(r.pointsPerPlayer),
      },
    ],
    rows: matchdayStats,
  });
}

function renderKpiPlayers(label, value, playersList) {
  return `
    <div class="kpi">
      <b>${escapeHtml(label)}</b>
      <span>${escapeHtml(value)}</span>
      <div class="kpiPlayers">${playersList.map((p) => playerChip(p)).join(" ") || "—"}</div>
    </div>
  `;
}

async function renderTopsFlopsTab() {
  const { playerRows, matchdayStats } = await computeSeasonStats();
  setStatsSectionsVisibility(false);
  $("#mdTable").innerHTML = "";
  $("#mdTableMeta").textContent = "KPI-Auswertung Tops & Flops.";
  $("#overall").innerHTML = "";

  const byMetric = (arr, metric, isMin = false) => {
    if (!arr.length) return { value: 0, rows: [] };
    const vals = arr.map((x) => Number(x[metric] || 0));
    const best = isMin ? Math.min(...vals) : Math.max(...vals);
    return {
      value: best,
      rows: arr.filter((x) => Number(x[metric] || 0) === best),
    };
  };

  const winner = byMetric(playerRows, "totalPoints");
  const mostDayWins = byMetric(playerRows, "dayWinnerCount");
  const bestAvg = byMetric(playerRows, "pointsPerPickedGame");
  const bestHigh = byMetric(playerRows, "highestDayPoints");
  const mostExact = byMetric(playerRows, "exactHits");
  const bestStreak = byMetric(playerRows, "dayWinStreakBest");

  const bestAbs = byMetric(matchdayStats, "totalPoints");
  const bestRel = byMetric(matchdayStats, "pointsPerPlayer");
  const bestCut = byMetric(matchdayStats, "pointsPerGame");
  const worstAbs = byMetric(matchdayStats, "totalPoints", true);
  const worstRel = byMetric(matchdayStats, "pointsPerPlayer", true);
  const worstCut = byMetric(matchdayStats, "pointsPerGame", true);

  const matchdayLine = (row, metricLabel, metricValue) =>
    `${row.label} · Tagessieger: ${(row.winners || []).map((w) => playersBySlug[w]?.name || w).join(", ") || "—"} (${Math.round(row.winnerPoints)} P) · ${metricLabel}: ${metricValue}`;

  $("#mdContent").innerHTML = `
    <div class="kpis gameStatsKpis">
      ${renderKpiPlayers(
        "Tippspielsieger",
        `${Math.round(winner.value)} Punkte`,
        winner.rows.map((r) => r.player),
      )}
      ${renderKpiPlayers(
        "Meiste Tagessiege",
        `${mostDayWins.value}`,
        mostDayWins.rows.map((r) => r.player),
      )}
      ${renderKpiPlayers(
        "Bester Punkteschnitt",
        `${fmt2(bestAvg.value)} P/Spiel`,
        bestAvg.rows.map((r) => r.player),
      )}
      ${renderKpiPlayers(
        "Höchster Punktespieltag",
        `${Math.round(bestHigh.value)} Punkte`,
        bestHigh.rows.map((r) => r.player),
      )}
      ${renderKpiPlayers(
        "Meiste richtige Ergebnisse",
        `${mostExact.value}`,
        mostExact.rows.map((r) => r.player),
      )}
      ${renderKpiPlayers(
        "Meiste Tagessiege in Folge",
        `${bestStreak.value}`,
        bestStreak.rows.map((r) => r.player),
      )}
    </div>
    <div class="kpis gameStatsKpis" style="margin-top:12px">
      <div class="kpi"><b>Bester Spieltag (absolut)</b><span>${escapeHtml(matchdayLine(bestAbs.rows[0], "Punkte gesamt", Math.round(bestAbs.value)))}</span></div>
      <div class="kpi"><b>Bester Spieltag (relativ)</b><span>${escapeHtml(matchdayLine(bestRel.rows[0], "Punkte/Spieler", fmt2(bestRel.value)))}</span></div>
      <div class="kpi"><b>Bester Spieltag (Schnitt)</b><span>${escapeHtml(matchdayLine(bestCut.rows[0], "Punkte/Spiel", fmt2(bestCut.value)))}</span></div>
      <div class="kpi"><b>Schlechtester Spieltag (absolut)</b><span>${escapeHtml(matchdayLine(worstAbs.rows[0], "Punkte gesamt", Math.round(worstAbs.value)))}</span></div>
      <div class="kpi"><b>Schlechtester Spieltag (relativ)</b><span>${escapeHtml(matchdayLine(worstRel.rows[0], "Punkte/Spieler", fmt2(worstRel.value)))}</span></div>
      <div class="kpi"><b>Schlechtester Spieltag (Schnitt)</b><span>${escapeHtml(matchdayLine(worstCut.rows[0], "Punkte/Spiel", fmt2(worstCut.value)))}</span></div>
    </div>
  `;
}

function renderBonusTab() {
  setStatsSectionsVisibility(false);
  const bonus = game?.bonusTips;
  if (!bonus || !Array.isArray(bonus.picks) || !bonus.picks.length) {
    $("#mdContent").innerHTML =
      `<div class="small">Keine Bonustipps vorhanden.</div>`;
    $("#mdTable").innerHTML = "";
    $("#mdTableMeta").textContent = "";
    $("#overall").innerHTML = "";
    return;
  }

  const questions = Array.isArray(bonus.questions) ? bonus.questions : [];
  const picks = bonus.picks || [];

  const resultRow = picks.find(
    (p) => String(p.player).toLowerCase() === "result",
  );
  const pointsRow = picks.find(
    (p) => String(p.player).toLowerCase() === "points",
  );

  const playerRows = picks.filter((p) => {
    const slug = String(p.player).toLowerCase();
    return slug !== "result" && slug !== "points";
  });

  const rawKeys = [
    ...new Set(picks.flatMap((p) => Object.keys(p.predictions || {}))),
  ].filter((k) => k !== "TipperID");

  const questionMeta = questions.reduce((acc, q) => {
    if (q && q.key) acc[q.key] = q;
    return acc;
  }, {});

  const labelFor = (key) => questionMeta[key]?.label || key;
  const resultFor = (key) => resultRow?.predictions?.[key] ?? [];
  const pointsFor = (key) => {
    const raw = pointsRow?.predictions?.[key];
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  };

  const displayKeys = rawKeys.flatMap((key) => {
    if (key === "Halbfinale")
      return ["Halbfinale1", "Halbfinale2", "Halbfinale3", "Halbfinale4"];
    if (key === "Plätze 16-18") return ["Platz16", "Platz17", "Platz18"];
    if (key === "Absteiger") return ["Absteiger1", "Absteiger2", "Absteiger3"];
    return [key];
  });

  const header = `
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center">
      ${pill("Bonus", "good")}
      ${pill(`${playerRows.length} Tipper`, "neutral")}
      ${pill(`${displayKeys.length} Felder`, "neutral")}
    </div>
  `;

  const resultTiles = `
    <div class="bonusMatrix bonusMatrixResults">
      ${displayKeys
        .map((displayKey) => {
          if (displayKey.startsWith("Halbfinale")) {
            const idx = Number(displayKey.replace("Halbfinale", "")) - 1;
            const vals = normalizeBonusValue(resultFor("Halbfinale"));
            const val = vals[idx] ?? "—";
            const pts = pointsFor("Halbfinale");
            const isDecided =
              String(val).trim() !== "" &&
              String(val).trim() !== "-" &&
              String(val).trim() !== "—";

            return `
            <div class="bonusCell bonusResultCell">
              <div class="bonusCellLabel">
                Halbfinale${idx + 1}
                <span class="small" style="opacity:.7">(${pts}P)</span>
              </div>
              <div class="bonusCellValue bonusAnswers">
                <span class="bonusAnswer ${isDecided ? "bonusAnswerHit" : ""}">
                  ${escapeHtml(resolveTeamLabel(val))}
                </span>
              </div>
            </div>
          `;
          }

          if (displayKey.startsWith("Platz")) {
            const idx = Number(displayKey.replace("Platz", "")) - 16;
            const vals = normalizeBonusValue(resultFor("Plätze 16-18"));
            const val = vals[idx] ?? "—";
            const pts = pointsFor("Plätze 16-18");
            const isDecided =
              String(val).trim() !== "" &&
              String(val).trim() !== "-" &&
              String(val).trim() !== "—";

            return `
            <div class="bonusCell bonusResultCell">
              <div class="bonusCellLabel">
                Platz ${16 + idx}
                <span class="small" style="opacity:.7">(${pts}P)</span>
              </div>
              <div class="bonusCellValue bonusAnswers">
                <span class="bonusAnswer ${isDecided ? "bonusAnswerHit" : ""}">
                  ${escapeHtml(resolveTeamLabel(val))}
                </span>
              </div>
            </div>
          `;
          }

          if (displayKey.startsWith("Absteiger")) {
            const idx = Number(displayKey.replace("Absteiger", "")) - 1;
            const vals = normalizeBonusValue(resultFor("Absteiger"));
            const val = vals[idx] ?? "—";
            const pts = pointsFor("Absteiger");
            const isDecided =
              String(val).trim() !== "" &&
              String(val).trim() !== "-" &&
              String(val).trim() !== "—";

            return `
            <div class="bonusCell bonusResultCell">
              <div class="bonusCellLabel">
                Absteiger ${idx + 1}
                <span class="small" style="opacity:.7">(${pts}P)</span>
              </div>
              <div class="bonusCellValue bonusAnswers">
                <span class="bonusAnswer ${isDecided ? "bonusAnswerHit" : ""}">
                  ${escapeHtml(resolveTeamLabel(val))}
                </span>
              </div>
            </div>
          `;
          }

          const resultVals = normalizeBonusValue(resultFor(displayKey));
          const pts = pointsFor(displayKey);
          const isDecided = hasDecidedBonusResult(resultFor(displayKey));

          return `
          <div class="bonusCell bonusResultCell">
            <div class="bonusCellLabel">
              ${escapeHtml(labelFor(displayKey))}
              <span class="small" style="opacity:.7">(${pts}P)</span>
            </div>
            <div class="bonusCellValue bonusAnswers">
              ${
                resultVals.length
                  ? resultVals
                      .map(
                        (v) => `
                      <span class="bonusAnswer ${isDecided ? "bonusAnswerHit" : ""}">
                        ${escapeHtml(resolveTeamLabel(v))}
                      </span>
                    `,
                      )
                      .join("")
                  : `<span class="bonusAnswer">—</span>`
              }
            </div>
          </div>
        `;
        })
        .join("")}
    </div>
  `;

  $("#mdContent").innerHTML = `
    ${header}
    <div class="card" style="margin:10px 0">
      <div class="bd">
        <div class="hd">
          <h3>Bonus-Ergebnisse</h3>
          <p>Hinterlegte Resultate und Punkte pro Bonusfrage.</p>
        </div>
        <div style="margin-top:10px">
          ${resultTiles || `<span class="small">Keine Bonus-Ergebnisse vorhanden.</span>`}
        </div>
      </div>
    </div>
  `;

  const rows = playerRows
    .sort((a, b) => {
      const an = playersBySlug[a.player]?.name || a.name || a.player;
      const bn = playersBySlug[b.player]?.name || b.name || b.player;
      return String(an).localeCompare(String(bn));
    })
    .map((p) => {
      const preds = p.predictions || {};
      let bonusPoints = 0;

      const predictionGrid = `
        <div class="bonusMatrix">
          ${rawKeys
            .flatMap((key) => {
              const pts = pointsFor(key);

              if (key === "Halbfinale") {
                const playerVals = normalizeBonusValue(preds[key]);
                const resultVals = normalizeBonusValue(resultFor("Halbfinale"));
                const resultSet = new Set(
                  resultVals.map((x) => String(x).trim().toLowerCase()),
                );

                return Array.from({ length: 4 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = String(val).trim().toLowerCase();
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    resultSet.has(normalizedVal);

                  if (isHit) bonusPoints += pts;

                  const cellClass = isHit
                    ? "bonusHit"
                    : isDecided
                      ? "bonusMiss"
                      : "";
                  const answerClass = isHit
                    ? "bonusAnswerHit"
                    : isDecided
                      ? "bonusAnswerMiss"
                      : "";

                  return `
                  <div class="bonusCell ${cellClass}">
                    <div class="bonusCellLabel">
                      Halbfinale${i + 1}
                      <span class="small" style="opacity:.7">(${pts}P)</span>
                    </div>
                    <div class="bonusCellValue bonusAnswers">
                      <span class="bonusAnswer ${answerClass}">
                        ${typeof getTeamLogo === "function" && val && val !== "—" ? `<img src="${escapeHtml(getTeamLogo(val) || "")}" class="teamLogoSmall">` : ""}
                        ${escapeHtml(resolveTeamLabel(val))}
                      </span>
                    </div>
                  </div>
                `;
                });
              }

              if (key === "Plätze 16-18") {
                const playerVals = normalizeBonusValue(preds[key]);
                const resultVals = normalizeBonusValue(
                  resultFor("Plätze 16-18"),
                );
                const resultSet = new Set(
                  resultVals.map((x) => String(x).trim().toLowerCase()),
                );

                return Array.from({ length: 3 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = String(val).trim().toLowerCase();
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    resultSet.has(normalizedVal);

                  if (isHit) bonusPoints += pts;

                  const cellClass = isHit
                    ? "bonusHit"
                    : isDecided
                      ? "bonusMiss"
                      : "";
                  const answerClass = isHit
                    ? "bonusAnswerHit"
                    : isDecided
                      ? "bonusAnswerMiss"
                      : "";

                  return `
                  <div class="bonusCell ${cellClass}">
                    <div class="bonusCellLabel">
                      Platz ${16 + i}
                      <span class="small" style="opacity:.7">(${pts}P)</span>
                    </div>
                    <div class="bonusCellValue bonusAnswers">
                      <span class="bonusAnswer ${answerClass}">
                        ${typeof getTeamLogo === "function" && val && val !== "—" ? `<img src="${escapeHtml(getTeamLogo(val) || "")}" class="teamLogoSmall">` : ""}
                        ${escapeHtml(resolveTeamLabel(val))}
                      </span>
                    </div>
                  </div>
                `;
                });
              }

              if (key === "Absteiger") {
                const playerVals = normalizeBonusValue(preds[key]);
                const resultVals = normalizeBonusValue(resultFor("Absteiger"));
                const resultSet = new Set(
                  resultVals.map((x) => String(x).trim().toLowerCase()),
                );

                return Array.from({ length: 3 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = String(val).trim().toLowerCase();
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    resultSet.has(normalizedVal);

                  if (isHit) bonusPoints += pts;

                  const cellClass = isHit
                    ? "bonusHit"
                    : isDecided
                      ? "bonusMiss"
                      : "";
                  const answerClass = isHit
                    ? "bonusAnswerHit"
                    : isDecided
                      ? "bonusAnswerMiss"
                      : "";

                  return `
                  <div class="bonusCell ${cellClass}">
                    <div class="bonusCellLabel">
                      Absteiger ${i + 1}
                      <span class="small" style="opacity:.7">(${pts}P)</span>
                    </div>
                    <div class="bonusCellValue bonusAnswers">
                      <span class="bonusAnswer ${answerClass}">
                        ${typeof getTeamLogo === "function" && val && val !== "—" ? `<img src="${escapeHtml(getTeamLogo(val) || "")}" class="teamLogoSmall">` : ""}
                        ${escapeHtml(resolveTeamLabel(val))}
                      </span>
                    </div>
                  </div>
                `;
                });
              }

              const playerVals = normalizeBonusValue(preds[key]);
              const resultVals = normalizeBonusValue(resultFor(key));
              const resultSet = new Set(
                resultVals.map((x) => String(x).trim().toLowerCase()),
              );
              const isDecided = hasDecidedBonusResult(resultFor(key));

              let localPoints = 0;
              let hasAnyMiss = false;

              const displayValues = playerVals.length
                ? playerVals
                    .map((v) => {
                      const normalizedVal = String(v).trim().toLowerCase();
                      const isHit =
                        normalizedVal !== "" &&
                        normalizedVal !== "—" &&
                        resultSet.has(normalizedVal);

                      if (isHit) {
                        localPoints += pts;
                      } else if (isDecided) {
                        hasAnyMiss = true;
                      }

                      const answerClass = isHit
                        ? "bonusAnswerHit"
                        : isDecided
                          ? "bonusAnswerMiss"
                          : "";

                      return `
                    <span class="bonusAnswer ${answerClass}">
                      ${typeof getTeamLogo === "function" && v && v !== "—" ? `<img src="${escapeHtml(getTeamLogo(v) || "")}" class="teamLogoSmall">` : ""}
                      ${escapeHtml(resolveTeamLabel(v))}
                    </span>
                  `;
                    })
                    .join("")
                : `<span class="bonusAnswer">—</span>`;

              bonusPoints += localPoints;

              const cellClass =
                localPoints > 0
                  ? "bonusHit"
                  : isDecided && hasAnyMiss
                    ? "bonusMiss"
                    : "";

              return `
              <div class="bonusCell ${cellClass}">
                <div class="bonusCellLabel">
                  ${escapeHtml(labelFor(key))}
                  <span class="small" style="opacity:.7">(${pts}P)</span>
                </div>
                <div class="bonusCellValue bonusAnswers">
                  ${displayValues}
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;

      return `
        <tr class="row bonusRow">
          <td colspan="3" class="bonusRowFull">
            <div class="bonusHeader">
              <div class="bonusPlayer">
                ${playerChip(p.player)}
              </div>

              <div class="bonusPoints">
                <span class="pill neutral">${bonusPoints}</span>
              </div>
            </div>

            <div class="bonusTipsCell">
              ${predictionGrid}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  $("#mdTable").innerHTML = renderTable(rows, ["Spieler"]);
  $("#mdTableMeta").textContent =
    "Bonustipps als Matrix. Grün = richtig, Rot = falsch, Weiß = offen.";
  $("#overall").innerHTML = "";
}

function renderBanner() {
  // Banner aus games_index
  const indexGame = (Array.isArray(gIndex) ? gIndex : gIndex?.games || []).find(
    (g) => g.id === game.id,
  );

  let bannerSrc = indexGame?.banner;

  // Fallback
  if (!bannerSrc) {
    bannerSrc = `img/banners/${game.id}.png`;
  }

  const bannerHTML = `
    <div class="card gameBannerCard">
      <img src="${bannerSrc}" class="gameBanner">
    </div>
  `;

  const tabs = document.querySelector("#mdTabs");
  if (tabs) {
    tabs.insertAdjacentHTML("beforebegin", bannerHTML);
  }
}

function renderGameNavigation(game, gamesIndex) {
  if (!game || !game.id) return;

  const tabsEl = $("#mdTabs");
  if (!tabsEl) return;

  const items = (
    Array.isArray(gamesIndex) ? gamesIndex : gamesIndex?.games || []
  )
    .slice()
    .sort((a, b) => {
      const as = parseISODate(a.start)?.getTime() ?? 0;
      const bs = parseISODate(b.start)?.getTime() ?? 0;
      return as - bs;
    });

  const idx = items.findIndex((g) => g?.id === game.id);
  if (idx < 0) return;

  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx < items.length - 1 ? items[idx + 1] : null;

  const compItems = items.filter((g) => g.competition === game.competition);
  const compIdx = compItems.findIndex((g) => g?.id === game.id);
  const prevComp = compIdx > 0 ? compItems[compIdx - 1] : null;
  const nextComp =
    compIdx >= 0 && compIdx < compItems.length - 1
      ? compItems[compIdx + 1]
      : null;

  // Alte Navigation entfernen, falls schon vorhanden
  document.querySelectorAll(".gameNavMount").forEach((el) => el.remove());

  const navHTML = `
    <div class="gameNavMount" style="margin:12px 0 10px 0">
      <div class="card">
        <div class="bd gameNav">
          <div>
            ${prev ? `<a class="gameNavBtn" href="${linkGame(prev.id)}">← <span>${escapeHtml(prev.title)}</span></a>` : `<span></span>`}
          </div>
          <div class="gameNavCenter">Alle Wettbewerbe</div>
          <div>
            ${next ? `<a class="gameNavBtn" href="${linkGame(next.id)}"><span>${escapeHtml(next.title)}</span> →</a>` : `<span></span>`}
          </div>
        </div>
      </div>

      <div class="card" style="margin-top:10px">
        <div class="bd gameNav">
          <div>
            ${prevComp ? `<a class="gameNavBtn" href="${linkGame(prevComp.id)}">← <span>${escapeHtml(prevComp.title)}</span></a>` : `<span></span>`}
          </div>
          <div class="gameNavCenter">${pill(game.competition, "neutral")}</div>
          <div>
            ${nextComp ? `<a class="gameNavBtn" href="${linkGame(nextComp.id)}"><span>${escapeHtml(nextComp.title)}</span> →</a>` : `<span></span>`}
          </div>
        </div>
      </div>
    </div>
  `;

  tabsEl.insertAdjacentHTML("beforebegin", navHTML);
}

async function loadMatchday(md) {
  if (md._loaded) return md; // Cache

  const data = await fetch(md.file).then((r) => r.json());

  // Daten reinmischen
  Object.assign(md, data);
  md._loaded = true;

  return md;
}

(async function init() {
  players = await loadJSON("data/players.json");
  playersBySlug = Object.fromEntries(players.map((p) => [p.slug, p]));
  await loadTeams();
  gIndex = await loadJSON("data/games_index.json");

  const id = getParam("id") || gIndex[0]?.id;
  game = await loadJSON(`data/games/game_${id}.json`);

  syncMobileCompNav();
  renderGameNavigation(game, gIndex);
  renderBanner();

  if (window.innerWidth <= 768) {
    const navAll = document.getElementById("gameNavAll");
    const navComp = document.getElementById("gameNavComp");
    if (navAll) navAll.style.display = "none";
    if (navComp) navComp.style.display = "none";
  }

  $("#gTitle").textContent = game.title;
  $("#gMeta").innerHTML = `${pill(game.competition, "good")}
     ${pill(game.season, "neutral")}
     ${pill(`${(game.matchdays || []).length} Spieltage`, "neutral")}`;

  const matchdayTabs = (game.matchdays || [])
    .map(
      (md, i) => `
  <div class="tab" data-i="${i}" data-type="matchday">${md.no ?? i + 1}</div>
`,
    )
    .join("");

  const bonusTab = hasBonusTab()
    ? `<div class="tab" data-i="bonus" data-type="bonus">Bonus</div>`
    : "";
  const playerStatsTab = `<div class="tab" data-i="spielerstatistik" data-type="playerstats">Spielerstatistik</div>`;
  const matchdayStatsTab = `<div class="tab" data-i="spieltagsstatistik" data-type="matchdaystats">Spieltagsstatistik</div>`;
  const topsFlopsTab = `<div class="tab" data-i="topsflops" data-type="topsflops">Tops & Flops</div>`;

  $("#mdTabs").innerHTML =
    matchdayTabs + bonusTab + playerStatsTab + matchdayStatsTab + topsFlopsTab;

  [...document.querySelectorAll(".tab")].forEach((el) => {
    el.addEventListener("click", async () => {
      [...document.querySelectorAll(".tab")].forEach((x) =>
        x.classList.remove("active"),
      );
      el.classList.add("active");

      if (el.dataset.type === "bonus") {
        renderBonusTab();
        return;
      }
      if (el.dataset.type === "playerstats") {
        await renderPlayerStatsTab();
        return;
      }
      if (el.dataset.type === "matchdaystats") {
        await renderMatchdayStatsTab();
        return;
      }
      if (el.dataset.type === "topsflops") {
        await renderTopsFlopsTab();
        return;
      }

      setStatsSectionsVisibility(true);
      const i = Number(el.dataset.i);
      const md = await loadMatchday(game.matchdays[i]);
      renderMatchday(md);
      await renderOverall(i);
    });
  });

  const mdRaw = getParam("md");
  const mdParam = parseInt(mdRaw, 10);

  const tabs = [...document.querySelectorAll("#mdTabs .tab")];
  tabs.forEach((t) => t.classList.remove("active"));

  const mdMode = String(mdRaw).toLowerCase();
  if (mdMode === "bonus" && hasBonusTab()) {
    const bonusEl = tabs.find((t) => t.dataset.type === "bonus");
    if (bonusEl) bonusEl.classList.add("active");
    renderBonusTab();
  } else if (mdMode === "spielerstatistik" || mdMode === "playerstats") {
    const tabEl = tabs.find((t) => t.dataset.type === "playerstats");
    if (tabEl) tabEl.classList.add("active");
    await renderPlayerStatsTab();
  } else if (mdMode === "spieltagsstatistik" || mdMode === "matchdaystats") {
    const tabEl = tabs.find((t) => t.dataset.type === "matchdaystats");
    if (tabEl) tabEl.classList.add("active");
    await renderMatchdayStatsTab();
  } else if (mdMode === "topsflops") {
    const tabEl = tabs.find((t) => t.dataset.type === "topsflops");
    if (tabEl) tabEl.classList.add("active");
    await renderTopsFlopsTab();
  } else {
    setStatsSectionsVisibility(true);
    const startIndex =
      Number.isFinite(mdParam) &&
      mdParam > 0 &&
      mdParam <= game.matchdays.length
        ? mdParam - 1
        : game.matchdays.length - 1;

    const startTab = tabs.find(
      (t) =>
        t.dataset.type === "matchday" && Number(t.dataset.i) === startIndex,
    );
    if (startTab) startTab.classList.add("active");

    const md = await loadMatchday(game.matchdays[startIndex]);
    renderMatchday(md);
    await renderOverall(startIndex);
  }
})();

function toggleMatch(el) {
  const card = el.closest(".matchCard");
  card.classList.toggle("open");
}
