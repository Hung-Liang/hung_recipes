// Use a self-contained closure to avoid polluting the global namespace.
(function () {
    // Current application version (Sync with sw.js CACHE_NAME)
    const APP_VERSION = "v1.10.0";

    // 1. Update Version Display IMMEDIATELY (Script is at bottom of body, so element should exist)
    try {
        const versionEl = document.getElementById("app-version");
        if (versionEl) versionEl.textContent = `Version: ${APP_VERSION}`;
    } catch (e) {
        console.error("Failed to set version:", e);
    }

    const $ = (id) => document.getElementById(id);

    // --- DOM References ---
    const listView = $("list-view");
    const detailView = $("detail-view");
    const listTitle = $("list-title");
    const listSub = $("list-sub");
    const recipeList = $("recipe-list");
    const kcalHeader = $("kcal-header");
    const sortKcalButton = $("sort-kcal");
    const searchInput = $("search-input");
    const tagsContainer = $("tags-container");
    const tagsPanel = $("tags-panel");
    const toggleTagsButton = $("toggle-tags");
    const tagCountBadge = $("tag-count-badge");
    const clearTagsButton = $("clear-tags");
    const categoryNav = $("category-nav");
    const sidebar = $("sidebar");
    const menuButton = $("menu-button");
    const menuClose = $("menu-close");
    const topbarTitle = $("topbar-title");
    const topbarBack = $("topbar-back");
    const topbarShare = $("topbar-share");

    const recipeDetailName = $("recipe-detail-name");
    const recipeDetailDescription = $("recipe-detail-description");
    const recipeDetailTags = $("recipe-detail-tags");
    const detailCategory = $("detail-category");
    const recipeDetailIngredients = $("recipe-detail-ingredients");
    const recipeDetailSteps = $("recipe-detail-steps");
    const stepsMeta = $("steps-meta");
    const recipeDetailNotes = $("recipe-detail-notes");
    const recipeDetailNotesContainer = $("recipe-detail-notes-container");
    const servingsInput = $("servings-input");
    const servingsUnit = $("servings-unit");
    const servingsMinus = $("servings-minus");
    const servingsPlus = $("servings-plus");
    const caloriesPerServingEl = $("calories-per-serving");
    const caloriesTotalEl = $("calories-total");
    const caloriesCoverageEl = $("calories-coverage");
    const caloriesMissingEl = $("calories-missing");
    const ingredientsTotalEl = $("ingredients-total");
    const unlockAllButton = $("release-locks");
    const shareButton = $("share-button");
    const toast = $("toast");

    // Category mapping (folder name -> label), in nav order
    const CATEGORY_MAP = {
        'poultry': '家禽/雞肉',
        'meat': '肉類料理',
        'seafood': '海鮮料理',
        'staples': '主食/麵飯',
        'vegetables': '蔬食/蛋品',
        'snacks_desserts': '點心/早餐',
        'sauces_basics': '醬料/基礎',
        'others': '其他料理',
        'unsort': '待分類'
    };

    // Tag groups for the filter panel; tags not listed here fall into 其他
    const TAG_GROUPS = [
        ["菜系", ["中式", "日式", "西式", "韓式", "港式"]],
        ["食材", ["豬肉", "雞肉", "牛肉", "海鮮", "豆腐", "蔬食"]],
        ["類型", ["主食", "澱粉", "點心", "甜點", "醬汁", "飲品", "紅燒", "煙燻"]],
        ["工具", ["氣炸鍋", "電鍋", "烤箱"]],
        ["飲食", ["高蛋白", "低碳", "懶人料理"]]
    ];

    // State
    let currentRecipe = null;
    let recipes = [];
    let recipeCache = new Map();
    let allTags = new Set();
    let selectedTags = new Set();
    let searchTerm = "";
    let currentCategory = "";      // "" = all recipes
    let kcalSort = "none";         // none | ascending | descending
    let summariesState = "loading"; // loading | ready | error
    const kcalByPath = new Map();
    const doneSteps = new Map();   // path -> Set of step indexes marked done

    // Escape text before interpolating it into innerHTML templates
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    const fmt = (n) => Number(n).toLocaleString("zh-TW");
    const categoryOf = (path) => path.split('/')[0];
    const categoryLabel = (cat) => CATEGORY_MAP[cat] || cat;

    function showToast(message) {
        if (!toast) return;
        toast.textContent = message;
        toast.hidden = false;
        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => { toast.hidden = true; }, 2000);
    }

    // --- Data loading ---
    async function fetchRecipeSummaries() {
        const CACHE_KEY = "recipe_summaries_cache";
        let cachedData = null;
        try { cachedData = localStorage.getItem(CACHE_KEY); } catch (e) { /* storage blocked */ }
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                if (parsed.recipes && parsed.recipes.length > 0) {
                    applySummaries(parsed);
                }
            } catch (e) {
                try { localStorage.removeItem(CACHE_KEY); } catch (err) { /* ignore */ }
            }
        }

        try {
            const response = await fetch("asset/info.json", { cache: "no-cache" });
            if (!response.ok) throw new Error(`Fetch failed`);
            const data = await response.json();
            applySummaries(data);
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
        } catch (error) {
            console.error(error);
            if (summariesState !== "ready") summariesState = "error";
        }
    }

    function applySummaries(data) {
        recipes = data.recipes || [];
        allTags.clear();
        if (data.allTags) data.allTags.forEach(tag => allTags.add(tag));
        summariesState = "ready";
        renderNav();
    }

    async function loadRecipeDetails(path) {
        if (recipeCache.has(path)) return recipeCache.get(path);
        try {
            const response = await fetch(`recipes/${path}`);
            if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
            const recipe = await response.json();
            recipe.path = path;
            recipeCache.set(path, recipe);
            return recipe;
        } catch (error) {
            // Offline and this recipe was never opened: fall back to the full bundle
            await loadAllRecipes();
            return recipeCache.get(path) || null;
        }
    }

    // Load every recipe from asset/recipes.json so all recipes are available offline
    let allRecipesPromise = null;
    function loadAllRecipes() {
        if (!allRecipesPromise) {
            allRecipesPromise = (async () => {
                try {
                    const response = await fetch("asset/recipes.json");
                    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
                    const all = await response.json();
                    Object.entries(all).forEach(([path, recipe]) => {
                        if (recipeCache.has(path)) return;
                        recipe.path = path;
                        recipeCache.set(path, recipe);
                    });
                } catch (error) {
                    console.warn("Failed to load recipe bundle:", error);
                    allRecipesPromise = null; // allow retry later
                }
            })();
        }
        return allRecipesPromise;
    }

    // --- Calories ---
    // One row per ingredient: kcal rounded as displayed, so totals are sums of what is on screen
    function kcalRows(ingredients) {
        const calc = window.NutritionCalculator;
        return ingredients.map(ing => {
            const qty = parseFloat(ing.quantity) || 0;
            const match = calc ? calc.findCaloriePer100(ing.name) : null;
            const ratio = calc ? calc.getCalorieRatio(ing) : 1;
            if (!match) return { known: false, kcal: 0, ratio };
            return { known: true, kcal: Math.round((qty * match.kcalPer100 * ratio) / 100), ratio };
        });
    }

    function summarize(rows, servings) {
        const total = rows.reduce((sum, r) => sum + r.kcal, 0);
        const known = rows.filter(r => r.known).length;
        const safeServings = servings > 0 ? servings : 1;
        return { total, perServing: Math.round(total / safeServings), known, count: rows.length };
    }

    function recipeKcal(path) {
        if (kcalByPath.has(path)) return kcalByPath.get(path);
        const recipe = recipeCache.get(path);
        if (!recipe || !window.NutritionCalculator) return null;
        const servings = recipe.servings ? parseFloat(recipe.servings.quantity) || 1 : 1;
        const info = summarize(kcalRows(recipe.ingredients || []), servings);
        kcalByPath.set(path, info);
        return info;
    }

    function kcalCell(path) {
        if (!recipeCache.has(path)) {
            return `<span class="skeleton" style="width: 4em"></span>`;
        }
        const info = recipeKcal(path);
        if (!info || info.known === 0) return `<span class="dash">–</span>`;
        return `${fmt(info.perServing)}<small>kcal</small>`;
    }

    // --- Navigation ---
    function renderNav() {
        if (!categoryNav) return;
        const present = new Set(recipes.map(r => categoryOf(r.path)));
        const cats = [
            ...Object.keys(CATEGORY_MAP).filter(cat => present.has(cat)),
            ...[...present].filter(cat => !CATEGORY_MAP[cat])
        ];
        categoryNav.innerHTML = `<a class="nav-item" href="#/" data-cat="">全部食譜</a>` +
            cats.map(cat => `<a class="nav-item" href="#/c/${encodeURIComponent(cat)}" data-cat="${escapeHtml(cat)}">${escapeHtml(categoryLabel(cat))}</a>`).join("");
        updateNavCurrent();
    }

    function updateNavCurrent() {
        if (!categoryNav) return;
        const active = detailView && !detailView.hidden && currentRecipe ? categoryOf(currentRecipe.path) : currentCategory;
        categoryNav.querySelectorAll(".nav-item").forEach(a => {
            if (a.dataset.cat === active) a.setAttribute("aria-current", "page");
            else a.removeAttribute("aria-current");
        });
    }

    function setMenuOpen(open) {
        if (!sidebar) return;
        sidebar.classList.toggle("open", open);
        if (menuButton) menuButton.setAttribute("aria-expanded", String(open));
        if (open && menuClose) menuClose.focus();
    }

    // --- List screen ---
    function filterRecipes({ ignoreTags = false } = {}) {
        let filtered = recipes;
        if (currentCategory) filtered = filtered.filter(r => categoryOf(r.path) === currentCategory);
        if (!ignoreTags && selectedTags.size > 0) {
            filtered = filtered.filter(r => Array.from(selectedTags).every(t => r.tags && r.tags.includes(t)));
        }
        if (searchTerm) {
            const low = searchTerm.toLowerCase();
            filtered = filtered.filter(r =>
                (r.name || "").toLowerCase().includes(low) ||
                (r.description || "").toLowerCase().includes(low) ||
                (r.tags || []).some(t => t.toLowerCase().includes(low))
            );
        }
        return filtered;
    }

    function renderTags(filtered) {
        if (!tagsContainer) return;
        // Counts follow the view: how many of the recipes now listed carry each tag
        const counts = new Map();
        filtered.forEach(r => (r.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));

        const grouped = new Set(TAG_GROUPS.flatMap(([, tags]) => tags));
        const others = Array.from(allTags).filter(t => !grouped.has(t)).sort();
        const groups = [...TAG_GROUPS, ...(others.length ? [["其他", others]] : [])];

        tagsContainer.innerHTML = groups.map(([label, tags]) => {
            const present = tags.filter(t => allTags.has(t));
            if (!present.length) return "";
            return `<div class="tag-group" role="group" aria-label="${escapeHtml(label)}">
                <span class="tag-group-label" aria-hidden="true">${escapeHtml(label)}</span>
                <div class="tag-list">${present.map(tag => {
                    const pressed = selectedTags.has(tag);
                    const n = counts.get(tag) || 0;
                    return `<button type="button" class="tag" data-tag="${escapeHtml(tag)}" aria-pressed="${pressed}" ${!pressed && n === 0 ? "disabled" : ""}>${escapeHtml(tag)}<span class="n">${n}</span></button>`;
                }).join("")}</div>
            </div>`;
        }).join("");

        const size = selectedTags.size;
        if (clearTagsButton) clearTagsButton.hidden = size === 0;
        if (tagCountBadge) {
            tagCountBadge.hidden = size === 0;
            tagCountBadge.textContent = size;
        }
    }

    function recipeRow(r) {
        // Each tag keeps its words together; the separator travels with the tag after it
        const tagsHtml = (r.tags || []).map((t, i) => `<span class="tag-word">${i ? "· " : ""}${escapeHtml(t)}</span>`).join(" ");
        const servings = r.servings || (recipeCache.get(r.path) || {}).servings;
        const servingsText = servings
            ? `${fmt(servings.quantity)}<small>${escapeHtml(servings.unit)}</small>`
            : recipeCache.has(r.path) ? `<span class="dash">–</span>` : `<span class="skeleton" style="width: 3em"></span>`;
        return `<tr class="recipe-row" data-path="${escapeHtml(r.path)}">
            <td>
                <a class="recipe-name" href="#recipe/${escapeHtml(r.path)}">${escapeHtml(r.name)}</a>
                <span class="recipe-desc">${escapeHtml(r.description)}</span>
                <span class="phone-meta">${tagsHtml}</span>
            </td>
            <td class="col-tags recipe-tags">${tagsHtml}</td>
            <td class="n col-servings recipe-num">${servingsText}</td>
            <td class="n col-kcal recipe-num">${kcalCell(r.path)}</td>
        </tr>`;
    }

    function renderRecipeList() {
        if (!recipeList) return;

        const title = currentCategory ? categoryLabel(currentCategory) : "全部食譜";
        if (listTitle) listTitle.textContent = title;
        if (topbarTitle && listView && !listView.hidden) topbarTitle.textContent = "Hung的食譜";

        if (summariesState === "loading") return; // keep the loading rows
        if (summariesState === "error" && recipes.length === 0) {
            if (listSub) listSub.textContent = "目前無法取得食譜清單";
            recipeList.innerHTML = `<tr class="empty-row"><td colspan="4" class="empty-cell"><div class="empty"><span>無法載入食譜清單，請確認網路連線。</span><button type="button" class="card-link" data-action="retry">重試</button></div></td></tr>`;
            return;
        }

        const filtered = filterRecipes();
        renderTags(filtered);

        const inScope = filterRecipes({ ignoreTags: true }).length;
        const scopeTotal = currentCategory ? recipes.filter(r => categoryOf(r.path) === currentCategory).length : recipes.length;
        const narrowed = selectedTags.size > 0 || searchTerm;
        if (listSub) {
            listSub.textContent = narrowed
                ? `符合條件 ${fmt(filtered.length)} 道，共 ${fmt(scopeTotal)} 道`
                : `${fmt(inScope)} 道食譜`;
        }

        if (kcalHeader) kcalHeader.setAttribute("aria-sort", kcalSort);

        if (filtered.length === 0) {
            recipeList.innerHTML = `<tr class="empty-row"><td colspan="4" class="empty-cell"><div class="empty"><span>沒有符合條件的食譜。</span><button type="button" class="card-link" data-action="clear-filters">清除搜尋與標籤</button></div></td></tr>`;
            return;
        }

        if (kcalSort !== "none") {
            const dir = kcalSort === "ascending" ? 1 : -1;
            const value = (r) => {
                const info = recipeCache.has(r.path) ? recipeKcal(r.path) : null;
                return info && info.known > 0 ? info.perServing : null;
            };
            const sorted = [...filtered].sort((a, b) => {
                const va = value(a), vb = value(b);
                if (va === null && vb === null) return 0;
                if (va === null) return 1; // unknown values last either way
                if (vb === null) return -1;
                return (va - vb) * dir;
            });
            recipeList.innerHTML = sorted.map(recipeRow).join("");
            return;
        }

        // Grouped by category when listing every category
        if (currentCategory) {
            recipeList.innerHTML = filtered.map(recipeRow).join("");
            return;
        }
        const groups = {};
        filtered.forEach(r => {
            const cat = categoryOf(r.path);
            (groups[cat] = groups[cat] || []).push(r);
        });
        const orderedCats = [
            ...Object.keys(CATEGORY_MAP).filter(cat => groups[cat]),
            ...Object.keys(groups).filter(cat => !CATEGORY_MAP[cat])
        ];
        recipeList.innerHTML = orderedCats.map(cat =>
            `<tr class="group-row"><th colspan="4" scope="colgroup"><h2>${escapeHtml(categoryLabel(cat))}</h2><span class="meta">${groups[cat].length} 道</span></th></tr>` +
            groups[cat].map(recipeRow).join("")
        ).join("");
    }

    function showList(category) {
        currentCategory = category && (CATEGORY_MAP[category] || recipes.some(r => categoryOf(r.path) === category)) ? category : "";
        currentRecipe = null;
        if (detailView) detailView.hidden = true;
        if (listView) listView.hidden = false;
        if (topbarBack) topbarBack.hidden = true;
        if (topbarShare) topbarShare.hidden = true;
        if (menuButton) menuButton.hidden = false;
        document.title = currentCategory ? `${categoryLabel(currentCategory)} · Hung的食譜` : "Hung的食譜";
        renderRecipeList();
        updateNavCurrent();
    }

    // --- Detail screen ---
    async function showRecipeDetail(path) {
        if (!detailView) return;
        const recipe = await loadRecipeDetails(path);
        if (!recipe) { window.location.hash = "#/"; return; }
        currentRecipe = recipe;
        if (listView) listView.hidden = true;
        detailView.hidden = false;
        if (topbarBack) topbarBack.hidden = false;
        if (topbarShare) topbarShare.hidden = false;
        if (menuButton) menuButton.hidden = true;
        if (topbarTitle) topbarTitle.textContent = categoryLabel(categoryOf(path));
        document.title = `${recipe.name} · Hung的食譜`;
        window.scrollTo(0, 0);
        updateNavCurrent();

        const cat = categoryOf(path);
        if (detailCategory) {
            detailCategory.textContent = categoryLabel(cat);
            detailCategory.href = `#/c/${encodeURIComponent(cat)}`;
        }
        recipeDetailName.textContent = recipe.name;
        recipeDetailDescription.textContent = recipe.description || "";

        // Tags link back to the list filtered by that tag
        if (recipeDetailTags) {
            recipeDetailTags.innerHTML = (recipe.tags || []).map(tag =>
                `<a href="#/" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</a>`
            ).join("");
        }

        if (recipe.servings && servingsInput) {
            servingsInput.value = recipe.servings.quantity;
            servingsUnit.textContent = recipe.servings.unit;
        }
        renderIngredients();
        renderSteps();

        recipeDetailNotes.innerHTML = "";
        if (recipe.notes && recipe.notes.length > 0) {
            recipe.notes.forEach(n => {
                const li = document.createElement("li");
                li.textContent = n;
                recipeDetailNotes.appendChild(li);
            });
            recipeDetailNotesContainer.hidden = false;
        } else {
            recipeDetailNotesContainer.hidden = true;
        }
    }

    function renderSteps() {
        if (!currentRecipe || !recipeDetailSteps) return;
        const path = currentRecipe.path;
        if (!doneSteps.has(path)) doneSteps.set(path, new Set());
        const done = doneSteps.get(path);
        recipeDetailSteps.innerHTML = currentRecipe.steps.map((s, i) =>
            `<li><button type="button" class="step" data-step="${i}" aria-pressed="${done.has(i)}">
                <span class="step-no">${i + 1}</span><span class="step-text">${escapeHtml(s)}</span>
            </button></li>`
        ).join("");
        updateStepsMeta();
    }

    function updateStepsMeta() {
        if (!stepsMeta || !currentRecipe) return;
        const total = currentRecipe.steps.length;
        const done = (doneSteps.get(currentRecipe.path) || new Set()).size;
        stepsMeta.textContent = done > 0 ? `完成 ${done} / ${total} 步` : `${total} 步`;
    }

    function formatQuantity(num) {
        if (num === null || num === undefined || isNaN(num)) return "";
        const rounded = Math.round(num * 100) / 100;
        return rounded.toString();
    }

    const LOCK_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>`;

    function baseServings() {
        return currentRecipe && currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;
    }

    function renderIngredients() {
        if (!currentRecipe || !recipeDetailIngredients) return;
        const base = baseServings();
        const current = servingsInput ? (parseFloat(servingsInput.value) || base) : base;
        const factor = current / base;

        recipeDetailIngredients.innerHTML = currentRecipe.ingredients.map((ing, idx) => {
            const displayVal = formatQuantity(parseFloat(ing.quantity) * factor);
            const label = `${ing.name}${ing.note ? `（${ing.note}）` : ""}`;
            return `<tr class="ing-row" data-index="${idx}">
                <td>
                    <span class="ing-name">${escapeHtml(ing.name)}</span>${ing.note ? `<span class="ing-note">${escapeHtml(ing.note)}</span>` : ""}
                    <span class="share" aria-hidden="true"><i style="transform: scaleX(0)"></i></span>
                </td>
                <td class="n">
                    <span class="qty">
                        <input type="number" step="any" min="0" inputmode="decimal" class="qty-input" value="${displayVal}" data-orig="${escapeHtml(ing.quantity)}" aria-label="${escapeHtml(label)}的份量（${escapeHtml(ing.unit)}）">
                        <span class="qty-unit">${escapeHtml(ing.unit)}</span>
                    </span>
                </td>
                <td class="n kcal"></td>
                <td class="col-lock">
                    <button type="button" class="lock-btn" aria-pressed="false" aria-label="鎖定${escapeHtml(label)}的份量" title="鎖定：份量不隨份數變動">${LOCK_ICON}</button>
                </td>
            </tr>`;
        }).join("");

        updateUnlockAllButtonVisibility();
        updateCaloriesDisplay();
    }

    function rowsOf() {
        return Array.from(recipeDetailIngredients.querySelectorAll("tr.ing-row"));
    }
    const isLocked = (row) => row.classList.contains("locked");

    function handleIngredientInput(targetInput) {
        const row = targetInput.closest("tr");

        // 若已鎖定：變更此欄位不影響其他欄位，亦不改動份數，但熱量需即時重算
        if (row && isLocked(row)) {
            updateCaloriesDisplay();
            return;
        }

        const origVal = parseFloat(targetInput.dataset.orig);
        const currentVal = parseFloat(targetInput.value);
        if (isNaN(currentVal) || currentVal <= 0 || isNaN(origVal) || origVal <= 0) {
            return;
        }

        const factor = currentVal / origVal;

        // 同步更新份數顯示
        if (servingsInput) {
            servingsInput.value = formatQuantity(baseServings() * factor);
        }

        // 更新其他「未鎖定」的食材
        rowsOf().forEach(r => {
            const input = r.querySelector(".qty-input");
            if (!input || input === targetInput || isLocked(r)) return;
            const orig = parseFloat(input.dataset.orig);
            if (!isNaN(orig)) input.value = formatQuantity(orig * factor);
        });

        updateCaloriesDisplay();
    }

    function setLocked(row, locked) {
        const button = row.querySelector(".lock-btn");
        const input = row.querySelector(".qty-input");
        row.classList.toggle("locked", locked);
        if (button) {
            button.setAttribute("aria-pressed", String(locked));
            button.title = locked ? "已鎖定：份量不隨份數變動" : "鎖定：份量不隨份數變動";
        }
        if (!locked && input) {
            // 解除鎖定時，自動根據當前份數重算該食材
            const base = baseServings();
            const current = servingsInput ? (parseFloat(servingsInput.value) || base) : base;
            const orig = parseFloat(input.dataset.orig);
            if (!isNaN(orig)) input.value = formatQuantity(orig * current / base);
        }
    }

    function updateIngredientsFromServings() {
        if (!currentRecipe || !servingsInput || !recipeDetailIngredients) return;
        const current = parseFloat(servingsInput.value);
        if (isNaN(current) || current <= 0) return;
        const factor = current / baseServings();

        rowsOf().forEach(row => {
            // 已鎖定的食材不隨份數變動！
            if (isLocked(row)) return;
            const input = row.querySelector(".qty-input");
            const orig = parseFloat(input.dataset.orig);
            if (!isNaN(orig)) input.value = formatQuantity(orig * factor);
        });

        updateCaloriesDisplay();
    }

    function stepServings(direction) {
        if (!servingsInput || !currentRecipe) return;
        const unit = currentRecipe.servings ? currentRecipe.servings.unit : "";
        const step = unit === "g" ? 50 : 1;
        const current = parseFloat(servingsInput.value) || baseServings();
        // Snap to the step grid, never below one step
        const next = direction > 0
            ? Math.floor(current / step + 1e-9) * step + step
            : Math.ceil(current / step - 1e-9) * step - step;
        servingsInput.value = formatQuantity(Math.max(step, next));
        updateIngredientsFromServings();
    }

    function updateCaloriesDisplay() {
        if (!currentRecipe || !recipeDetailIngredients) return;
        const rows = rowsOf();
        const items = rows.map((row, idx) => {
            const source = currentRecipe.ingredients[idx] || {};
            const input = row.querySelector(".qty-input");
            return { name: source.name, calorieRatio: source.calorieRatio, quantity: input ? (parseFloat(input.value) || 0) : 0 };
        });
        const kcal = kcalRows(items);
        const current = servingsInput ? (parseFloat(servingsInput.value) || baseServings()) : baseServings();
        const info = summarize(kcal, current);

        rows.forEach((row, idx) => {
            const k = kcal[idx];
            const cell = row.querySelector(".kcal");
            const bar = row.querySelector(".share i");
            if (cell) {
                if (!k.known) cell.innerHTML = `<span class="dash" title="尚無熱量資料">–</span>`;
                else cell.innerHTML = `${fmt(k.kcal)}${k.ratio < 1 ? `<span class="kcal-sub">計入 ${Math.round(k.ratio * 100)}%</span>` : ""}`;
            }
            if (bar) bar.style.transform = `scaleX(${info.total > 0 && k.known ? k.kcal / info.total : 0})`;
        });

        const hasData = info.known > 0;
        if (caloriesPerServingEl) caloriesPerServingEl.textContent = hasData ? fmt(info.perServing) : "–";
        if (caloriesTotalEl) caloriesTotalEl.textContent = hasData ? fmt(info.total) : "–";
        if (ingredientsTotalEl) ingredientsTotalEl.textContent = hasData ? fmt(info.total) : "–";
        if (caloriesCoverageEl) caloriesCoverageEl.innerHTML = `${info.known}<small>/ ${info.count} 項</small>`;
        if (caloriesMissingEl) {
            const missing = currentRecipe.ingredients.filter((_, idx) => !kcal[idx].known).map(i => i.name);
            caloriesMissingEl.textContent = missing.length ? `未計入：${missing.join("、")}` : "全部計入";
            caloriesMissingEl.title = caloriesMissingEl.textContent;
        }
    }

    function updateUnlockAllButtonVisibility() {
        if (!unlockAllButton || !recipeDetailIngredients) return;
        unlockAllButton.hidden = !rowsOf().some(isLocked);
    }

    async function shareCurrentRecipe(button) {
        if (!currentRecipe) return;
        const data = { title: `Hung的食譜 - ${currentRecipe.name}`, url: window.location.href };
        if (navigator.share) {
            await navigator.share(data).catch(() => {});
            return;
        }
        try {
            await navigator.clipboard.writeText(window.location.href);
            showToast("已複製食譜連結");
        } catch (e) {
            showToast("無法複製連結");
        }
    }

    function handleRouting() {
        const hash = window.location.hash;
        setMenuOpen(false);
        if (hash.startsWith("#recipe/")) showRecipeDetail(decodeURIComponent(hash.substring(8)));
        else if (hash.startsWith("#/c/")) showList(decodeURIComponent(hash.substring(4)));
        else showList("");
    }

    // --- Events ---
    if (searchInput) searchInput.addEventListener("input", (e) => { searchTerm = e.target.value.trim(); renderRecipeList(); });

    if (tagsContainer) tagsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".tag");
        if (!btn || btn.disabled) return;
        const tag = btn.dataset.tag;
        if (selectedTags.has(tag)) selectedTags.delete(tag);
        else selectedTags.add(tag);
        renderRecipeList();
        const again = tagsContainer.querySelector(`.tag[data-tag="${CSS.escape(tag)}"]`);
        if (again) again.focus();
    });

    if (clearTagsButton) clearTagsButton.addEventListener("click", () => { selectedTags.clear(); renderRecipeList(); });

    if (toggleTagsButton && tagsPanel) toggleTagsButton.addEventListener("click", () => {
        const open = tagsPanel.classList.toggle("open");
        toggleTagsButton.setAttribute("aria-expanded", String(open));
    });

    if (recipeList) recipeList.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]");
        if (action && action.dataset.action === "clear-filters") {
            selectedTags.clear();
            searchTerm = "";
            if (searchInput) searchInput.value = "";
            renderRecipeList();
            return;
        }
        if (action && action.dataset.action === "retry") {
            summariesState = "loading";
            fetchRecipeSummaries().then(renderRecipeList);
        }
    });

    if (sortKcalButton) sortKcalButton.addEventListener("click", () => {
        kcalSort = kcalSort === "none" ? "ascending" : kcalSort === "ascending" ? "descending" : "none";
        renderRecipeList();
    });

    if (recipeDetailTags) recipeDetailTags.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-tag]");
        if (!a) return;
        selectedTags = new Set([a.dataset.tag]);
        searchTerm = "";
        if (searchInput) searchInput.value = "";
    });

    if (recipeDetailIngredients) {
        recipeDetailIngredients.addEventListener("input", (e) => {
            if (e.target.classList.contains("qty-input")) handleIngredientInput(e.target);
        });
        recipeDetailIngredients.addEventListener("click", (e) => {
            const btn = e.target.closest(".lock-btn");
            if (!btn) return;
            const row = btn.closest("tr");
            setLocked(row, !isLocked(row));
            updateUnlockAllButtonVisibility();
            updateCaloriesDisplay();
        });
    }

    if (unlockAllButton) unlockAllButton.addEventListener("click", () => {
        rowsOf().filter(isLocked).forEach(row => setLocked(row, false));
        updateUnlockAllButtonVisibility();
        updateCaloriesDisplay();
    });

    if (recipeDetailSteps) recipeDetailSteps.addEventListener("click", (e) => {
        const btn = e.target.closest(".step");
        if (!btn || !currentRecipe) return;
        const done = doneSteps.get(currentRecipe.path);
        const i = Number(btn.dataset.step);
        if (done.has(i)) done.delete(i); else done.add(i);
        btn.setAttribute("aria-pressed", String(done.has(i)));
        updateStepsMeta();
    });

    if (servingsInput) servingsInput.addEventListener("input", updateIngredientsFromServings);
    if (servingsMinus) servingsMinus.addEventListener("click", () => stepServings(-1));
    if (servingsPlus) servingsPlus.addEventListener("click", () => stepServings(1));
    if (shareButton) shareButton.addEventListener("click", () => shareCurrentRecipe(shareButton));
    if (topbarShare) topbarShare.addEventListener("click", () => shareCurrentRecipe(topbarShare));
    if (menuButton) menuButton.addEventListener("click", () => setMenuOpen(true));
    if (menuClose) menuClose.addEventListener("click", () => { setMenuOpen(false); if (menuButton) menuButton.focus(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
            setMenuOpen(false);
            if (menuButton) menuButton.focus();
        }
    });

    // --- Initialization ---
    document.addEventListener("DOMContentLoaded", async () => {
        // Redundant version update check for safety
        const versionEl = document.getElementById("app-version");
        if (versionEl) versionEl.textContent = `Version: ${APP_VERSION}`;

        await Promise.all([
            fetchRecipeSummaries(),
            window.NutritionCalculator ? window.NutritionCalculator.load() : null
        ]);
        handleRouting();
        // The bundle fills the kcal column and makes every recipe available offline
        await loadAllRecipes();
        if (listView && !listView.hidden) renderRecipeList();
    });

    window.addEventListener("hashchange", handleRouting);
})();
