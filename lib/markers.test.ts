import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarkedText, remapUncertain, resolveUncertain, toMarkedText } from "./markers";

test("parses uncertain and illegible markers", () => {
  const r = parseMarkedText("我今天很⟦高|髙⟧興，[?]去公園。\n第二行［？］");
  assert.equal(r.text, "我今天很高興，[?]去公園。\n第二行[?]");
  assert.deepEqual(r.uncertain, [{ index: 4, char: "高", alternatives: ["髙"] }]);
  assert.equal(r.illegible_count, 2);
});

test("handles astral characters and malformed markers", () => {
  const r = parseMarkedText("𠮷⟦字|宇|字⟧⟦壞");
  assert.equal(r.text, "𠮷字壞");
  assert.deepEqual(r.uncertain, [{ index: 1, char: "字", alternatives: ["宇"] }]);
});

test("round-trips through toMarkedText", () => {
  const marked = "春⟦眠|眼⟧不覺曉";
  const r = parseMarkedText(marked);
  assert.equal(toMarkedText(r.text, r.uncertain), marked);
});

test("remaps indices after an edit before the uncertain char", () => {
  const r = parseMarkedText("ABC⟦D|E⟧F");
  const next = remapUncertain(r.text, "XXABCDF", r.uncertain);
  assert.deepEqual(next, [{ index: 5, char: "D", alternatives: ["E"] }]);
});

test("drops uncertain chars that were edited", () => {
  const r = parseMarkedText("ABC⟦D|E⟧F");
  assert.deepEqual(remapUncertain(r.text, "ABCEF", r.uncertain), []);
});

test("resolves an uncertain char with a multi-char replacement", () => {
  const r = parseMarkedText("⟦a|bb⟧c⟦d|e⟧");
  const res = resolveUncertain(r.text, r.uncertain, 0, "bb");
  assert.equal(res.text, "bbcd");
  assert.deepEqual(res.uncertain, [{ index: 3, char: "d", alternatives: ["e"] }]);
});
