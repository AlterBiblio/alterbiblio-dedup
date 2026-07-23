import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("la CSP autoriza exactamente el módulo inline actual y bloquea scripts inline arbitrarios", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const html = readFileSync(join(root, "docs", "index.html"), "utf8");
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(script);
  assert.ok(policy);
  const hash = "sha256-" + createHash("sha256").update(script[1]).digest("base64");
  assert.ok(policy[1].includes(`'${hash}'`), `falta '${hash}' en la CSP`);
  assert.equal(/script-src[^;]*'unsafe-inline'/.test(policy[1]), false);
  assert.match(policy[1], /object-src 'none'/);
});
