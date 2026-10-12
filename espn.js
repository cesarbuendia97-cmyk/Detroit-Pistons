// Descarga de ESPN el último partido real de cada jugador. Funciona en el navegador y en Node.
(function (root) {
  const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
  const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
  const TYPE = { 1: "Pretemporada", 2: "Temporada regular", 3: "Playoffs", 5: "Play-In" };
  const get = async (url) => { for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (r.ok) return r.json(); } catch {} } return null; };
  const num = (v) => +v || 0;
  const avg = (gs, k) => +(gs.reduce((t, g) => t + num(g.s[k]), 0) / gs.length).toFixed(1);

  async function playerGames(id, season) {
    const g = await get(`${WEB}/athletes/${id}/gamelog?season=${season}`);
    if (!g || !g.events) return [];
    const out = [];
    for (const st of g.seasonTypes || []) {
      const type = /Postseason/.test(st.displayName) ? 3 : /Preseason/.test(st.displayName) ? 1 : /Play-?In/i.test(st.displayName) ? 5 : 2;
      for (const c of st.categories || []) for (const e of c.events || []) {
        const ev = g.events[e.eventId]; if (!ev) continue;
        const s = {}; g.labels.forEach((l, i) => (s[l] = e.stats[i]));
        out.push({ eventId: e.eventId, date: ev.gameDate, type, s, ev });
      }
    }
    return out.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function teamLast(teamId, season, cache) {
    if (teamId in cache) return cache[teamId];
    return (cache[teamId] = (async () => {
      let best = null;
      const all = await Promise.all([1, 2, 3, 5].map((st) => get(`${SITE}/teams/${teamId}/schedule?season=${season}&seasontype=${st}`)));
      for (const d of all) for (const e of d?.events || []) {
        if (e.competitions?.[0]?.status?.type?.completed && (!best || new Date(e.date) > new Date(best.date))) best = { date: e.date, name: e.shortName, id: e.id };
      }
      return best;
    })());
  }

  async function player(p, season, cache, photo) {
    const [a0, g0] = await Promise.all([get(`${WEB}/athletes/${p.id}`), playerGames(p.id, season)]);
    const a = a0?.athlete || {};
    const games = g0.length ? g0 : await playerGames(p.id, season - 1);
    const last = games[0];
    const inj = (a.injuries || [])[0];
    const team = a.team ? { id: a.team.id, abbr: a.team.abbreviation, name: a.team.displayName } : null;
    const tl = team ? await teamLast(team.id, season, cache) : null;
    let lastGame = null;
    if (last) {
      const ev = last.ev, s = last.s;
      lastGame = {
        id: last.eventId, date: last.date, type: TYPE[last.type],
        atVs: ev.atVs, opp: ev.opponent?.abbreviation, oppName: ev.opponent?.displayName,
        result: ev.gameResult, score: ev.score, team: ev.team?.abbreviation,
        min: num(s.MIN), pts: num(s.PTS), reb: num(s.REB), ast: num(s.AST),
        stl: num(s.STL), blk: num(s.BLK), to: num(s.TO), pf: num(s.PF),
        fg: s.FG, fgPct: s["FG%"], tp: s["3PT"], ft: s.FT,
        url: `https://www.espn.com/nba/boxscore/_/gameId/${last.eventId}`,
      };
    }
    const same = games.filter((g) => g.type === last?.type);
    return {
      ...p, team, status: a.status?.name || null,
      injury: inj ? { status: inj.status, note: inj.shortComment || "", date: inj.date } : null,
      photo: await photo(p.id),
      lastGame,
      recent: same.slice(0, 5).map((g) => ({ pts: num(g.s.PTS), min: num(g.s.MIN), date: g.date, opp: g.ev.opponent?.abbreviation })),
      avg: same.length ? { gp: same.length, pts: avg(same, "PTS"), reb: avg(same, "REB"), ast: avg(same, "AST"), min: avg(same, "MIN") } : null,
      teamLast: tl,
      missedLast: !!(tl && last && tl.id !== last.eventId && new Date(tl.date) > new Date(last.date)),
      espn: `https://www.espn.com/nba/player/_/id/${p.id}`,
    };
  }

  // roster: [{name,id,pos,age,ovr,tags}]; photo(id) -> url o data URI
  async function buildData(roster, photo) {
    const now = new Date();
    const season = now.getUTCMonth() >= 8 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    const cache = {};
    const players = await Promise.all(roster.map((p) => player(p, season, cache, photo)));
    if (!players.some((p) => p.lastGame)) throw new Error("ESPN no devolvió partidos");
    return { updated: now.toISOString(), season, players };
  }

  const photoUrl = (id) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=144&h=105`;
  root.ESPN = { buildData, photoUrl };
  if (typeof module !== "undefined") module.exports = root.ESPN;
})(typeof window !== "undefined" ? window : globalThis);
