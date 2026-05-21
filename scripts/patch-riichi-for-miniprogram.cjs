const fs = require("node:fs");
const path = require("node:path");

const yakuPath = path.resolve(__dirname, "../node_modules/riichi/yaku.js");
const requireAssertLine = "const assert = require('assert')";
const assertShim = `const assert = {
    deepStrictEqual(actual, expected) {
        if (JSON.stringify(actual) !== JSON.stringify(expected))
            throw new Error('deepStrictEqual failed')
    }
}`;

if (!fs.existsSync(yakuPath)) {
  console.warn("riichi yaku.js not found, skip mini program patch");
  process.exit(0);
}

const source = fs.readFileSync(yakuPath, "utf8");

if (source.includes(assertShim)) {
  console.log("riichi mini program patch already applied");
  process.exit(0);
}

if (!source.includes(requireAssertLine)) {
  console.warn("riichi assert require line not found, skip mini program patch");
  process.exit(0);
}

fs.writeFileSync(yakuPath, source.replace(requireAssertLine, assertShim));
console.log("riichi mini program patch applied");
