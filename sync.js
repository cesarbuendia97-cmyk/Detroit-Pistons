// Uso: node sync.js            -> descarga de ESPN y regenera data.json (para GitHub) y artifact.html (para la página de Claude)
//      node sync.js --offline  -> solo regenera artifact.html a partir de data.json y las fotos guardadas en headshots/
const fs = require("fs"), path = require("path");
const { buildData, buildRookies, photoUrl } = require("./espn.js");
const DIR = __dirname, f = (n) => path.join(DIR, n);
const OFFLINE = process.argv.includes("--offline");

async function photoData(id) {
  const cache = f(`headshots/${id}.png`);
  if (!fs.existsSync(cache)) {
    if (OFFLINE) return null;
    try {
      const r = await fetch(photoUrl(id)); if (!r.ok) return null;
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, Buffer.from(await r.arrayBuffer()));
    } catch { return null; }
  }
  return "data:image/png;base64," + fs.readFileSync(cache).toString("base64");
}

(async () => {
  let data;
  if (OFFLINE) {
    data = JSON.parse(fs.readFileSync(f("data.json"), "utf8"));
  } else {
    const roster = JSON.parse(fs.readFileSync(f("roster.json"), "utf8"));
    const prev = fs.existsSync(f("data.json")) ? JSON.parse(fs.readFileSync(f("data.json"), "utf8")) : {};
    // data.json: fotos como URL de ESPN (GitHub Pages las carga sin problema)
    data = await buildData(roster, async (id) => photoUrl(id));
    try {
      data.rookies = await buildRookies(async (id) => photoUrl(id));
      const r = data.rookies.players;
      console.log("OK rookies", r.length, "·", r.filter((p) => p.rs).length, "con partidos de temporada regular");
      console.log("Ejemplo:", JSON.stringify(r.find((p) => p.rs) || r[0]));
    } catch (e) {
      console.error("AVISO rookies:", e.message, "(se mantienen los anteriores)");
      if (prev.rookies) data.rookies = prev.rookies;
    }
    fs.writeFileSync(f("data.json"), JSON.stringify(data));
    console.log("OK data.json", data.players.length, "jugadores");
  }
  // artifact.html: todo incrustado (Claude bloquea conexiones externas)
  for (const p of [...data.players, ...(data.rookies?.players || [])]) p.photo = await photoData(p.id);
  const tpl = fs.readFileSync(f("index.html"), "utf8")
    .replace(/<script src="espn\.js"><\/script>\n?/, "")
    .replace(/<script id="data" type="application\/json">[\s\S]*?<\/script>/, () =>
      `<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`);
  fs.writeFileSync(f("artifact.html"), tpl);
  console.log("OK artifact.html");
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
