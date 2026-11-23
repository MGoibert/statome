const fs = require("fs");

const branch = process.env.WORKERS_CI_BRANCH || "";
const isPreviewBranch = Boolean(branch && branch !== "main");

// En Preview (toute branche autre que main), on utilise PREVIEW_DATABASE_URL
// (ou DATABASE_URL de l'onglet Previews Base) pour ne jamais toucher à la Prod.
const dbUrl = isPreviewBranch
  ? (process.env.PREVIEW_DATABASE_URL || process.env.DATABASE_URL || "")
  : (process.env.DATABASE_URL || "");

fs.writeFileSync(
  "build-env.js",
  `export const BUILD_DATABASE_URL = ${JSON.stringify(dbUrl)};\n`,
  "utf8"
);

// Injecte aussi dans wrangler.toml (sans doublon si appelé 2x) et inclut [previews.vars] pour `wrangler preview`.
if (dbUrl && fs.existsSync("wrangler.toml")) {
  const currentToml = fs.readFileSync("wrangler.toml", "utf8");
  if (!currentToml.includes("[vars]")) {
    let extra = `\n[vars]\nDATABASE_URL = ${JSON.stringify(dbUrl)}\n`;
    if (isPreviewBranch && !currentToml.includes("[previews.vars]")) {
      extra += `\n[previews.vars]\nDATABASE_URL = ${JSON.stringify(dbUrl)}\n`;
    }
    fs.appendFileSync("wrangler.toml", extra, "utf8");
  }
}

console.log(
  `build-env.js generated (branch=${branch || "local"}, mode=${isPreviewBranch ? "PREVIEW" : "PROD"}, db_present=${Boolean(dbUrl)})`
);
