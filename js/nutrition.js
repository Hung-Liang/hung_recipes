/**
 * nutrition.js - 食材標準化與熱量計算模組
 * 採 100% 精確對齊 (Exact Match)，基準為每 100g / 100ml 之確定卡路里 (kcal)。
 * 資料來源為 asset/nutrition.json：數值為 kcal，null 代表「尚未建立熱量資料」。
 */
(function (global) {
    // 標準食材卡路里資料庫 (kcal / 100g 或 100ml)，由 load() 載入
    let FOOD_CALORIE_DB = {};
    let loadPromise = null;

    /**
     * 載入 asset/nutrition.json（重複呼叫會共用同一個 Promise）
     * @returns {Promise<void>}
     */
    function load(url = 'asset/nutrition.json') {
        if (!loadPromise) {
            loadPromise = fetch(url)
                .then(response => {
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                    return response.json();
                })
                .then(db => { FOOD_CALORIE_DB = db; })
                .catch(error => {
                    console.error('Failed to load nutrition data:', error);
                    loadPromise = null; // allow retry later
                });
        }
        return loadPromise;
    }

    /**
     * 直接設定資料庫（測試或非瀏覽器環境使用）
     * @param {Object<string, number|null>} db
     */
    function setDatabase(db) {
        FOOD_CALORIE_DB = db || {};
    }

    /**
     * 查詢食材每 100g/ml 卡路里（精確對齊）
     * @param {string} name
     * @returns {{ matchedKey: string, kcalPer100: number }} | null  無資料或數值為 null 時回傳 null
     */
    function findCaloriePer100(name) {
        if (!name) return null;
        const trimmed = name.trim();
        if (!Object.prototype.hasOwnProperty.call(FOOD_CALORIE_DB, trimmed)) return null;
        const kcalPer100 = FOOD_CALORIE_DB[trimmed];
        if (typeof kcalPer100 !== 'number') return null;
        return { matchedKey: trimmed, kcalPer100: kcalPer100 };
    }

    /**
     * 取得食材的熱量計入比例（0–1），未設定或無效時為 1
     * @param {{ calorieRatio?: number }} ing
     * @returns {number}
     */
    function getCalorieRatio(ing) {
        const ratio = ing ? parseFloat(ing.calorieRatio) : NaN;
        return (ratio >= 0 && ratio <= 1) ? ratio : 1;
    }

    const api = {
        get FOOD_CALORIE_DB() { return FOOD_CALORIE_DB; },
        load: load,
        setDatabase: setDatabase,
        findCaloriePer100: findCaloriePer100,
        getCalorieRatio: getCalorieRatio
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof window !== 'undefined') {
        window.NutritionCalculator = api;
    }
    if (typeof global !== 'undefined') {
        global.NutritionCalculator = api;
    }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
