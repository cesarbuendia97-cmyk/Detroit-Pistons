// Uso: node sync.js  -> regenera data.json (para GitHub) y artifact.html (para la página de Claude)
const fs = require("fs"), path = require("path");
const { buildData, photoUrl } = require("./espn.js");
const DIR = __dirname, f = (n) => path.join(DIR, n);

async function photoData(id) {
  const cache = f(`headshots/${id}.png`);
  if (!fs.existsSync(cache)) {
    try {
      const r = await fetch(photoUrl(id)); if (!r.ok) return null;
      fs.mkdirSync(path.dirname(cache), { recursive: true });
      fs.writeFileSync(cache, Buffer.from(await r.arrayBuffer()));
    } catch { return null; }
  }
  return "data:image/png;base64," + fs.readFileSync(cache).toString("base64");
}

(async () => {
  const roster = JSON.parse(fs.readFileSync(f("roster.json"), "utf8"));
  // data.json: fotos como URL de ESPN (GitHub Pages las carga sin problema)
  const data = await buildData(roster, async (id) => photoUrl(id));
  fs.writeFileSync(f("data.json"), JSON.stringify(data));
  console.log("OK data.json", data.players.length, "jugadores");
  // artifact.html: todo incrustado (Claude bloquea conexiones externas)
  for (const p of data.players) p.photo = await photoData(p.id);
  const tpl = fs.readFileSync(f("index.html"), "utf8")
    .replace(/<script src="espn\.js"><\/script>\n?/, "")
    .replace(/<script id="data" type="application\/json">[\s\S]*?<\/script>/, () =>
      `<script id="data" type="application/json">${JSON.stringify(data).replace(/</g, "\u003c")}</script>`);
  fs.writeFileSync(f("artifact.html"), tpl);
  console.log("OK artifact.html");
})().catch((e) => { console.error("ERROR", e.message); process.exit(1); });
