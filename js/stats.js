let players=[], playersBySlug={}, gIndex=[], games=[];

function fmt2(x){
  return Number(x || 0).toFixed(2);
}

function compKey(g){
  return g?.competition || "Unbekannt";
}

function gameLabel(g){
  return `${g.competition} ${g.season}`;
}

function dayScore(t){
  return Number(t?.points || 0) + Number(t?.bonus || 0);
}

function dayWinValue(t){
  if (!t) return 0;
  if (t.dayWin === true) return 1;
  const n = Number(t.dayWin || 0);
  return Number.isFinite(n) ? n : 0;
}

function tippedMatchCount(t){
  return Object.keys(t?.picks || {}).filter(k => {
    const v = t.picks[k];
    return v !== null && v !== undefined && v !== "";
  }).length;
}

function mdRankFromTips(md, slug){
  const tips = (md.tips || []).filter(t => {
    const hasPicks = t.picks && Object.keys(t.picks).length > 0;
    const hasBonus = Number(t.bonus || 0) > 0;
    return hasPicks || hasBonus;
  });

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

  let rank = 0;
  let lastPts = null;
  for(let i=0; i<sorted.length; i++){
    const pts = Number(sorted[i].points || 0);
    if(lastPts === null || pts !== lastPts) rank = i + 1;
    lastPts = pts;
    if(sorted[i].player === slug) return rank;
  }
  return null;
}

