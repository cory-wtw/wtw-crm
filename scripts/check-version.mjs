// Fails unless package.json's version is higher than on the base branch.
//
// Usage: node scripts/check-version.mjs origin/main
//
// The version shows in the app header, so staff can tell which build they're
// on. Bump it in package.json with every PR: patch (1.0.1) for a fix, minor
// (1.1.0) for a new feature.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "origin/main";
const current = JSON.parse(readFileSync("package.json", "utf8")).version;
const previous = JSON.parse(
  execFileSync("git", ["show", `${base}:package.json`], { encoding: "utf8" }),
).version;

const parts = (v) => v.split(".").map(Number);
const [a, b] = [parts(current), parts(previous)];
const higher = a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

if (higher <= 0) {
  console.error(
    `package.json version ${current} must be higher than ${previous} on ${base}. ` +
      "Bump the patch for a fix, the minor for a feature.",
  );
  process.exit(1);
}
console.log(`Version ${previous} → ${current}`);
