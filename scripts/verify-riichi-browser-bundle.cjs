const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const tmpDir = path.join(root, ".tmp");
const outfile = path.join(tmpDir, "riichi-browser-bundle.js");

fs.mkdirSync(tmpDir, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(root, "scripts", "riichi-browser-entry.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2018",
  define: {
    "process.env.NODE_DEBUG": "undefined",
    "process.env.NODE_ENV": '"production"'
  },
  outfile,
  logLevel: "silent"
});

const code = fs.readFileSync(outfile, "utf8");

vm.runInNewContext(code, {
  console
});

console.log(`riichi browser bundle size: ${Buffer.byteLength(code)} bytes`);
