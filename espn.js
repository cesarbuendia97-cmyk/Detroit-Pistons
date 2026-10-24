// Descarga de ESPN el último partido real de cada jugador. Funciona en el navegador y en Node.
(function (root) {
  const WEB = "https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba";
  const SITE = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
  const CORE = "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba";
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

  const seasonOf = (d) => (d.getUTCMonth() >= 8 ? d.getUTCFullYear() + 1 : d.getUTCFullYear());

  // roster: [{name,id,pos,age,ovr,tags}]; photo(id) -> url o data URI
  async function buildData(roster, photo) {
    const now = new Date();
    const season = seasonOf(now);
    const cache = {};
    const players = await Promise.all(roster.map((p) => player(p, season, cache, photo)));
    if (!players.some((p) => p.lastGame)) throw new Error("ESPN no devolvió partidos");
    return { updated: now.toISOString(), season, players };
  }

  // Ejecuta fn sobre items de n en n, para no lanzar cientos de peticiones a la vez
  async function pool(items, n, fn) {
    const out = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
    return out;
  }

  const split = (s) => String(s || "").split("-").map(Number);
  const pct = (m, a) => (a ? +((m / a) * 100).toFixed(1) : null);

  // Promedios de una lista de partidos; los porcentajes salen de los totales de tiros
  function averages(gs) {
    if (!gs.length) return null;
    const sum = (f) => gs.reduce((t, g) => t + f(g), 0);
    const shots = (k) => { const m = sum((g) => split(g.s[k])[0] || 0), a = sum((g) => split(g.s[k])[1] || 0); return { m, a }; };
    const fg = shots("FG"), tp = shots("3PT"), ft = shots("FT");
    return {
      gp: gs.length, min: avg(gs, "MIN"), pts: avg(gs, "PTS"), reb: avg(gs, "REB"), ast: avg(gs, "AST"),
      stl: avg(gs, "STL"), blk: avg(gs, "BLK"), to: avg(gs, "TO"),
      tpm: +(tp.m / gs.length).toFixed(1), fgPct: pct(fg.m, fg.a), tpPct: pct(tp.m, tp.a), ftPct: pct(ft.m, ft.a),
    };
  }

  // Novatos de la temporada: jugadores sin experiencia previa en las plantillas de los 30 equipos
  async function buildRookies(photo) {
    const now = new Date();
    const season = seasonOf(now);
    const t0 = await get(`${SITE}/teams`);
    let teams = (t0?.sports?.[0]?.leagues?.[0]?.teams || []).map((x) => x.team);
    if (!teams.length) teams = Array.from({ length: 30 }, (_, i) => ({ id: String(i + 1) }));
    const all = (await pool(teams, 6, async (t) => {
      const d = await get(`${SITE}/teams/${t.id}/roster`);
      const team = { id: String(t.id), abbr: d?.team?.abbreviation || t.abbreviation, name: d?.team?.displayName || t.displayName };
      return (d?.athletes || []).flatMap((a) => a.items || [a]).map((a) => ({ a, team }));
    })).flat();
    if (!all.length) throw new Error("ESPN no devolvió plantillas");

    // Normalmente la plantilla trae los años de experiencia; si no, se decide por el año del draft
    const hasExp = all.some(({ a }) => a.experience && "years" in a.experience);
    const candidates = hasExp ? all.filter(({ a }) => a.experience.years === 0) : all;
    const players = (await pool(candidates, 8, async ({ a, team }) => {
      const info = (await get(`${WEB}/athletes/${a.id}`))?.athlete || {};
      // El draft no siempre viene en la ficha; la API "core" de ESPN sí lo trae
      const dr = info.draft || a.draft || (await get(`${CORE}/athletes/${a.id}`))?.draft;
      if (!hasExp && !(dr?.year === season - 1 || /rookie/i.test(info.displayExperience || ""))) return null;
      const games = await playerGames(a.id, season);
      return {
        id: String(a.id), name: a.displayName || a.fullName, pos: a.position?.abbreviation || info.position?.abbreviation || "",
        age: a.age ?? info.age ?? null, team,
        draft: dr ? { year: dr.year, round: dr.round, pick: dr.selection, text: dr.displayText || "" } : null,
        photo: await photo(a.id),
        rs: averages(games.filter((g) => g.type === 2)),
        pre: averages(games.filter((g) => g.type === 1)),
        espn: `https://www.espn.com/nba/player/_/id/${a.id}`,
      };
    })).filter(Boolean);
    if (!players.length) throw new Error("ESPN no devolvió novatos");
    return { updated: now.toISOString(), season, players };
  }

  const photoUrl = (id) => `https://a.espncdn.com/combiner/i?img=/i/headshots/nba/players/full/${id}.png&w=144&h=105`;
  root.ESPN = { buildData, buildRookies, photoUrl };
  if (typeof module !== "undefined") module.exports = root.ESPN;
})(typeof window !== "undefined" ? window : globalThis);
