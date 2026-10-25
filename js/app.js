// Use a self-contained closure to avoid polluting the global namespace.
(function () {
    // Current application version (Sync with sw.js CACHE_NAME)
    const APP_VERSION = "v1.6.1";

    // 1. Update Version Display IMMEDIATELY (Script is at bottom of body, so element should exist)
    try {
        const versionEl = document.getElementById("app-version");
        if (versionEl) versionEl.textContent = `Version: ${APP_VERSION}`;
    } catch (e) {
        console.error("Failed to set version:", e);
    }

    // --- DOM References ---
    const recipeListContainer = document.getElementById("recipe-list-container");
    const recipeDetailContainer = document.getElementById("recipe-detail-container");
    const recipeDetailName = document.getElementById("recipe-detail-name");
    const recipeDetailDescription = document.getElementById("recipe-detail-description");
    const recipeDetailIngredients = document.getElementById("recipe-detail-ingredients");
    const recipeDetailSteps = document.getElementById("recipe-detail-steps");
    const recipeDetailNotes = document.getElementById("recipe-detail-notes");
    const recipeDetailNotesContainer = document.getElementById("recipe-detail-notes-container");
    const backButton = document.getElementById("back-button");
    const servingsInput = document.getElementById("servings-input");
    const servingsUnit = document.getElementById("servings-unit");
    const tagsContainer = document.getElementById("tags-container");
    const selectedTagsSpan = document.getElementById("selected-tags");
    const clearTagsButton = document.getElementById("clear-tags");
    const searchInput = document.getElementById("search-input");
    const categoryNav = document.getElementById("category-nav");
    const caloriesPerServingEl = document.getElementById("calories-per-serving");
    const caloriesTotalEl = document.getElementById("calories-total");
    const caloriesCoverageBadge = document.getElementById("calories-coverage-badge");
    const toggleCaloriesBtn = document.getElementById("toggle-calories-breakdown");
    const caloriesBreakdownPanel = document.getElementById("calories-breakdown-panel");
    const caloriesChevron = document.getElementById("calories-chevron");
    const caloriesVisualBar = document.getElementById("calories-visual-bar");
    const caloriesBreakdownList = document.getElementById("calories-breakdown-list");

    // Category mapping
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

    // State
    let currentRecipe = null;
    let recipes = []; 
    let recipeCache = new Map(); 
    let allTags = new Set(); 
    let selectedTags = new Set(); 
    let searchTerm = "";

    // Escape text before interpolating it into innerHTML templates
    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    async function fetchRecipeSummaries() {
        const CACHE_KEY = "recipe_summaries_cache";
        const cachedData = localStorage.getItem(CACHE_KEY);
        if (cachedData) {
            try {
                const parsed = JSON.parse(cachedData);
                if (parsed.recipes && parsed.recipes.length > 0) {
                    recipes = parsed.recipes;
                    allTags.clear();
                    if (parsed.allTags) parsed.allTags.forEach(tag => allTags.add(tag));
                    renderTags();
                    renderRecipeList();
                }
            } catch (e) {
                localStorage.removeItem(CACHE_KEY);
            }
        }

        try {
            const response = await fetch("asset/info.json", { cache: "no-cache" });
            if (!response.ok) throw new Error(`Fetch failed`);
            const data = await response.json();
            recipes = data.recipes || [];
            allTags.clear();
            if (data.allTags) data.allTags.forEach(tag => allTags.add(tag));
            localStorage.setItem(CACHE_KEY, JSON.stringify(data));
            renderTags();
            renderRecipeList();
        } catch (error) {
            console.error(error);
        }
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
            return null;
        }
    }

    function renderTags() {
        if (!tagsContainer) return;
        tagsContainer.innerHTML = "";
        Array.from(allTags).sort().forEach((tag) => {
            const btn = document.createElement("button");
            btn.className = selectedTags.has(tag)
                ? "px-3 py-1 text-sm rounded-full border-2 border-blue-500 bg-blue-500 text-white"
                : "px-3 py-1 text-sm rounded-full border-2 border-gray-300 bg-white text-gray-700";
            btn.textContent = tag;
            btn.onclick = () => {
                if (selectedTags.has(tag)) selectedTags.delete(tag);
                else selectedTags.add(tag);
                renderTags();
                renderRecipeList();
            };
            tagsContainer.appendChild(btn);
        });
        updateSelectedTagsDisplay();
    }

    function updateSelectedTagsDisplay() {
        const badge = document.getElementById("tag-count-badge");
        if (selectedTags.size === 0) {
            if (selectedTagsSpan) selectedTagsSpan.textContent = "無";
            if (clearTagsButton) clearTagsButton.classList.add("hidden");
            if (badge) badge.classList.add("hidden");
        } else {
            if (selectedTagsSpan) selectedTagsSpan.textContent = Array.from(selectedTags).join(", ");
            if (clearTagsButton) clearTagsButton.classList.remove("hidden");
            if (badge) {
                badge.textContent = selectedTags.size;
                badge.classList.remove("hidden");
            }
        }
    }

    function renderRecipeList() {
        if (!recipeListContainer) return;
        recipeListContainer.classList.remove("hidden");
        if (recipeDetailContainer) recipeDetailContainer.classList.add("hidden");
        recipeListContainer.innerHTML = "";
        if (categoryNav) categoryNav.innerHTML = "";
        
        let filtered = recipes;
        if (selectedTags.size > 0) {
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

        if (filtered.length === 0) {
            recipeListContainer.innerHTML = `<div class="col-span-full text-center py-8 text-gray-500">沒有找到符合條件的食譜</div>`;
            return;
        }

        const groups = {};
        filtered.forEach(r => {
            const cat = r.path.split('/')[0];
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(r);
        });

        const presentCats = Object.keys(groups);
        const orderedCats = [
            ...Object.keys(CATEGORY_MAP).filter(cat => groups[cat]),
            ...presentCats.filter(cat => !CATEGORY_MAP[cat])
        ];

        orderedCats.forEach(cat => {
            const catTitle = CATEGORY_MAP[cat] || cat;
            const navBtn = document.createElement("button");
            navBtn.className = "px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-200 shadow-sm";
            navBtn.textContent = catTitle;
            navBtn.onclick = () => {
                const el = document.getElementById(`section-${cat}`);
                if (el) window.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
            };
            if (categoryNav) categoryNav.appendChild(navBtn);

            const header = document.createElement("div");
            header.id = `section-${cat}`;
            header.className = "col-span-full mt-8 mb-4 first:mt-0";
            header.innerHTML = `<div class="flex items-center space-x-4"><h2 class="text-2xl font-bold text-gray-900">${escapeHtml(catTitle)}</h2><div class="flex-grow h-px bg-gray-200"></div></div>`;
            recipeListContainer.appendChild(header);

            groups[cat].forEach(r => {
                const card = document.createElement("div");
                card.className = "bg-white rounded-2xl shadow-lg p-6 border border-gray-200 cursor-pointer flex flex-col h-full";
                
                // Create tags HTML
                const tagsHtml = r.tags ? r.tags.map(tag => 
                    `<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full border border-gray-200">${escapeHtml(tag)}</span>`
                ).join('') : '';

                card.innerHTML = `
                    <div class="flex-grow">
                        <h3 class="text-xl font-bold text-gray-900 mb-2">${escapeHtml(r.name)}</h3>
                        <p class="text-gray-600 line-clamp-2 text-sm mb-4">${escapeHtml(r.description)}</p>
                    </div>
                    <div class="flex flex-wrap gap-1 mt-auto">
                        ${tagsHtml}
                    </div>
                `;
                card.onclick = () => window.location.hash = `recipe/${r.path}`;
                recipeListContainer.appendChild(card);
            });
        });
    }

    async function showRecipeDetail(path) {
        if (!recipeDetailContainer) return;
        recipeDetailName.textContent = "載入中...";
        const recipe = await loadRecipeDetails(path);
        if (!recipe) { window.location.hash = ""; return; }
        currentRecipe = recipe;
        if (recipeListContainer) recipeListContainer.classList.add("hidden");
        recipeDetailContainer.classList.remove("hidden");
        window.scrollTo(0, 0);

        recipeDetailName.textContent = recipe.name;
        
        // Render Tags in Detail View
        const detailTagsContainer = document.getElementById("recipe-detail-tags");
        if (detailTagsContainer) {
            detailTagsContainer.innerHTML = recipe.tags ? recipe.tags.map(tag => 
                `<span class="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200">${escapeHtml(tag)}</span>`
            ).join('') : '';
        }

        recipeDetailDescription.textContent = recipe.description;
        if (recipe.servings && servingsInput) {
            servingsInput.value = recipe.servings.quantity;
            servingsUnit.textContent = recipe.servings.unit;
        }
        renderIngredients();
        recipeDetailSteps.innerHTML = "";
        recipe.steps.forEach(s => {
            const li = document.createElement("li");
            li.textContent = s;
            recipeDetailSteps.appendChild(li);
        });
        recipeDetailNotes.innerHTML = "";
        if (recipe.notes && recipe.notes.length > 0) {
            recipe.notes.forEach(n => {
                const li = document.createElement("li");
                li.textContent = n;
                recipeDetailNotes.appendChild(li);
            });
            recipeDetailNotesContainer.classList.remove("hidden");
        } else {
            recipeDetailNotesContainer.classList.add("hidden");
        }
    }

    function formatQuantity(num) {
        if (num === null || num === undefined || isNaN(num)) return "";
        const rounded = Math.round(num * 100) / 100;
        return rounded.toString();
    }

    function renderIngredients() {
        if (!currentRecipe || !recipeDetailIngredients) return;
        const baseServings = currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;
        const currentServings = servingsInput ? (parseFloat(servingsInput.value) || baseServings) : baseServings;
        const factor = currentServings / baseServings;

        recipeDetailIngredients.innerHTML = "";
        currentRecipe.ingredients.forEach((ing) => {
            const li = document.createElement("li");
            li.className = "flex items-center justify-between p-2.5 sm:p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors gap-2 sm:gap-4 border border-gray-100";
            
            const origQty = parseFloat(ing.quantity);
            const displayVal = formatQuantity(origQty * factor);

            li.innerHTML = `
                <div class="flex-1 min-w-0 pr-1 flex items-center flex-wrap gap-x-2">
                    <span class="ingredient-name text-gray-800 font-medium truncate text-sm sm:text-base">${escapeHtml(ing.name)}</span>
                    <span class="ingredient-kcal-tag text-[11px] font-medium transition-colors"></span>
                </div>
                <div class="flex items-center space-x-2 shrink-0">
                    <input 
                        type="number" 
                        step="any" 
                        min="0"
                        value="${displayVal}" 
                        class="ingredient-input w-20 sm:w-24 px-2.5 py-1.5 text-right border border-gray-300 rounded-lg text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white transition-all shadow-sm" 
                        data-orig="${escapeHtml(ing.quantity)}"
                    >
                    <span class="ingredient-unit text-gray-500 text-xs sm:text-sm w-8 sm:w-10 shrink-0 text-left">${escapeHtml(ing.unit)}</span>
                    <label class="flex items-center space-x-1 cursor-pointer select-none text-xs text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors shrink-0 shadow-sm" title="鎖定此食材份量（不隨份數變動，修改亦不影響其他欄位）">
                        <input type="checkbox" class="ingredient-lock rounded text-amber-600 focus:ring-amber-500 h-3.5 w-3.5 sm:h-4 sm:w-4 border-gray-300">
                        <span class="lock-icon text-sm leading-none opacity-40 grayscale hover:opacity-75 transition-opacity">🔒</span>
                    </label>
                </div>
            `;

            const input = li.querySelector(".ingredient-input");
            const lockCheckbox = li.querySelector(".ingredient-lock");

            input.addEventListener("input", handleIngredientInput);
            lockCheckbox.addEventListener("change", handleLockChange);

            recipeDetailIngredients.appendChild(li);
        });

        updateUnlockAllButtonVisibility();
        updateCaloriesDisplay();
    }

    function handleIngredientInput(e) {
        const targetInput = e.target;
        const row = targetInput.closest("li");
        const lockCheckbox = row ? row.querySelector(".ingredient-lock") : null;

        // 若已鎖定：變更此欄位不影響其他欄位，亦不改動份數，但熱量需即時重算
        if (lockCheckbox && lockCheckbox.checked) {
            updateCaloriesDisplay();
            return;
        }

        const origVal = parseFloat(targetInput.dataset.orig);
        const currentVal = parseFloat(targetInput.value);
        if (isNaN(currentVal) || currentVal <= 0 || isNaN(origVal) || origVal <= 0) {
            return;
        }

        const factor = currentVal / origVal;
        const baseServings = currentRecipe && currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;

        // 同步更新份數顯示
        if (servingsInput) {
            servingsInput.value = formatQuantity(baseServings * factor);
        }

        // 更新其他「未鎖定」的食材
        const rows = recipeDetailIngredients.querySelectorAll("li");
        rows.forEach(r => {
            const input = r.querySelector(".ingredient-input");
            const lock = r.querySelector(".ingredient-lock");
            if (!input || input === targetInput) return;

            // 已鎖定的食材維持自訂值不隨之變動
            if (lock && lock.checked) return;

            const orig = parseFloat(input.dataset.orig);
            if (!isNaN(orig)) {
                input.value = formatQuantity(orig * factor);
            }
        });

        updateCaloriesDisplay();
    }

    function handleLockChange(e) {
        const checkbox = e.target;
        const row = checkbox.closest("li");
        if (!row) return;

        const input = row.querySelector(".ingredient-input");
        const iconSpan = row.querySelector(".lock-icon");
        const labelEl = checkbox.closest("label");

        if (checkbox.checked) {
            // 啟用鎖定視覺效果
            if (input) {
                input.classList.add("bg-amber-50", "border-amber-400", "text-amber-900", "font-semibold", "ring-1", "ring-amber-300");
                input.classList.remove("bg-white", "border-gray-300", "text-gray-800");
                input.title = "已鎖定：變更此食材不影響其他欄位，亦不受份數變動影響";
            }
            if (labelEl) {
                labelEl.classList.add("bg-amber-100", "border-amber-300", "text-amber-800", "font-medium");
                labelEl.classList.remove("bg-white", "border-gray-200", "text-gray-500");
            }
            if (iconSpan) {
                iconSpan.className = "lock-icon text-sm leading-none opacity-100";
            }
        } else {
            // 解除鎖定視覺效果
            if (input) {
                input.classList.remove("bg-amber-50", "border-amber-400", "text-amber-900", "font-semibold", "ring-1", "ring-amber-300");
                input.classList.add("bg-white", "border-gray-300", "text-gray-800");
                input.removeAttribute("title");

                // 解除鎖定時，自動根據當前份數重算該食材
                const baseServings = currentRecipe && currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;
                const currentServings = servingsInput ? (parseFloat(servingsInput.value) || baseServings) : baseServings;
                const factor = currentServings / baseServings;
                const orig = parseFloat(input.dataset.orig);
                if (!isNaN(orig) && !isNaN(factor)) {
                    input.value = formatQuantity(orig * factor);
                }
            }
            if (labelEl) {
                labelEl.classList.remove("bg-amber-100", "border-amber-300", "text-amber-800", "font-medium");
                labelEl.classList.add("bg-white", "border-gray-200", "text-gray-500");
            }
            if (iconSpan) {
                iconSpan.className = "lock-icon text-sm leading-none opacity-40 grayscale hover:opacity-75 transition-opacity";
            }
        }

        updateUnlockAllButtonVisibility();
        updateCaloriesDisplay();
    }

    function updateIngredientsFromServings() {
        if (!currentRecipe || !servingsInput || !recipeDetailIngredients) return;
        const baseServings = currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;
        const currentServings = parseFloat(servingsInput.value);
        if (isNaN(currentServings) || currentServings <= 0) return;

        const factor = currentServings / baseServings;

        const rows = recipeDetailIngredients.querySelectorAll("li");
        rows.forEach(row => {
            const lockCheckbox = row.querySelector(".ingredient-lock");
            const input = row.querySelector(".ingredient-input");
            if (!lockCheckbox || !input) return;

            // 已鎖定的食材不隨份數變動！
            if (lockCheckbox.checked) return;

            const orig = parseFloat(input.dataset.orig);
            if (!isNaN(orig)) {
                input.value = formatQuantity(orig * factor);
            }
        });

        updateCaloriesDisplay();
    }

    function updateCaloriesDisplay() {
        if (!window.NutritionCalculator || !recipeDetailIngredients) return;

        const rows = recipeDetailIngredients.querySelectorAll("li");
        const ingredientItems = [];

        rows.forEach(row => {
            const nameEl = row.querySelector(".ingredient-name");
            const input = row.querySelector(".ingredient-input");
            const unitEl = row.querySelector(".ingredient-unit");
            const kcalTagEl = row.querySelector(".ingredient-kcal-tag");

            const rawName = nameEl ? nameEl.textContent.trim() : "";
            const qty = input ? (parseFloat(input.value) || 0) : 0;
            const unit = unitEl ? unitEl.textContent.trim() : "g";

            ingredientItems.push({
                name: rawName,
                quantity: qty,
                unit: unit,
                kcalTagEl: kcalTagEl
            });
        });

        const baseServings = currentRecipe && currentRecipe.servings ? (parseFloat(currentRecipe.servings.quantity) || 1) : 1;
        const currentServings = servingsInput ? (parseFloat(servingsInput.value) || baseServings) : baseServings;

        const result = window.NutritionCalculator.calculate(ingredientItems, currentServings);

        // 1. 更新主熱量與每份熱量
        if (caloriesPerServingEl) {
            caloriesPerServingEl.textContent = result.perServingCalories.toLocaleString();
        }
        if (caloriesTotalEl) {
            caloriesTotalEl.textContent = result.totalCalories.toLocaleString();
        }

        // 2. 更新涵蓋率徽章
        if (caloriesCoverageBadge) {
            if (result.coveragePercent >= 98) {
                caloriesCoverageBadge.textContent = "完整估算";
                caloriesCoverageBadge.className = "text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold border border-emerald-200/60";
            } else {
                caloriesCoverageBadge.textContent = `約 ${result.coveragePercent}% 涵蓋`;
                caloriesCoverageBadge.className = "text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200/60";
            }
        }

        // 3. 更新每一列食材上的個別熱量標籤
        ingredientItems.forEach(item => {
            if (!item.kcalTagEl) return;
            const matchInfo = window.NutritionCalculator.findCaloriePer100(item.name);
            if (matchInfo) {
                const itemKcal = Math.round((item.quantity * matchInfo.kcalPer100) / 100);
                if (matchInfo.kcalPer100 === 0) {
                    item.kcalTagEl.textContent = "0 kcal";
                    item.kcalTagEl.className = "ingredient-kcal-tag text-[11px] text-gray-400 font-normal ml-2";
                } else {
                    item.kcalTagEl.textContent = `~${itemKcal.toLocaleString()} kcal`;
                    item.kcalTagEl.className = "ingredient-kcal-tag text-[11px] text-orange-600 font-medium ml-2";
                }
            } else {
                item.kcalTagEl.textContent = "";
            }
        });

        // 4. 更新明細面板（長條圖與清單）
        if (caloriesVisualBar) {
            caloriesVisualBar.innerHTML = "";
            const colors = ["bg-orange-500", "bg-amber-400", "bg-yellow-400", "bg-emerald-400", "bg-sky-400", "bg-indigo-400"];
            
            const activeItems = result.items.filter(it => it.roundedKcal > 0);
            activeItems.forEach((it, idx) => {
                if (it.percentage <= 0) return;
                const segment = document.createElement("div");
                const colorClass = colors[idx % colors.length];
                segment.className = `h-full ${colorClass} transition-all duration-300`;
                segment.style.width = `${it.percentage}%`;
                segment.title = `${it.name}: ${it.roundedKcal} kcal (${it.percentage}%)`;
                caloriesVisualBar.appendChild(segment);
            });
        }

        if (caloriesBreakdownList) {
            caloriesBreakdownList.innerHTML = "";
            const colors = ["bg-orange-500", "bg-amber-400", "bg-yellow-400", "bg-emerald-400", "bg-sky-400", "bg-indigo-400"];
            
            result.items.forEach((it, idx) => {
                const li = document.createElement("li");
                li.className = "flex items-center justify-between py-1 text-xs";
                
                const dotColor = it.roundedKcal > 0 ? colors[idx % colors.length] : "bg-gray-300";
                const displayKcal = it.isKnown ? `${it.roundedKcal.toLocaleString()} kcal` : "未計入";
                const percentText = it.isKnown && result.totalCalories > 0 ? `(${it.percentage}%)` : "";

                li.innerHTML = `
                    <div class="flex items-center space-x-2 min-w-0 pr-2">
                        <span class="w-2 h-2 rounded-full ${dotColor} shrink-0"></span>
                        <span class="text-gray-700 font-medium truncate">${escapeHtml(it.name)}</span>
                        <span class="text-gray-400 text-[11px]">${escapeHtml(it.quantity)} ${escapeHtml(it.unit)}</span>
                    </div>
                    <div class="flex items-center space-x-1.5 shrink-0">
                        <span class="font-semibold ${it.roundedKcal > 0 ? 'text-gray-800' : 'text-gray-400'}">${displayKcal}</span>
                        <span class="text-gray-400 text-[11px] w-10 text-right">${percentText}</span>
                    </div>
                `;
                caloriesBreakdownList.appendChild(li);
            });
        }
    }

    function updateUnlockAllButtonVisibility() {
        const unlockAllBtn = document.getElementById("unlock-all-ingredients");
        if (!unlockAllBtn || !recipeDetailIngredients) return;
        const anyLocked = Array.from(recipeDetailIngredients.querySelectorAll(".ingredient-lock")).some(cb => cb.checked);
        if (anyLocked) {
            unlockAllBtn.classList.remove("hidden");
        } else {
            unlockAllBtn.classList.add("hidden");
        }
    }

    function unlockAllIngredients() {
        if (!recipeDetailIngredients) return;
        const checkboxes = recipeDetailIngredients.querySelectorAll(".ingredient-lock");
        checkboxes.forEach(cb => {
            if (cb.checked) {
                cb.checked = false;
                cb.dispatchEvent(new Event("change"));
            }
        });
    }

    function handleRouting() {
        const hash = window.location.hash;
        if (hash.startsWith("#recipe/")) showRecipeDetail(hash.substring(8));
        else renderRecipeList();
    }

    // --- Initialization ---
    document.addEventListener("DOMContentLoaded", async () => {
        // Redundant version update check for safety
        const versionEl = document.getElementById("app-version");
        if (versionEl) versionEl.textContent = `Version: ${APP_VERSION}`;

        const toggleBtn = document.getElementById("toggle-tags");
        const tagsSection = document.getElementById("tags-filter-section");
        const toggleIcon = document.getElementById("toggle-icon");
        const shareBtn = document.getElementById("share-button");

        if (toggleBtn && tagsSection && toggleIcon) {
            toggleBtn.onclick = () => {
                const isHidden = tagsSection.classList.toggle("hidden");
                if (isHidden) {
                    toggleIcon.classList.remove("rotate-180");
                    toggleIcon.classList.remove("md:rotate-180");
                } else {
                    toggleIcon.classList.add("rotate-180");
                }
            };
        }

        if (shareBtn) {
            shareBtn.onclick = async () => {
                if (!currentRecipe) return;
                const data = { title: `Hung的食譜 - ${currentRecipe.name}`, url: window.location.href };
                if (navigator.share) await navigator.share(data).catch(() => {});
                else {
                    await navigator.clipboard.writeText(window.location.href);
                    const origText = shareBtn.innerHTML;
                    shareBtn.innerHTML = "已複製網址";
                    setTimeout(() => shareBtn.innerHTML = origText, 2000);
                }
            };
        }

        if (toggleCaloriesBtn && caloriesBreakdownPanel) {
            toggleCaloriesBtn.addEventListener("click", () => {
                const isHidden = caloriesBreakdownPanel.classList.toggle("hidden");
                if (caloriesChevron) caloriesChevron.classList.toggle("rotate-180", !isHidden);
            });
        }

        const unlockAllBtn = document.getElementById("unlock-all-ingredients");
        if (unlockAllBtn) unlockAllBtn.onclick = unlockAllIngredients;

        if (clearTagsButton) clearTagsButton.onclick = () => { selectedTags.clear(); renderTags(); renderRecipeList(); };
        if (searchInput) searchInput.oninput = (e) => { searchTerm = e.target.value; renderRecipeList(); };
        if (backButton) backButton.onclick = () => window.location.hash = "";

        await fetchRecipeSummaries();
        handleRouting();
    });

    window.addEventListener("hashchange", handleRouting);
    if (servingsInput) servingsInput.addEventListener("input", updateIngredientsFromServings);
})();
