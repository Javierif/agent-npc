// Run with: npm run test:ui  (Node strips the TypeScript types itself)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DICT, getLang, resolveLang, setLang, t } from "../src/i18n.ts";

const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test("every entry is translated into all four languages with the same placeholders", () => {
  for (const [es, entry] of Object.entries(DICT)) {
    for (const lang of ["en", "pt", "fr", "de"]) {
      assert.ok(entry[lang]?.trim(), `${lang} missing for "${es}"`);
      assert.deepEqual(placeholders(entry[lang]), placeholders(es), `${lang} placeholders differ for "${es}"`);
    }
  }
});

test("t() translates, interpolates and falls back to Spanish", () => {
  setLang("en");
  assert.equal(t("Ajustes"), "Settings");
  assert.equal(t("…y {n} más", { n: 3 }), "…and 3 more");
  assert.equal(t("texto sin traducir"), "texto sin traducir");
  setLang("de");
  assert.equal(t("Cerrar"), "Schließen");
  setLang("es");
  assert.equal(t("…y {n} más", { n: 2 }), "…y 2 más");
  assert.equal(getLang(), "es");
});

test("the language preference resolves against the system languages", () => {
  assert.equal(resolveLang("fr", ["en-US"]), "fr");
  assert.equal(resolveLang("auto", ["pt-BR", "en"]), "pt");
  assert.equal(resolveLang("auto", ["ja-JP", "de-DE"]), "de");
  assert.equal(resolveLang("auto", ["ja-JP"]), "en");
  assert.equal(resolveLang("auto", []), "en");
});

test("every t(...) literal used by the interface is in the dictionary", () => {
  const sources = ["../src/ui.ts", "../src/main.ts"].map((p) => readFileSync(new URL(p, import.meta.url), "utf8")).join("\n");
  const used = [...sources.matchAll(/\bt\(\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
  assert.ok(used.length > 60, `expected many t() calls, found ${used.length}`);
  const missing = used.filter((s) => !(s in DICT));
  assert.deepEqual(missing, [], "strings used with t() but missing from the dictionary");
});
