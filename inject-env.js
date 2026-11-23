const fs = require("fs");

const branch = process.env.WORKERS_CI_BRANCH || "";
const isPreviewBranch = Boolean(branch && branch !== "main");

// En Preview (toute branche autre que main), on utilise PREVIEW_DATABASE_URL
// pour ne jamais toucher à la base de données de Production.
const dbUrl = isPreviewBranch
  ? (process.env.PREVIEW_DATABASE_URL || "")
  : (process.env.DATABASE_URL || "");

fs.writeFileSync(
  "build-env.js",
  `export const BUILD_DATABASE_URL = ${JSON.stringify(dbUrl)};\n`,
  "utf8"
);

console.log(
  `build-env.js generated (branch=${branch || "local"}, mode=${isPreviewBranch ? "PREVIEW" : "PROD"}, db_present=${Boolean(dbUrl)})`
);
