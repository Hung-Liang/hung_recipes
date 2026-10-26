// Use a self-contained closure to avoid polluting the global namespace.
(function () {
    const $ = (id) => document.getElementById(id);

    // --- DOM References ---
    const listView = $("list-view");
    const detailView = $("detail-view");
    const listTitle = $("list-title");
    const listSub = $("list-sub");
    const recipeList = $("recipe-list");
    const kcalHeader = $("kcal-header");
    const timeHeader = $("time-header");
    const searchInput = $("search-input");
    const tagsContainer = $("tags-container");
    const tagsPanel = $("tags-panel");
    const toggleTagsButton = $("toggle-tags");
    const tagCountBadge = $("tag-count-badge");
    const clearTagsButton = $("clear-tags");
    const categoryNav = $("category-nav");
    const collectionNav = $("collection-nav");
    const sidebar = $("sidebar");
    const menuButton = $("menu-button");
    const menuClose = $("menu-close");
    const topbarTitle = $("topbar-title");
    const topbarBack = $("topbar-back");
    const topbarShare = $("topbar-share");
    const topbarFav = $("topbar-fav");

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
    const favButton = $("fav-button");
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

    // Personal lists kept in this browser; routed like categories (#/c/<key>)
    const COLLECTIONS = {
        'favorites': '我的收藏',
        'recent': '最近看過'
    };
    const RECENT_LIMIT = 30;

    // Total-time filter choices (minutes), shown above the tag groups
    const TIME_LIMITS = [[15, "15 分鐘內"], [30, "30 分鐘內"], [60, "1 小時內"]];

    // Tag groups for the filter panel; tags not listed here fall into 其他
    const TAG_GROUPS = [
        ["菜系", ["中式", "日式", "西式", "韓式", "港式", "南洋"]],
        ["食材", ["豬肉", "雞肉", "牛肉", "海鮮", "豆腐", "蔬食"]],
        ["類型", ["主食", "點心", "甜點", "醬汁", "飲品"]],
        ["做法", ["一鍋到底", "免開火", "紅燒", "煙燻"]],
        ["工具", ["氣炸鍋", "電鍋", "烤箱"]],
        ["飲食", ["高蛋白", "低碳"]]
    ];

    // State
    let currentRecipe = null;
    let recipes = [];
    let recipeCache = new Map();
    let allTags = new Set();
    let selectedTags = new Set();
    let searchTerm = "";
    let currentCategory = "";      // "" = all recipes
    let sortKey = "";              // "" | kcal | time
    let sortDir = "none";          // none | ascending | descending
    let timeLimit = 0;             // max totalTime in minutes; 0 = any
    let summariesState = "loading"; // loading | ready | error
    const doneSteps = new Map();   // path -> Set of step indexes marked done
    const doneStepsAt = new Map(); // path -> last time its steps were toggled (ms)
    let favorites = new Set();     // paths
    let recentPaths = [];          // paths, most recent first
    let wakeLock = null;

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
    const categoryLabel = (cat) => CATEGORY_MAP[cat] || COLLECTIONS[cat] || cat;

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

    // Per-serving kcal is precomputed by update_recipes.py; null when no ingredient has data
    const summaryKcal = (r) => typeof r.kcal === "number" ? r.kcal : null;

    const summaryTime = (r) => typeof r.totalTime === "number" ? r.totalTime : null;

    // Compact form for the list: minutes under an hour, otherwise hours to one decimal
    function timeCell(r) {
        const t = summaryTime(r);
        if (t === null) return `<span class="dash">–</span>`;
        if (t < 60) return `${fmt(t)}<small>分</small>`;
        return `${fmt(Math.round(t / 6) / 10)}<small>小時</small>`;
    }

    function formatDuration(minutes) {
        const h = Math.floor(minutes / 60), m = minutes % 60;
        if (!h) return `${m} 分鐘`;
        return m ? `${h} 小時 ${m} 分鐘` : `${h} 小時`;
    }

    function kcalCell(r) {
        const kcal = summaryKcal(r);
        if (kcal === null) return `<span class="dash">–</span>`;
        return `${fmt(kcal)}<small>kcal</small>`;
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
        const active = detailView && !detailView.hidden && currentRecipe ? categoryOf(currentRecipe.path) : currentCategory;
        [collectionNav, categoryNav].filter(Boolean).flatMap(nav => [...nav.querySelectorAll(".nav-item")]).forEach(a => {
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

    // --- Favorites and recently viewed ---
    const FAVORITES_KEY = "favorites";
    const RECENT_KEY = "recent_recipes";

    function loadPathList(key) {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(key) || "null"); } catch (e) { /* storage blocked or corrupt */ }
        return Array.isArray(saved) ? saved.filter(p => typeof p === "string") : [];
    }

    function savePathList(key, paths) {
        try { localStorage.setItem(key, JSON.stringify(paths)); } catch (e) { /* storage blocked */ }
    }

    function recordRecent(path) {
        recentPaths = [path, ...recentPaths.filter(p => p !== path)].slice(0, RECENT_LIMIT);
        savePathList(RECENT_KEY, recentPaths);
    }

    function toggleFavorite() {
        if (!currentRecipe) return;
        const path = currentRecipe.path;
        if (favorites.has(path)) favorites.delete(path); else favorites.add(path);
        savePathList(FAVORITES_KEY, [...favorites]);
        updateFavButtons();
        showToast(favorites.has(path) ? "已加入收藏" : "已取消收藏");
    }

    function updateFavButtons() {
        const on = !!currentRecipe && favorites.has(currentRecipe.path);
        [favButton, topbarFav].forEach(btn => { if (btn) btn.setAttribute("aria-pressed", String(on)); });
        if (favButton) favButton.querySelector("span").textContent = on ? "已收藏" : "收藏";
    }

    // --- List screen ---
    // Recipes in the current category or collection, before search and tags
    function scopeRecipes() {
        if (currentCategory === "favorites") return recipes.filter(r => favorites.has(r.path));
        if (currentCategory === "recent") {
            const byPath = new Map(recipes.map(r => [r.path, r]));
            return recentPaths.map(p => byPath.get(p)).filter(Boolean);
        }
        return currentCategory ? recipes.filter(r => categoryOf(r.path) === currentCategory) : recipes;
    }

    function filterRecipes({ ignoreTags = false, ignoreTime = false } = {}) {
        let filtered = scopeRecipes();
        if (!ignoreTime && timeLimit) filtered = filtered.filter(r => summaryTime(r) !== null && summaryTime(r) <= timeLimit);
        if (!ignoreTags && selectedTags.size > 0) {
            filtered = filtered.filter(r => Array.from(selectedTags).every(t => r.tags && r.tags.includes(t)));
        }
        // Whitespace-separated keywords must all match, each in any field
        const keywords = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
        if (keywords.length) {
            filtered = filtered.filter(r => {
                const fields = [r.name || "", r.description || "", ...(r.tags || []), ...(r.ingredients || [])]
                    .map(s => s.toLowerCase());
                return keywords.every(k => fields.some(f => f.includes(k)));
            });
        }
        return filtered;
    }

    function renderTags(filtered) {
        if (!tagsContainer) return;
        // Counts follow the view: how many of the recipes now listed carry each tag
        const counts = new Map();
        filtered.forEach(r => (r.tags || []).forEach(t => counts.set(t, (counts.get(t) || 0) + 1)));

        // Time limits are exclusive choices, so each count ignores the current limit
        const timeScope = filterRecipes({ ignoreTime: true });
        const timeGroup = `<div class="tag-group" role="group" aria-label="時間">
                <span class="tag-group-label" aria-hidden="true">時間</span>
                <div class="tag-list">${TIME_LIMITS.map(([limit, label]) => {
                    const pressed = timeLimit === limit;
                    const n = timeScope.filter(r => summaryTime(r) !== null && summaryTime(r) <= limit).length;
                    return `<button type="button" class="tag" data-time="${limit}" aria-pressed="${pressed}" ${!pressed && n === 0 ? "disabled" : ""}>${label}<span class="n">${n}</span></button>`;
                }).join("")}</div>
            </div>`;

        const grouped = new Set(TAG_GROUPS.flatMap(([, tags]) => tags));
        const others = Array.from(allTags).filter(t => !grouped.has(t)).sort();
        const groups = [...TAG_GROUPS, ...(others.length ? [["其他", others]] : [])];

        tagsContainer.innerHTML = timeGroup + groups.map(([label, tags]) => {
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

        const size = selectedTags.size + (timeLimit ? 1 : 0);
        if (clearTagsButton) clearTagsButton.hidden = size === 0;
        if (tagCountBadge) {
            tagCountBadge.hidden = size === 0;
            tagCountBadge.textContent = size;
        }
    }

    function recipeRow(r) {
        // Each tag keeps its words together; the separator travels with the tag after it
        const tagsHtml = (r.tags || []).map((t, i) => `<span class="tag-word">${i ? "· " : ""}${escapeHtml(t)}</span>`).join(" ");
        const servings = r.servings;
        const servingsText = servings
            ? `${fmt(servings.quantity)}<small>${escapeHtml(servings.unit)}</small>`
            : `<span class="dash">–</span>`;
        return `<tr class="recipe-row" data-path="${escapeHtml(r.path)}">
            <td>
                <a class="recipe-name" href="#recipe/${escapeHtml(r.path)}">${escapeHtml(r.name)}</a>
                <span class="recipe-desc">${escapeHtml(r.description)}</span>
                <span class="phone-meta">${summaryTime(r) !== null ? `<span class="tag-word">${timeCell(r)}${tagsHtml ? " ·" : ""}</span> ` : ""}${tagsHtml}</span>
            </td>
            <td class="col-tags recipe-tags">${tagsHtml}</td>
            <td class="n col-servings recipe-num">${servingsText}</td>
            <td class="n col-time recipe-num">${timeCell(r)}</td>
            <td class="n col-kcal recipe-num">${kcalCell(r)}</td>
        </tr>`;
    }

    // --- Filters in the URL: #/c/<category>?q=<search>&time=<minutes>&t=<tag>&t=<tag> ---
    function listHash() {
        const params = new URLSearchParams();
        if (searchTerm) params.set("q", searchTerm);
        if (timeLimit) params.set("time", timeLimit);
        selectedTags.forEach(t => params.append("t", t));
        const query = params.toString();
        return (currentCategory ? `#/c/${encodeURIComponent(currentCategory)}` : "#/") + (query ? `?${query}` : "");
    }

    // Replace rather than push, so typing a search does not flood the back stack
    function syncListUrl() {
        if (!listView || listView.hidden) return;
        const hash = listHash();
        if (window.location.hash !== hash) history.replaceState(null, "", hash);
    }

    // A list link without a query keeps the current filters, as before filters lived in the URL
    function applyFilterQuery(query) {
        if (query === null) return;
        const params = new URLSearchParams(query);
        searchTerm = (params.get("q") || "").trim();
        // Drop tags that no longer exist, e.g. from links saved before a tag was retired
        selectedTags = new Set(params.getAll("t").filter(t => allTags.size === 0 || allTags.has(t)));
        const limit = Number(params.get("time"));
        timeLimit = TIME_LIMITS.some(([l]) => l === limit) ? limit : 0;
        if (searchInput) searchInput.value = searchTerm;
    }

    function renderRecipeList() {
        if (!recipeList) return;
        syncListUrl();

        const title = currentCategory ? categoryLabel(currentCategory) : "全部食譜";
        if (listTitle) listTitle.textContent = title;
        if (topbarTitle && listView && !listView.hidden) topbarTitle.textContent = "Hung的食譜";

        if (summariesState === "loading") return; // keep the loading rows
        if (summariesState === "error" && recipes.length === 0) {
            if (listSub) listSub.textContent = "目前無法取得食譜清單";
            recipeList.innerHTML = `<tr class="empty-row"><td colspan="5" class="empty-cell"><div class="empty"><span>無法載入食譜清單，請確認網路連線。</span><button type="button" class="card-link" data-action="retry">重試</button></div></td></tr>`;
            return;
        }

        const filtered = filterRecipes();
        renderTags(filtered);

        const inScope = filterRecipes({ ignoreTags: true }).length;
        const scopeTotal = scopeRecipes().length;
        const narrowed = selectedTags.size > 0 || searchTerm || timeLimit;
        if (listSub) {
            listSub.textContent = narrowed
                ? `符合條件 ${fmt(filtered.length)} 道，共 ${fmt(scopeTotal)} 道`
                : `${fmt(inScope)} 道食譜`;
        }

        if (kcalHeader) kcalHeader.setAttribute("aria-sort", sortKey === "kcal" ? sortDir : "none");
        if (timeHeader) timeHeader.setAttribute("aria-sort", sortKey === "time" ? sortDir : "none");

        if (scopeTotal === 0 && COLLECTIONS[currentCategory]) {
            const hint = currentCategory === "favorites" ? "還沒有收藏的食譜，在食譜頁按「收藏」加入。" : "還沒有看過的食譜。";
            recipeList.innerHTML = `<tr class="empty-row"><td colspan="5" class="empty-cell"><div class="empty"><span>${hint}</span></div></td></tr>`;
            return;
        }

        if (filtered.length === 0) {
            recipeList.innerHTML = `<tr class="empty-row"><td colspan="5" class="empty-cell"><div class="empty"><span>沒有符合條件的食譜。</span><button type="button" class="card-link" data-action="clear-filters">清除搜尋與標籤</button></div></td></tr>`;
            return;
        }

        if (sortDir !== "none") {
            const dir = sortDir === "ascending" ? 1 : -1;
            const value = sortKey === "time" ? summaryTime : summaryKcal;
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
            `<tr class="group-row"><th colspan="5" scope="colgroup"><h2>${escapeHtml(categoryLabel(cat))}</h2><span class="meta">${groups[cat].length} 道</span></th></tr>` +
            groups[cat].map(recipeRow).join("")
        ).join("");
    }

    function showList(category) {
        currentCategory = category && (CATEGORY_MAP[category] || COLLECTIONS[category] || recipes.some(r => categoryOf(r.path) === category)) ? category : "";
        currentRecipe = null;
        releaseWakeLock();
        if (detailView) detailView.hidden = true;
        if (listView) listView.hidden = false;
        if (topbarBack) topbarBack.hidden = true;
        if (topbarShare) topbarShare.hidden = true;
        if (topbarFav) topbarFav.hidden = true;
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
        if (topbarFav) topbarFav.hidden = false;
        if (menuButton) menuButton.hidden = true;
        if (topbarTitle) topbarTitle.textContent = categoryLabel(categoryOf(path));
        document.title = `${recipe.name} · Hung的食譜`;
        window.scrollTo(0, 0);
        updateNavCurrent();
        requestWakeLock();
        recordRecent(path);
        updateFavButtons();

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
                `<a href="#/?${escapeHtml(new URLSearchParams({ t: tag }).toString())}">${escapeHtml(tag)}</a>`
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
        const time = typeof currentRecipe.totalTime === "number" ? ` · 約 ${formatDuration(currentRecipe.totalTime)}` : "";
        stepsMeta.textContent = (done > 0 ? `完成 ${done} / ${total} 步` : `${total} 步`) + time;
    }

    // Step progress survives reloads for a day; without storage it stays in memory only
    const STEPS_KEY = "step_progress";
    const STEPS_TTL = 24 * 60 * 60 * 1000;

    function loadStepProgress() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(STEPS_KEY) || "null"); } catch (e) { /* storage blocked or corrupt */ }
        if (!saved || typeof saved !== "object") return;
        const now = Date.now();
        Object.entries(saved).forEach(([path, entry]) => {
            if (!entry || !Array.isArray(entry.steps) || !(now - entry.at < STEPS_TTL)) return;
            doneSteps.set(path, new Set(entry.steps));
            doneStepsAt.set(path, entry.at);
        });
    }

    function saveStepProgress() {
        const saved = {};
        doneSteps.forEach((steps, path) => {
            if (steps.size > 0) saved[path] = { steps: [...steps], at: doneStepsAt.get(path) || Date.now() };
        });
        try { localStorage.setItem(STEPS_KEY, JSON.stringify(saved)); } catch (e) { /* storage blocked */ }
    }

    // Keep the screen on while a recipe is open; the browser drops the lock when the page is hidden
    async function requestWakeLock() {
        if (!("wakeLock" in navigator) || wakeLock || document.visibilityState !== "visible") return;
        try {
            const lock = await navigator.wakeLock.request("screen");
            if (!currentRecipe) { lock.release(); return; } // left the recipe while waiting
            wakeLock = lock;
            lock.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
        } catch (e) {
            console.warn("Screen wake lock unavailable:", e);
        }
    }

    function releaseWakeLock() {
        if (!wakeLock) return;
        wakeLock.release();
        wakeLock = null;
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
        if (hash.startsWith("#recipe/")) { showRecipeDetail(decodeURIComponent(hash.substring(8))); return; }
        const q = hash.indexOf("?");
        const route = q === -1 ? hash : hash.substring(0, q);
        applyFilterQuery(q === -1 ? null : hash.substring(q + 1));
        if (route.startsWith("#/c/")) showList(decodeURIComponent(route.substring(4)));
        else showList("");
    }

    // --- Events ---
    if (searchInput) searchInput.addEventListener("input", (e) => { searchTerm = e.target.value.trim(); renderRecipeList(); });

    if (tagsContainer) tagsContainer.addEventListener("click", (e) => {
        const btn = e.target.closest(".tag");
        if (!btn || btn.disabled) return;
        if (btn.dataset.time) {
            const limit = Number(btn.dataset.time);
            timeLimit = timeLimit === limit ? 0 : limit;
            renderRecipeList();
            const again = tagsContainer.querySelector(`.tag[data-time="${limit}"]`);
            if (again) again.focus();
            return;
        }
        const tag = btn.dataset.tag;
        if (selectedTags.has(tag)) selectedTags.delete(tag);
        else selectedTags.add(tag);
        renderRecipeList();
        const again = tagsContainer.querySelector(`.tag[data-tag="${CSS.escape(tag)}"]`);
        if (again) again.focus();
    });

    if (clearTagsButton) clearTagsButton.addEventListener("click", () => { selectedTags.clear(); timeLimit = 0; renderRecipeList(); });

    if (toggleTagsButton && tagsPanel) toggleTagsButton.addEventListener("click", () => {
        const open = tagsPanel.classList.toggle("open");
        toggleTagsButton.setAttribute("aria-expanded", String(open));
    });

    if (recipeList) recipeList.addEventListener("click", (e) => {
        const action = e.target.closest("[data-action]");
        if (action && action.dataset.action === "clear-filters") {
            selectedTags.clear();
            timeLimit = 0;
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

    // A new column starts ascending; the same column cycles ascending -> descending -> off
    document.querySelectorAll(".sort-btn[data-sort]").forEach(btn => btn.addEventListener("click", () => {
        const key = btn.dataset.sort;
        if (sortKey !== key) { sortKey = key; sortDir = "ascending"; }
        else sortDir = sortDir === "ascending" ? "descending" : sortDir === "descending" ? "none" : "ascending";
        renderRecipeList();
    }));

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
        doneStepsAt.set(currentRecipe.path, Date.now());
        saveStepProgress();
        btn.setAttribute("aria-pressed", String(done.has(i)));
        updateStepsMeta();
    });

    if (servingsInput) servingsInput.addEventListener("input", updateIngredientsFromServings);
    if (servingsMinus) servingsMinus.addEventListener("click", () => stepServings(-1));
    if (servingsPlus) servingsPlus.addEventListener("click", () => stepServings(1));
    if (shareButton) shareButton.addEventListener("click", () => shareCurrentRecipe(shareButton));
    if (topbarShare) topbarShare.addEventListener("click", () => shareCurrentRecipe(topbarShare));
    if (favButton) favButton.addEventListener("click", toggleFavorite);
    if (topbarFav) topbarFav.addEventListener("click", toggleFavorite);
    if (menuButton) menuButton.addEventListener("click", () => setMenuOpen(true));
    if (menuClose) menuClose.addEventListener("click", () => { setMenuOpen(false); if (menuButton) menuButton.focus(); });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && sidebar && sidebar.classList.contains("open")) {
            setMenuOpen(false);
            if (menuButton) menuButton.focus();
        }
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && currentRecipe) requestWakeLock();
    });

    // --- Initialization ---
    loadStepProgress();
    favorites = new Set(loadPathList(FAVORITES_KEY));
    recentPaths = loadPathList(RECENT_KEY);
    document.addEventListener("DOMContentLoaded", async () => {
        await Promise.all([
            fetchRecipeSummaries(),
            window.NutritionCalculator ? window.NutritionCalculator.load() : null
        ]);
        handleRouting();
        // The bundle is only needed offline, so fetch it once the page is idle
        const whenIdle = window.requestIdleCallback ? (cb) => window.requestIdleCallback(cb) : ((cb) => setTimeout(cb, 2000));
        whenIdle(() => loadAllRecipes());
    });

    window.addEventListener("hashchange", handleRouting);
})();