function computeOverallUntil(matchdays, mdIndex){
  const totals = {};

  for(let i = 0; i <= mdIndex; i++){
    const md = matchdays[i];

    for(const tip of (md.tips || [])){
      const hasPicks = tip.picks && Object.keys(tip.picks).length > 0;
      const hasBonus = Number(tip.bonus || 0) > 0;
      if(!hasPicks && !hasBonus) continue;

      const row = (totals[tip.player] ||= {
        player: tip.player,
        points: 0,
        dayWinsTotal: 0
      });

      row.points += dayScore(tip);

      if (tip.dayWinsTotal !== undefined && tip.dayWinsTotal !== null && tip.dayWinsTotal !== "") {
        row.dayWinsTotal = Math.max(row.dayWinsTotal, Number(tip.dayWinsTotal || 0));
      } else {
        row.dayWinsTotal += dayWinValue(tip);
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

function inc(map, slug, by = 1){
  map[slug] = (map[slug] || 0) + by;
}

function topRows(records, valueKey = "value"){
  return [...records]
    .sort((a,b) =>
      (Number(b[valueKey] || 0) - Number(a[valueKey] || 0)) ||
      ((playersBySlug[a.slug]?.name || a.slug).localeCompare(playersBySlug[b.slug]?.name || b.slug))
    )
    .slice(0, 10);
}

function playerCell(slug, subline = ""){
  const p = playersBySlug[slug];
  if(!p) return escapeHtml(slug);

  return `
    <div class="person">
      <img class="avatar" src="${escapeHtml(p.photo || "")}" alt="">
      <div>
        <a href="${linkPlayer(slug)}"><b>${escapeHtml(p.name || slug)}</b></a>
        ${subline ? `<div class="small">${subline}</div>` : ""}
      </div>
    </div>
  `;
}

function computeAll(){
  const acc={};
  for(const p of players){
    acc[p.slug]={
      slug:p.slug,name:p.name,nickname:p.nickname,home:p.home,photo:p.photo,
      gold:0,silver:0,bronze:0,medals:0,titles:0,
      points:0,matchdays:0,participations:0
    };
  }

  const winners=[];
  for(const g of games){
    const podium = getOverallFromGame(g).filter(x=>x.rank<=3).sort((a,b)=>a.rank-b.rank);
    if(podium[0]) winners.push({
      gameId:g.id,title:g.title,comp:g.competition,season:g.season,winner:podium[0].player
    });

    const set=new Set();
for (const md of (g.matchdays || [])) {
  for (const t of (md.tips || [])) {
    const hasPicks = t.picks && Object.keys(t.picks).length > 0;
    const hasBonus = Number(t.bonus || 0) > 0;
    if (!hasPicks && !hasBonus) continue;

    const a = acc[t.player];
    if (!a) continue;

    const pts = Number(t.points || 0) + Number(t.bonus || 0);
    a.points += pts;
    a.matchdays += 1;

    set.add(t.player);
  }
}
    for(const s of set){ if(acc[s]) acc[s].participations++; }

    podium.forEach((r,i)=>{
      const a=acc[r.player]; if(!a) return;
      a.medals++;
      if(i===0){ a.gold++; a.titles++; }
      if(i===1) a.silver++;
      if(i===2) a.bronze++;
    });
  }

  const arr=Object.values(acc)
    .filter(x=>x.participations>0)
    .map(x=>{ x.avg = x.matchdays ? x.points/x.matchdays : 0; return x; });

  return {arr,winners};
}

function renderMedalMirror(arr){
  const rows = [...arr]
    .sort((a,b)=> (b.gold-a.gold)||(b.silver-a.silver)||(b.bronze-a.bronze)||(b.points-a.points))
    .map((s,idx)=>`
      <tr class="row medal-row">
        <td class="medal-rank">${idx+1}</td>
        <td class="medal-player">
          <div class="person">
            <img class="avatar" src="${escapeHtml(s.photo)}" alt="">
            <div>
              <a href="${linkPlayer(s.slug)}"><b>${escapeHtml(s.name)}</b></a>
              <div class="small">${escapeHtml(s.nickname || "")}</div>
            </div>
          </div>
        </td>
        <td class="medal-stat"><span class="pill miniPill good">🥇 ${s.gold}</span></td>
        <td class="medal-stat"><span class="pill miniPill neutral">🥈 ${s.silver}</span></td>
        <td class="medal-stat"><span class="pill miniPill neutral">🥉 ${s.bronze}</span></td>
        <td class="medal-stat"><span class="pill miniPill neutral">🏅 ${s.medals}</span></td>
      </tr>
    `).join("");

  return `
    <div class="medal-table-wrap">
      ${renderTable(rows, ["#", "Spieler", "Gold", "Silber", "Bronze", "Summe"])}
    </div>
  `;
}

function renderWinners(winners){
  const today = new Date();

  const rows = winners
    .filter(w => {
      const game = gIndex.find(g => g.id === w.gameId);
      if (!game?.end) return true;

      const endDate = new Date(`${game.end}T23:59:59`);
      return endDate < today;
    })
    .sort((a,b)=> (b.season || "").localeCompare(a.season || ""))
    .map(w => {
      const p = playersBySlug[w.winner];
      return `
        <tr class="row winner-row">
          <td class="winner-game-cell">
            <a href="${linkGame(w.gameId)}"><b>${escapeHtml(w.title)}</b></a>
            <div class="small">${escapeHtml(w.comp)} · ${escapeHtml(w.season)}</div>
          </td>
          <td class="winner-player-cell">
            <div class="person">
              <img class="avatar" src="${escapeHtml(p?.photo || "")}" alt="">
              <div>
                <a href="${linkPlayer(w.winner)}"><b>${escapeHtml(p?.name || w.winner)}</b></a>
              </div>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  return `<div class="winners-table-wrap">${renderTable(rows, ["Tippspiel", "Sieger"])}</div>`;
}

function renderTops(arr){
  const by = (label, field) => {
    if (!arr.length) return "";
    const best=[...arr].sort((a,b)=> (b[field]-a[field]))[0];
    const rawVal = best?.[field] ?? 0;
    const val = Number.isFinite(rawVal) ? (Number.isInteger(rawVal) ? String(rawVal) : rawVal.toFixed(1)) : String(rawVal);
    return `<div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap">
        <div><b>${escapeHtml(label)}</b><div class="small">${escapeHtml(best.name)} · ${escapeHtml(best.nickname)}</div></div>
        <span class="pill good">${escapeHtml(val)}</span>
      </div>
    </div>`;
  };

  return [
    by("Meiste Titel", "titles"),
    by("Meiste Medaillen", "medals"),
    by("Meiste Punkte", "points"),
    by("Meiste Teilnahmen", "participations"),
    by("Beste Ø Punkte/Spieltag", "avg"),
  ].join("");
}

function renderLeaderboard(arr){
  const rows = [...arr].sort((a,b)=> (b.points-a.points))
    .map((s,idx)=>`
      <tr class="row">
        <td>${idx+1}</td>
        <td>
          <a href="${linkPlayer(s.slug)}"><b>${escapeHtml(s.name)}</b></a>
          <div class="small">${escapeHtml(s.nickname)}</div>
        </td>
        <td><span class="pill neutral">${Math.round(s.points)} P</span></td>
        <td><span class="pill neutral">${s.avg.toFixed(1)}</span></td>
      </tr>
    `).join("");

  return renderTable(rows, ["#", "Spieler", "Punkte", "Ø P/ST"]);
}

function computeRecordData(filteredGames){
  const titleCounts = {};
  const exactCounts = {};
  const tendencyCounts = {};
  const winnerCounts = {};
  const leaderTotalCounts = {};

  const bestSeasonPoints = [];
  const bestSeasonAvg = [];
  const bestMatchdayPoints = [];
  const mostDayWinsSeason = [];
  const longestDayWinStreak = [];
  const mostLeaderSeason = [];

  for(const g of filteredGames){
    const overall = getOverallFromGame(g);

    if (overall[0]) inc(titleCounts, overall[0].player, 1);

    const streaks = {};
    const leaderSeasonCounts = {};
    const dayWinsPerPlayer = {};
    const tippedMatchesPerPlayer = {};

    for(let i = 0; i < (g.matchdays || []).length; i++){
      const md = g.matchdays[i];

      for(const t of (md.tips || [])){
        const hasPicks = t.picks && Object.keys(t.picks).length > 0;
        const hasBonus = Number(t.bonus || 0) > 0;
        if(!hasPicks && !hasBonus) continue;

        const slug = t.player;
        const pickPoints = t.pickPoints || {};

        Object.values(pickPoints).forEach(v => {
          const pts = Number(v || 0);
          if (pts === 4) inc(exactCounts, slug, 1);
          if (pts >= 3) inc(tendencyCounts, slug, 1);
          if (pts >= 2) inc(winnerCounts, slug, 1);
        });

        const mdPts = dayScore(t);
        const mdRank = mdRankFromTips(md, slug);
        bestMatchdayPoints.push({
          slug,
          value: mdPts,
          sub: `${g.season} · ${md.label} · Platz ${mdRank ?? "—"}`,
          gameId: g.id
        });

        dayWinsPerPlayer[slug] = (dayWinsPerPlayer[slug] || 0) + dayWinValue(t);
        tippedMatchesPerPlayer[slug] = (tippedMatchesPerPlayer[slug] || 0) + tippedMatchCount(t);

        if(dayWinValue(t) > 0){
          const cur = (streaks[slug]?.current || 0) + 1;
          streaks[slug] ||= { best: 0, current: 0, startLabel: md.label, bestStart: md.label, bestEnd: md.label };
          if(streaks[slug].current === 0) streaks[slug].startLabel = md.label;
          streaks[slug].current = cur;
          if(cur > streaks[slug].best){
            streaks[slug].best = cur;
            streaks[slug].bestStart = streaks[slug].startLabel;
            streaks[slug].bestEnd = md.label;
          }
        } else {
          streaks[slug] ||= { best: 0, current: 0, startLabel: md.label, bestStart: md.label, bestEnd: md.label };
          streaks[slug].current = 0;
        }
      }

      const overallUntil = computeOverallUntil(g.matchdays, i);
      overallUntil
        .filter(r => r.rank === 1)
        .forEach(r => {
          inc(leaderTotalCounts, r.player, 1);
          leaderSeasonCounts[r.player] = (leaderSeasonCounts[r.player] || 0) + 1;
        });
    }

    overall.forEach(r => {
      bestSeasonPoints.push({
        slug: r.player,
        value: Number(r.points || 0),
        sub: `${g.season} · Platz ${r.rank}`,
        gameId: g.id
      });

      const tm = Number(tippedMatchesPerPlayer[r.player] || 0);
      if(tm > 0){
        bestSeasonAvg.push({
          slug: r.player,
          value: Number(r.points || 0) / tm,
          sub: `${g.season} · ${tm} Spiele`,
          gameId: g.id
        });
      }
    });

    Object.entries(dayWinsPerPlayer).forEach(([slug, value]) => {
      mostDayWinsSeason.push({
        slug,
        value,
        sub: `${g.season}`,
        gameId: g.id
      });
    });

    Object.entries(streaks).forEach(([slug, s]) => {
      longestDayWinStreak.push({
        slug,
        value: s.best,
        sub: `${g.season} · ${s.bestStart} bis ${s.bestEnd}`,
        gameId: g.id
      });
    });

    Object.entries(leaderSeasonCounts).forEach(([slug, value]) => {
      mostLeaderSeason.push({
        slug,
        value,
        sub: `${g.season}`,
        gameId: g.id
      });
    });
  }

  return [
    {
      title: "Meiste Gesamtsiege",
      rows: topRows(Object.entries(titleCounts).map(([slug, value]) => ({ slug, value })))
    },
    {
      title: "Meiste richtige Tipps",
      rows: topRows(Object.entries(exactCounts).map(([slug, value]) => ({ slug, value })))
    },
    {
      title: "Meiste richtige Torverhältnisse",
      rows: topRows(Object.entries(tendencyCounts).map(([slug, value]) => ({ slug, value })))
    },
    {
      title: "Meiste richtige Tendenzen",
      rows: topRows(Object.entries(winnerCounts).map(([slug, value]) => ({ slug, value })))
    },
    {
      title: "Meiste Punkte in einer Saison",
      rows: topRows(bestSeasonPoints)
    },
    {
      title: "Bester Punkteschnitt in einer Saison",
      rows: topRows(bestSeasonAvg)
    },
    {
      title: "Meiste Punkte an einem Spieltag",
      rows: topRows(bestMatchdayPoints)
    },
    {
      title: "Meiste Tagessiege in einer Saison",
      rows: topRows(mostDayWinsSeason)
    },
    {
      title: "Aufeinanderfolgende Tagessiege",
      rows: topRows(longestDayWinStreak)
    },
    {
      title: "Am häufigsten Tabellenführer Gesamt",
      rows: topRows(Object.entries(leaderTotalCounts).map(([slug, value]) => ({ slug, value })))
    },
    {
      title: "Am häufigsten Tabellenführer in einer Saison",
      rows: topRows(mostLeaderSeason)
    }
  ];
}

function renderRecordFilters(selectedComp){
  const competitions = [...new Set(games.map(g => g.competition))].sort((a,b) => a.localeCompare(b));
  const options = [
    `<option value="all"${selectedComp === "all" ? " selected" : ""}>Alles</option>`,
    ...competitions.map(c => `<option value="${escapeHtml(c)}"${selectedComp === c ? " selected" : ""}>${escapeHtml(c)}</option>`)
  ].join("");

  return `
    <label class="small" for="recordCompFilter" style="display:block; margin-bottom:6px;">Wettbewerb</label>
    <select id="recordCompFilter" class="input" style="max-width:280px">
      ${options}
    </select>
  `;
}

function renderRecordSection(section){
  const rows = section.rows.map((r, idx) => `
    <tr class="row">
      <td>${idx + 1}</td>
      <td>
        ${playerCell(
          r.slug,
          r.gameId
            ? `<a href="${linkGame(r.gameId)}">${escapeHtml(r.sub || "")}</a>`
            : escapeHtml(r.sub || "")
        )}
      </td>
      <td>
        <span class="pill good">${Number(r.value).toFixed(Number(r.value) % 1 ? 2 : 0)}</span>
      </td>
    </tr>
  `).join("");

  return `
    <div class="card" style="margin:12px 0">
      <div class="bd">
        <div class="hd">
          <h3>${escapeHtml(section.title)}</h3>
        </div>
        <div class="record-table-wrap">
          ${renderTable(rows, ["#", "Spieler", "Wert"])}
        </div>
      </div>
    </div>
  `;
}

function renderRecords(selectedComp = "all"){
  const filteredGames = selectedComp === "all"
    ? games
    : games.filter(g => g.competition === selectedComp);

  const sections = computeRecordData(filteredGames);

  $("#recordFilters").innerHTML = renderRecordFilters(selectedComp);
  $("#records").innerHTML = sections.map(renderRecordSection).join("");

  const sel = $("#recordCompFilter");
  if(sel){
    sel.addEventListener("change", e => renderRecords(e.target.value));
  }
}


(async function init(){
  players = await loadJSON("data/players.json");
  playersBySlug = Object.fromEntries(players.map(p=>[p.slug,p]));
  gIndex = await loadJSON("data/games_index.json");
  games = await loadAllGamesWithMatchdays(gIndex);

  const {arr,winners} = computeAll();

  $("#kpis").innerHTML = `
    <div class="kpi"><b>${players.length}</b><span>Teilnehmer</span></div>
    <div class="kpi"><b>${games.length}</b><span>Tippspiele</span></div>
    <div class="kpi"><b>${new Set(games.map(g=>g.competition)).size}</b><span>Wettbewerbe</span></div>
    <div class="kpi"><b>${games.reduce((s,g)=>s+(g.matchdays?.length||0),0)}</b><span>Spieltage</span></div>
  `;

  $("#medals").innerHTML = renderMedalMirror(arr);
  $("#winners").innerHTML = renderWinners(winners);
  $("#tops").innerHTML = renderTops(arr);
  $("#leaderboard").innerHTML = renderLeaderboard(arr);
  renderRecords("all");
})();