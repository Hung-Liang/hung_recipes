const test = require("node:test");
const assert = require("node:assert/strict");
const calc = require("../js/nutrition.js");

test.beforeEach(() => {
    calc.setDatabase({ "雞胸肉": 117, "鹽": 0, "未知食材": null });
});

test("findCaloriePer100 matches exact names after trimming", () => {
    assert.deepEqual(calc.findCaloriePer100("雞胸肉"), { matchedKey: "雞胸肉", kcalPer100: 117 });
    assert.deepEqual(calc.findCaloriePer100("  雞胸肉 "), { matchedKey: "雞胸肉", kcalPer100: 117 });
});

test("findCaloriePer100 keeps zero-kcal ingredients as known", () => {
    assert.deepEqual(calc.findCaloriePer100("鹽"), { matchedKey: "鹽", kcalPer100: 0 });
});

test("findCaloriePer100 returns null for missing, null-valued or empty names", () => {
    assert.equal(calc.findCaloriePer100("雞腿"), null);
    assert.equal(calc.findCaloriePer100("未知食材"), null);
    assert.equal(calc.findCaloriePer100(""), null);
    assert.equal(calc.findCaloriePer100(undefined), null);
});

test("findCaloriePer100 ignores inherited object keys", () => {
    assert.equal(calc.findCaloriePer100("toString"), null);
    assert.equal(calc.findCaloriePer100("constructor"), null);
});

test("getCalorieRatio accepts values within 0–1", () => {
    assert.equal(calc.getCalorieRatio({ calorieRatio: 0 }), 0);
    assert.equal(calc.getCalorieRatio({ calorieRatio: 0.1 }), 0.1);
    assert.equal(calc.getCalorieRatio({ calorieRatio: 1 }), 1);
});

test("getCalorieRatio falls back to 1 for missing or invalid values", () => {
    assert.equal(calc.getCalorieRatio({}), 1);
    assert.equal(calc.getCalorieRatio(null), 1);
    assert.equal(calc.getCalorieRatio({ calorieRatio: -0.1 }), 1);
    assert.equal(calc.getCalorieRatio({ calorieRatio: 1.5 }), 1);
    assert.equal(calc.getCalorieRatio({ calorieRatio: "abc" }), 1);
});
