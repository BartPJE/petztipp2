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


function normalizeBonusCompareValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return raw.toLowerCase();
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
  const resultSet = new Set(resultVals.map((x) => normalizeBonusCompareValue(x)));

  for (const val of playerVals) {
    if (resultSet.has(normalizeBonusCompareValue(val))) {
      score += pts;
    }
  }

  return score;
}

function bonusHitsForQuestion(playerValue, resultValue) {
  const playerVals = normalizeBonusValue(playerValue);
  const resultVals = normalizeBonusValue(resultValue);

  if (!playerVals.length || !resultVals.length) return [];

  const resultSet = new Set(resultVals.map((x) => normalizeBonusCompareValue(x)));
  return playerVals.map((v) => ({
    value: v,
    hit: resultSet.has(normalizeBonusCompareValue(v)),
  }));
}


function getBonusPickIdentifier(pick) {
  const candidate =
    pick?.player ?? pick?.slug ?? pick?.tipper ?? pick?.tipperId ?? pick?.name;
  return String(candidate ?? "").trim();
}

function getBonusPickDisplayName(pick) {
  const slug = getBonusPickIdentifier(pick);
  if (slug && playersBySlug[slug]?.name) return playersBySlug[slug].name;

  const fallback =
    pick?.name ?? pick?.playerName ?? pick?.tipperName ?? pick?.player ?? slug;
  return String(fallback ?? "Unbekannt").trim() || "Unbekannt";
}

