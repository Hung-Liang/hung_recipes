// Use a self-contained closure to avoid polluting the global namespace.
(function () {
    // Current application version (Sync with sw.js CACHE_NAME)
    const APP_VERSION = "v1.4.1";

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

    // Category mapping
    const CATEGORY_MAP = {
        'poultry': '家禽/雞肉',
        'meat': '肉類料理',
        'seafood': '海鮮料理',
        'staples': '主食/麵飯',
        'snacks_desserts': '點心/早餐',
        'sauces_basics': '醬料/基礎',
        'unsort': '待分類'
    };

    // State
    let currentRecipe = null;
    let recipes = []; 
    let recipeCache = new Map(); 
    let allTags = new Set(); 
    let selectedTags = new Set(); 
    let searchTerm = ""; 

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
            const response = await fetch("asset/info.json");
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
            filtered = filtered.filter(r => r.name.toLowerCase().includes(low) || r.description.toLowerCase().includes(low));
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

        Object.keys(CATEGORY_MAP).filter(cat => groups[cat]).forEach(cat => {
            const navBtn = document.createElement("button");
            navBtn.className = "px-4 py-2 text-sm font-medium rounded-lg bg-white border border-gray-200 shadow-sm";
            navBtn.textContent = CATEGORY_MAP[cat] || cat;
            navBtn.onclick = () => {
                const el = document.getElementById(`section-${cat}`);
                if (el) window.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
            };
            if (categoryNav) categoryNav.appendChild(navBtn);

            const header = document.createElement("div");
            header.id = `section-${cat}`;
            header.className = "col-span-full mt-8 mb-4 first:mt-0";
            header.innerHTML = `<div class="flex items-center space-x-4"><h2 class="text-2xl font-bold text-gray-900">${CATEGORY_MAP[cat] || cat}</h2><div class="flex-grow h-px bg-gray-200"></div></div>`;
            recipeListContainer.appendChild(header);

            groups[cat].forEach(r => {
                const card = document.createElement("div");
                card.className = "bg-white rounded-2xl shadow-lg p-6 border border-gray-200 cursor-pointer flex flex-col h-full";
                
                // Create tags HTML
                const tagsHtml = r.tags ? r.tags.map(tag => 
                    `<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full border border-gray-200">${tag}</span>`
                ).join('') : '';

                card.innerHTML = `
                    <div class="flex-grow">
                        <h3 class="text-xl font-bold text-gray-900 mb-2">${r.name}</h3>
                        <p class="text-gray-600 line-clamp-2 text-sm mb-4">${r.description}</p>
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
                `<span class="px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full border border-blue-200">${tag}</span>`
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

    function renderIngredients() {
        if (!currentRecipe || !recipeDetailIngredients) return;
        const factor = parseFloat(servingsInput.value) / (currentRecipe.servings ? currentRecipe.servings.quantity : 1);
        recipeDetailIngredients.innerHTML = "";
        currentRecipe.ingredients.forEach((ing) => {
            const li = document.createElement("li");
            li.className = "flex items-center space-x-2";
            li.innerHTML = `<span class="text-gray-700 w-1/2">${ing.name}:</span><input type="number" value="${(ing.quantity * factor).toFixed(2)}" class="ingredient-input block w-full px-3 py-2 border rounded-md" data-orig="${ing.quantity}"><span class="text-gray-500">${ing.unit}</span>`;
            recipeDetailIngredients.appendChild(li);
        });
        document.querySelectorAll(".ingredient-input").forEach(input => {
            input.addEventListener("input", (e) => {
                const f = parseFloat(e.target.value) / parseFloat(e.target.dataset.orig);
                document.querySelectorAll(".ingredient-input").forEach(i => {
                    if (i !== e.target) i.value = (parseFloat(i.dataset.orig) * f).toFixed(2);
                });
            });
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

        if (clearTagsButton) clearTagsButton.onclick = () => { selectedTags.clear(); renderTags(); renderRecipeList(); };
        if (searchInput) searchInput.oninput = (e) => { searchTerm = e.target.value; renderRecipeList(); };
        if (backButton) backButton.onclick = () => window.location.hash = "";

        await fetchRecipeSummaries();
        handleRouting();
    });

    window.addEventListener("hashchange", handleRouting);
    if (servingsInput) servingsInput.addEventListener("input", renderIngredients);
})();
