const fs = require("fs");
const dbUrl = process.env.DATABASE_URL || "";
fs.writeFileSync(
  "build-env.js",
  `export const BUILD_DATABASE_URL = ${JSON.stringify(dbUrl)};\n`,
  "utf8"
);
console.log("build-env.js generated (DATABASE_URL present:", Boolean(dbUrl), ")");
