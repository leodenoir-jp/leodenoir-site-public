const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "..");
const ts = require(path.join(root, "node_modules/typescript"));
function loadTs(file) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {};
  new Function("exports", compiled.outputText)(exports);
  return exports;
}
const { importedLessonReviews: reviews } = loadTs("src/data/lessonReviews.ts");
const { lessonReviewTranslations: translations } = loadTs("src/data/lessonReviewTranslations.ts");
assert.equal(reviews.length, 81);
assert.equal(new Set(reviews.map(r => r.id)).size, 81);
assert.equal(new Set(reviews.map(r => r.comment.trim() + r.postedAt)).size, 81);
const englishOnly = new Set([17, 18, 19, 56, 63]);
const japaneseOnly = new Set([1, 16, 59, 60, 70, 71, 72, 73, 74, 75, 76, 77, 79]);
for (const [i, review] of reviews.entries()) {
  const number = i + 1;
  assert.equal(review.id, `LR-${String(number).padStart(3, "0")}`);
  assert.equal(review.status, "approved");
  assert.equal(review.rating, 5);
  const translated = translations[review.id];
  if (englishOnly.has(number)) {
    assert.equal(translated, undefined);
  } else {
    assert.ok(translated?.en?.trim(), `Missing English: ${review.id}`);
    if (!japaneseOnly.has(number)) assert.ok(translated?.ja?.trim(), `Missing Japanese: ${review.id}`);
  }
}
for (const id of Object.keys(translations)) assert.ok(reviews.some(r => r.id === id), `Orphan translation: ${id}`);
console.log(JSON.stringify({
  reviews: reviews.length,
  englishTranslations: Object.keys(translations).length,
  japaneseTranslations: Object.values(translations).filter(t => t.ja).length,
  duplicateReviews: 0
}, null, 2));
