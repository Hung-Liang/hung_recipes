const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const calc = require("../js/nutrition.js");

const readAsset = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "asset", name), "utf8"));

const recipesByPath = readAsset("recipes.json");
const { recipes: summaries } = readAsset("info.json");
calc.setDatabase(readAsset("nutrition.json"));

// Mirrors kcalRows + summarize in js/app.js; null when no ingredient has data
function kcalPerServing(recipe) {
    let total = 0;
    let known = 0;
    for (const ing of recipe.ingredients) {
        const match = calc.findCaloriePer100(ing.name);
        if (!match) continue;
        const qty = parseFloat(ing.quantity) || 0;
        total += Math.round((qty * match.kcalPer100 * calc.getCalorieRatio(ing)) / 100);
        known++;
    }
    if (!known) return null;
    const servings = recipe.servings.quantity;
    return Math.round(total / (servings > 0 ? servings : 1));
}

test("info.json lists recipes", () => {
    assert.ok(summaries.length > 0);
});

for (const summary of summaries) {
    test(`precomputed kcal matches the JS calculation: ${summary.path}`, () => {
        const recipe = recipesByPath[summary.path];
        assert.ok(recipe, `${summary.path}: missing from recipes.json`);
        assert.equal(summary.kcal, kcalPerServing(recipe), `${summary.path}: kcal mismatch`);
    });
}