function bonusPlayerChip(pick) {
  const slug = getBonusPickIdentifier(pick);
  if (slug && playersBySlug[slug]) return playerChip(slug);

  return `<span class="person"><span><b>${escapeHtml(getBonusPickDisplayName(pick))}</b></span></span>`;
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

function getDayWinShare(md, tip) {
  if (!tip) return 0;

  if (tip.dayWin !== undefined && tip.dayWin !== null && tip.dayWin !== "") {
    if (tip.dayWin === true) {
      const winnerCount = (md?.tips || []).filter((t) => {
        const hasPicks = t.picks && Object.keys(t.picks).length > 0;
        const hasBonus = Number(t.bonus || 0) > 0;
        if (!hasPicks && !hasBonus) return false;
        return t.dayWin === true || Number(t.dayWin || 0) > 0;
      }).length;
      return winnerCount > 0 ? 1 / winnerCount : 0;
    }

    const numeric = Number(tip.dayWin || 0);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
  }

  return 0;
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
        s.dayWinsTotal += getDayWinShare(md, tip);
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
let crossTableCache = null;
let crossTablePromise = null;
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
      const nonWinnerTips = tips.filter((t) => !winners.includes(t));
      let dayTotalPoints = 0;
      let dayPlayers = 0;
      let dayWinnerPoints = 0;
      let dayTotalPointsNoWinners = 0;
      let dayPlayersNoWinners = 0;

      tips.forEach((t) => {
        const p = ensurePlayer(t.player);
        const pickEntries = Object.entries(t.picks || {});
        const pickedGames = pickEntries.length;
        const tipPoints = Number(t.points || 0);
        const bonusPoints = Number(t.bonus || 0);
        const dayPoints = tipPoints + bonusPoints;
        const dayWinVal = getDayWinShare(md, t);

        dayTotalPoints += dayPoints;
        dayPlayers += 1;
        dayWinnerPoints = Math.max(dayWinnerPoints, dayPoints);

        p.totalPoints += dayPoints;
        p.pickedGames += pickedGames;
        p.tippedMatchdays += 1;
        p.dayWinsCumulative += dayWinVal;
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

      nonWinnerTips.forEach((t) => {
        dayTotalPointsNoWinners += Number(t.points || 0) + Number(t.bonus || 0);
        dayPlayersNoWinners += 1;
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
        totalPointsNoWinners: dayTotalPointsNoWinners,
        gamesCount,
        pointsPerGame: safeDiv(dayTotalPoints, gamesCount),
        pointsPerGameNoWinners: safeDiv(dayTotalPointsNoWinners, gamesCount),
        playersCount: dayPlayers,
        pointsPerPlayer: safeDiv(dayTotalPoints, dayPlayers),
        playersCountNoWinners: dayPlayersNoWinners,
        pointsPerPlayerNoWinners: safeDiv(
          dayTotalPointsNoWinners,
          dayPlayersNoWinners,
        ),
        hasTips: dayPlayers > 0,
        hasNonWinnerTips: dayPlayersNoWinners > 0,
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
  equalColumns = false,
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
      const colWidth = equalColumns ? ` style="width:${100 / columns.length}%"` : "";
      const titleAttr = c.title ? ` title="${escapeHtml(c.title)}"` : "";
      return `<th${colWidth}><button class="sortBtn ${active ? "active" : ""}" data-table="${tableId}" data-key="${c.key}"${titleAttr}>${escapeHtml(c.label)} ${dir}</button></th>`;
    })
    .join("");

  const body = sorted
    .map(
      (r) =>
        `<tr class="row">${columns.map((c) => `<td${equalColumns ? ` style="width:${100 / columns.length}%"` : ""}>${c.render ? c.render(r) : escapeHtml(r[c.key])}</td>`).join("")}</tr>`,
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
          equalColumns,
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
  equalColumns = false,
  fixedLeadingColumnWidths = [],
}) {
  const state = sortableTablesState[linkedTableId];
  const sorted = sortRowsByState(rows, allColumns, state);
  const fixedWidthCount = Math.min(fixedLeadingColumnWidths.length, columns.length);
  const fixedWidthSum = fixedLeadingColumnWidths
    .slice(0, fixedWidthCount)
    .reduce((sum, width) => sum + Number(width || 0), 0);
  const flexibleCount = Math.max(columns.length - fixedWidthCount, 1);
  const flexibleWidth = Math.max(0, (100 - fixedWidthSum) / flexibleCount);
  const columnWidthStyle = (index) => {
    if (!equalColumns) return "";
    const width = index < fixedWidthCount ? fixedLeadingColumnWidths[index] : flexibleWidth;
    return ` style="width:${width}%"`;
  };

  const headers = columns
    .map((c, i) => {
      const active = c.key === state.key;
      const dir = active ? (state.dir === "asc" ? "↑" : "↓") : "";
      const titleAttr = c.title ? ` title="${escapeHtml(c.title)}"` : "";
      return `<th${columnWidthStyle(i)}><button class="sortBtn ${active ? "active" : ""}" data-linked-table="${linkedTableId}" data-key="${c.key}"${titleAttr}>${escapeHtml(c.label)} ${dir}</button></th>`;
    })
    .join("");

  const body = sorted
    .map(
      (r) =>
        `<tr class="row">${columns.map((c, i) => `<td${columnWidthStyle(i)}>${c.render ? c.render(r) : escapeHtml(r[c.key])}</td>`).join("")}</tr>`,
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

  const sortedForOverallRank = [...playerRows].sort((a, b) => {
    if (Number(b.totalPoints || 0) !== Number(a.totalPoints || 0)) {
      return Number(b.totalPoints || 0) - Number(a.totalPoints || 0);
    }
    if (Number(b.dayWinsCumulative || 0) !== Number(a.dayWinsCumulative || 0)) {
      return Number(b.dayWinsCumulative || 0) - Number(a.dayWinsCumulative || 0);
    }
    return String(playersBySlug[a.player]?.name || a.player).localeCompare(
      String(playersBySlug[b.player]?.name || b.player),
      "de",
    );
  });

  let rank = 0;
  let lastKey = null;
  sortedForOverallRank.forEach((row, idx) => {
    const key = `${Number(row.totalPoints || 0)}|${Number(row.dayWinsCumulative || 0)}`;
    if (key !== lastKey) rank = idx + 1;
    row.overallRank = rank;
    lastKey = key;
  });

  const allColumns = [
      { key: "overallRank", label: "GP", title: "Gesamtplatzierung", render: (r) => r.overallRank ?? "—" },
      {
        key: "player",
        label: "Sp.",
        title: "Spieler",
        getSortValue: (r) => playersBySlug[r.player]?.name || r.player,
        render: (r) => playerChip(r.player),
      },
      {
        key: "pointsPerPickedGame",
        label: "P/Sp",
        title: "Punkte pro getipptem Spiel",
        render: (r) => fmt2(r.pointsPerPickedGame),
      },
      {
        key: "totalPoints",
        label: "Pkt",
        title: "Gesamtpunkte",
        render: (r) => Math.round(r.totalPoints),
      },
      { key: "pickedGames", label: "Tipps", title: "Getippte Spiele" },
      {
        key: "dayWinsCumulative",
        label: "TS kum",
        title: "Tagessiege kumuliert",
        render: (r) => fmt2(r.dayWinsCumulative),
      },
      { key: "dayWinnerCount", label: "TS Tg", title: "Tagessieger-Tage" },
      { key: "bonusPoints", label: "Bonus", title: "Bonuspunkte" },
      { key: "days20Plus", label: "20+", title: "Spieltage mit mindestens 20 Punkten" },
      { key: "daysZeroWithPick", label: "0P", title: "Spieltage mit 0 Punkten trotz Tipp" },
      {
        key: "highestDayPoints",
        label: "Max",
        title: "Höchste Tagespunkte",
        render: (r) => r.highestDayPoints ?? "—",
      },
      {
        key: "lowestDayPoints",
        label: "Min",
        title: "Niedrigste Tagespunkte",
        render: (r) => r.lowestDayPoints ?? "—",
      },
      { key: "firstPlaceCount", label: "P1", title: "Wie oft Platz 1 Gesamt" },
      {
        key: "bestRank",
        label: "Best",
        title: "Bester Platz",
        render: (r) => r.bestRank ?? "—",
      },
      {
        key: "worstRank",
        label: "Schl.",
        title: "Schlechtester Platz",
        render: (r) => r.worstRank ?? "—",
      },
      {
        key: "avgRank",
        label: "ØPl",
        title: "Durchschnittsplatz",
        render: (r) => fmt2(r.avgRank),
      },
      { key: "exactHits", label: "4P", title: "Richtige Ergebnisse (4 Punkte)" },
      { key: "diffHits", label: "3P", title: "Richtiges Torverhältnis (3 Punkte)" },
      { key: "tendencyHits", label: "2P", title: "Richtige Tendenz (2 Punkte)" },
      { key: "wrongHits", label: "0P", title: "Falsch getippte Spiele (0 Punkte)" },
      { key: "tippedMatchdays", label: "SpT", title: "Getippte Spieltage" },
    ];

  const columnsA = allColumns.slice(0, 10);
  const columnsB = [allColumns[0], allColumns[1], ...allColumns.slice(10)];
  const linkedTableId = "playerStats";

  sortableTablesState[linkedTableId] ||= {
    key: "totalPoints",
    dir: "desc",
  };

  renderLinkedSortableTable({
    mountId: "#playerStatsMountA",
    linkedTableId,
    columns: columnsA,
    rows: playerRows,
    allColumns,
    equalColumns: true,
    fixedLeadingColumnWidths: [8, 20],
  });

  renderLinkedSortableTable({
    mountId: "#playerStatsMountB",
    linkedTableId,
    columns: columnsB,
    rows: playerRows,
    allColumns,
    equalColumns: true,
    fixedLeadingColumnWidths: [8, 20],
  });

  document
    .querySelectorAll(`button.sortBtn[data-linked-table="${linkedTableId}"]`)
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.key;
        const t = sortableTablesState[linkedTableId];
        if (t.key === key) {
          t.dir = t.dir === "asc" ? "desc" : "asc";
        } else {
          t.key = key;
          t.dir = "desc";
        }
        renderPlayerStatsTab();
      });
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

  const kpiMatchdays = matchdayStats.filter((row) => row.hasTips);

  const bestAbs = byMetric(kpiMatchdays, "totalPoints");
  const bestRel = byMetric(kpiMatchdays, "pointsPerPlayer");
  const bestCut = byMetric(kpiMatchdays, "pointsPerGame");
  const worstAbs = byMetric(kpiMatchdays, "totalPoints", true);
  const worstRel = byMetric(kpiMatchdays, "pointsPerPlayer", true);
  const worstCut = byMetric(kpiMatchdays, "pointsPerGame", true);

  const matchdayLine = (row, metricLabel, metricValue) =>
    `${row.label} · ${metricLabel}: ${metricValue}`;

  const fallbackKpi = `<div class="kpi"><b>Spieltag-KPIs</b><span>Keine auswertbaren Spieltage vorhanden.</span></div>`;

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
      ${bestAbs.rows[0] ? `<div class="kpi"><b>Bester Spieltag (absolut)</b><span>${escapeHtml(matchdayLine(bestAbs.rows[0], "Punkte", Math.round(bestAbs.value)))}</span></div>` : fallbackKpi}
      ${bestRel.rows[0] ? `<div class="kpi"><b>Bester Spieltag (relativ)</b><span>${escapeHtml(matchdayLine(bestRel.rows[0], "Punkte/Spieler", fmt2(bestRel.value)))}</span></div>` : ""}
      ${bestCut.rows[0] ? `<div class="kpi"><b>Bester Spieltag (Schnitt)</b><span>${escapeHtml(matchdayLine(bestCut.rows[0], "Punkte/Spiel", fmt2(bestCut.value)))}</span></div>` : ""}
      ${worstAbs.rows[0] ? `<div class="kpi"><b>Schlechtester Spieltag (absolut)</b><span>${escapeHtml(matchdayLine(worstAbs.rows[0], "Punkte", Math.round(worstAbs.value)))}</span></div>` : ""}
      ${worstRel.rows[0] ? `<div class="kpi"><b>Schlechtester Spieltag (relativ)</b><span>${escapeHtml(matchdayLine(worstRel.rows[0], "Punkte/Spieler", fmt2(worstRel.value)))}</span></div>` : ""}
      ${worstCut.rows[0] ? `<div class="kpi"><b>Schlechtester Spieltag (Schnitt)</b><span>${escapeHtml(matchdayLine(worstCut.rows[0], "Punkte/Spiel", fmt2(worstCut.value)))}</span></div>` : ""}
    </div>
  `;
}

async function computeCrossTableStats() {
  if (crossTableCache) return crossTableCache;
  if (crossTablePromise) return crossTablePromise;

  crossTablePromise = (async () => {
    const teamMap = new Map();
    const playerSet = new Set();

    for (const mdRef of game?.matchdays || []) {
      const md = await loadMatchday(mdRef);
      const matches = md.matches || [];
      const tips = md.tips || [];

      tips.forEach((t) => playerSet.add(t.player));

      for (const match of matches) {
        const matchPointsByPlayer = {};
        tips.forEach((tip) => {
          const pts = Number(tip?.pickPoints?.[match.id] || 0);
          if (!Number.isFinite(pts)) return;
          matchPointsByPlayer[tip.player] = pts;
        });

        [match.homeTeam || match.home, match.awayTeam || match.away]
          .filter(Boolean)
          .forEach((teamKey) => {
            const entry = teamMap.get(teamKey) || {
              teamKey,
              scores: {},
              total: 0,
            };

            Object.entries(matchPointsByPlayer).forEach(([player, pts]) => {
              entry.scores[player] = Number(entry.scores[player] || 0) + pts;
              entry.total += pts;
            });

            teamMap.set(teamKey, entry);
          });
      }
    }

    const playersInGame = [...playerSet].sort((a, b) =>
      String(playersBySlug[a]?.name || a).localeCompare(
        String(playersBySlug[b]?.name || b),
        "de",
      ),
    );

    const rows = [...teamMap.values()].sort((a, b) =>
      String(resolveTeamLabel(a.teamKey)).localeCompare(
        String(resolveTeamLabel(b.teamKey)),
        "de",
      ),
    );

    const cells = [];
    rows.forEach((row) => {
      playersInGame.forEach((player) => {
        cells.push(Number(row.scores[player] || 0));
      });
    });
    const mean = cells.length
      ? cells.reduce((sum, v) => sum + v, 0) / cells.length
      : 0;
    const maxAbsDelta = Math.max(
      0,
      ...cells.map((v) => Math.abs(Number(v || 0) - mean)),
    );

    crossTableCache = {
      rows,
      playersInGame,
      mean,
      maxAbsDelta,
    };
    return crossTableCache;
  })();

  return crossTablePromise;
}

function crossTableHeatStyle(value, mean, maxAbsDelta) {
  const delta = Number(value || 0) - Number(mean || 0);
  if (!Number.isFinite(delta) || maxAbsDelta <= 0) return "";

  const intensity = Math.min(1, Math.abs(delta) / maxAbsDelta);
  if (intensity < 0.03) return "";

  if (delta > 0) {
    return `background: rgba(76, 190, 110, ${0.08 + intensity * 0.52});`;
  }
  return `background: rgba(230, 75, 75, ${0.08 + intensity * 0.52});`;
}

async function renderCrossTableTab() {
  setStatsSectionsVisibility(false);
  const { rows, playersInGame, mean, maxAbsDelta } = await computeCrossTableStats();

  $("#mdTable").innerHTML = "";
  $("#overall").innerHTML = "";
  $("#mdTableMeta").textContent =
    "Kreuztabelle: Team (Zeilen) × Spieler (Spalten), farbcodiert relativ zum Mittelwert.";

  if (!rows.length || !playersInGame.length) {
    $("#mdContent").innerHTML = `<div class="small">Keine Daten für die Kreuztabelle vorhanden.</div>`;
    return;
  }

  const tableId = "crossTableMain";
  const crossColumns = [
    {
      key: "team",
      label: "Team \\ Spieler",
      getSortValue: (row) => resolveTeamLabel(row.teamKey),
    },
    ...playersInGame.map((slug) => ({
      key: `player_${slug}`,
      label: playersBySlug[slug]?.name || slug,
      avatar: playersBySlug[slug]?.photo || "",
      getSortValue: (row) => Number(row.scores[slug] || 0),
      slug,
    })),
  ];

  const state = sortableTablesState[tableId] || {
    key: "team",
    dir: "asc",
  };
  sortableTablesState[tableId] = state;

  const sortedRows = sortRowsByState(rows, crossColumns, state);

  const headerCells = crossColumns
    .map((column) => {
      const active = column.key === state.key;
      const dir = active ? (state.dir === "asc" ? "↑" : "↓") : "";
      const ariaLabel = `Sortieren nach ${column.label}`;
      const label = column.slug
        ? (column.avatar
            ? `<img class="avatar crossHeaderAvatar" src="${escapeHtml(column.avatar)}" alt="${escapeHtml(column.label)}" title="${escapeHtml(column.label)}">`
            : `<span class="crossHeaderName">${escapeHtml(column.label)}</span>`)
        : escapeHtml(column.label);
      return `<th><button class="sortBtn crossHeaderBtn ${active ? "active" : ""}" data-table="${tableId}" data-key="${column.key}" aria-label="${escapeHtml(ariaLabel)}" title="${escapeHtml(column.label)}">${label}<span class="crossHeaderSort">${dir}</span></button></th>`;
    })
    .join("");

  const bodyRows = sortedRows
    .map((row) => {
      const teamLogo =
        typeof getTeamLogo === "function" ? getTeamLogo(row.teamKey) : "";
      const teamLabel = resolveTeamLabel(row.teamKey);
      const playerCells = playersInGame
        .map((slug) => {
          const val = Number(row.scores[slug] || 0);
          const style = crossTableHeatStyle(val, mean, maxAbsDelta);
          return `<td class="crossCell" style="${style}">${Math.round(val)}</td>`;
        })
        .join("");

      return `
        <tr class="row">
          <td class="crossTeam">
            ${teamLogo ? `<img class="teamLogo" src="${escapeHtml(teamLogo)}" alt="">` : ""}
            <span>${escapeHtml(teamLabel)}</span>
          </td>
          ${playerCells}
        </tr>
      `;
    })
    .join("");

  $("#mdContent").innerHTML = `
    <div class="tableWrap crossTableWrap">
      <table class="table crossTable">
        <thead>
          <tr>
            ${headerCells}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
    </div>
  `;

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
          t.dir = key === "team" ? "asc" : "desc";
        }
        void renderCrossTableTab();
      });
    });
}

function renderBonusTab() {
  setStatsSectionsVisibility(false);
  const dayCard = document.getElementById("matchdayTableSection");
  const overallCard = document.getElementById("overallSection");
  if (dayCard) dayCard.style.display = "";
  if (overallCard) overallCard.style.display = "none";
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
    (p) => getBonusPickIdentifier(p).toLowerCase() === "result",
  );
  const pointsRow = picks.find(
    (p) => getBonusPickIdentifier(p).toLowerCase() === "points",
  );

  const playerRows = picks.filter((p) => {
    const id = getBonusPickIdentifier(p).toLowerCase();
    return id !== "result" && id !== "points";
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
      const an = getBonusPickDisplayName(a);
      const bn = getBonusPickDisplayName(b);
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
                  resultVals.map((x) => normalizeBonusCompareValue(x)),
                );
                return Array.from({ length: 4 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = normalizeBonusCompareValue(val);
                  const normalizedResultVal = normalizeBonusCompareValue(resultVal);
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    normalizedResultVal !== "" &&
                    normalizedResultVal !== "—" &&
                    normalizedVal === normalizedResultVal;

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
                  resultVals.map((x) => normalizeBonusCompareValue(x)),
                );
                return Array.from({ length: 3 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = normalizeBonusCompareValue(val);
                  const normalizedResultVal = normalizeBonusCompareValue(resultVal);
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    normalizedResultVal !== "" &&
                    normalizedResultVal !== "—" &&
                    normalizedVal === normalizedResultVal;

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
                  resultVals.map((x) => normalizeBonusCompareValue(x)),
                );
                return Array.from({ length: 3 }).map((_, i) => {
                  const val = playerVals[i] ?? "—";
                  const resultVal = resultVals[i] ?? "—";
                  const normalizedVal = normalizeBonusCompareValue(val);
                  const normalizedResultVal = normalizeBonusCompareValue(resultVal);
                  const isDecided =
                    String(resultVal).trim() !== "" &&
                    String(resultVal).trim() !== "-" &&
                    String(resultVal).trim() !== "—";

                  const isHit =
                    normalizedVal !== "" &&
                    normalizedVal !== "—" &&
                    normalizedResultVal !== "" &&
                    normalizedResultVal !== "—" &&
                    normalizedVal === normalizedResultVal;

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
                resultVals.map((x) => normalizeBonusCompareValue(x)),
              );
              const isDecided = hasDecidedBonusResult(resultFor(key));

              let localPoints = 0;
              let hasAnyMiss = false;

              const displayValues = playerVals.length
                ? playerVals
                    .map((v) => {
                      const normalizedVal = normalizeBonusCompareValue(v);
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
                ${bonusPlayerChip(p)}
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
  const crossTableTab = `<div class="tab" data-i="kreuztabelle" data-type="crosstable">Kreuztabelle</div>`;

  $("#mdTabs").innerHTML =
    matchdayTabs +
    bonusTab +
    playerStatsTab +
    matchdayStatsTab +
    topsFlopsTab +
    crossTableTab;

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
      if (el.dataset.type === "crosstable") {
        await renderCrossTableTab();
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
  } else if (mdMode === "kreuztabelle" || mdMode === "crosstable") {
    const tabEl = tabs.find((t) => t.dataset.type === "crosstable");
    if (tabEl) tabEl.classList.add("active");
    await renderCrossTableTab();
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
