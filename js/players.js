let players=[];

function renderPlayers(filter=""){
  const f = filter.trim().toLowerCase();
  const items = players
    .filter(p => !f || `${p.name} ${p.nickname}`.toLowerCase().includes(f))
    .sort((a,b)=> a.name.localeCompare(b.name));

  const html = items.map(p=>`
    <div class="card" style="margin:10px 0">
      <div class="bd" style="display:flex; justify-content:space-between; gap:12px; align-items:center; flex-wrap:wrap">
        <div class="person">
          <img class="avatar" src="${escapeHtml(p.photo)}" alt="">
          <div>
            <a href="${linkPlayer(p.slug)}"><b>${escapeHtml(p.name)}</b></a>
            <div class="small">${escapeHtml(p.nickname)} · ${getFlag(p.home)} ${escapeHtml(p.home)}</div>
          </div>
        </div>
        <a class="pill good" href="${linkPlayer(p.slug)}">Profil</a>
      </div>
    </div>
  `).join("");

  $("#playersList").innerHTML = html || `<div class="small">Keine Teilnehmer gefunden.</div>`;
  applyImageFallbacks($("#playersList"));
}

(async function init(){
  players = await loadJSON("data/players.json");
  renderPlayers("");
  $("#playerFilter").addEventListener("input", e=> renderPlayers(e.target.value));
})();