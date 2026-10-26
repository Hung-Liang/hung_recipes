import os
import json
import re
import sys
import hashlib
import math

ALLOWED_UNITS = {"g", "ml"}


def is_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def validate_recipe(recipe, relative_path):
    """Return a list of schema errors for one recipe."""
    errors = []

    def err(msg):
        errors.append(f"{relative_path}: {msg}")

    if not isinstance(recipe, dict):
        return [f"{relative_path}: 頂層必須是 JSON 物件"]

    if not isinstance(recipe.get("name"), str) or not recipe["name"].strip():
        err("缺少 name")
    if not isinstance(recipe.get("description", ""), str):
        err("description 必須是字串")

    servings = recipe.get("servings")
    if not isinstance(servings, dict):
        err("缺少 servings（{\"quantity\": 數字, \"unit\": \"份\"}）")
    else:
        if not is_number(servings.get("quantity")) or servings["quantity"] <= 0:
            err(f"servings.quantity 必須是大於 0 的數字，目前為 {servings.get('quantity')!r}")
        if not isinstance(servings.get("unit"), str) or not servings["unit"].strip():
            err("缺少 servings.unit")

    # Minutes from the first step until the dish is ready, including marinating, simmering and chilling
    total_time = recipe.get("totalTime")
    if not (isinstance(total_time, int) and not isinstance(total_time, bool) and total_time > 0):
        err(f"totalTime 必須是大於 0 的整數（分鐘），目前為 {total_time!r}")

    tags = recipe.get("tags", [])
    if not isinstance(tags, list) or not all(isinstance(t, str) for t in tags):
        err("tags 必須是字串陣列")

    ingredients = recipe.get("ingredients")
    if not isinstance(ingredients, list) or not ingredients:
        err("ingredients 必須是非空陣列")
        ingredients = []
    for idx, ing in enumerate(ingredients, 1):
        if not isinstance(ing, dict):
            err(f"第 {idx} 個食材必須是物件")
            continue
        label = f"第 {idx} 個食材「{ing.get('name', '')}」"
        if not isinstance(ing.get("name"), str) or not ing["name"].strip():
            err(f"{label} 缺少 name")
        if not is_number(ing.get("quantity")) or ing["quantity"] < 0:
            err(f"{label} 的 quantity 必須是 >= 0 的數字，目前為 {ing.get('quantity')!r}")
        if ing.get("unit") not in ALLOWED_UNITS:
            err(f"{label} 的 unit 必須是 {' / '.join(sorted(ALLOWED_UNITS))}，目前為 {ing.get('unit')!r}")
        ratio = ing.get("calorieRatio")
        if ratio is not None and not (is_number(ratio) and 0 <= ratio <= 1):
            err(f"{label} 的 calorieRatio 必須介於 0–1，目前為 {ratio!r}")
        note = ing.get("note")
        if note is not None and not isinstance(note, str):
            err(f"{label} 的 note 必須是字串，目前為 {note!r}")
        unknown_keys = set(ing) - {"name", "quantity", "unit", "note", "calorieRatio"}
        if unknown_keys:
            err(f"{label} 有未知欄位：{', '.join(sorted(unknown_keys))}")

    for field in ("steps", "notes"):
        value = recipe.get(field, [])
        if field == "steps" and not value:
            err("steps 必須是非空陣列")
        elif not isinstance(value, list) or not all(isinstance(s, str) for s in value):
            err(f"{field} 必須是字串陣列")

    return errors


def js_round(x):
    # Match JavaScript Math.round (half up), not Python's banker's rounding
    return math.floor(x + 0.5)


def kcal_per_serving(recipe, nutrition_db):
    """Same math as kcalRows/summarize in js/app.js; None when no ingredient has data."""
    total = 0
    known = 0
    for ing in recipe["ingredients"]:
        kcal_per_100 = nutrition_db.get(ing["name"].strip())
        if not is_number(kcal_per_100):
            continue
        ratio = ing.get("calorieRatio", 1)
        total += js_round(ing["quantity"] * kcal_per_100 * ratio / 100)
        known += 1
    if known == 0:
        return None
    return js_round(total / recipe["servings"]["quantity"])


def compute_build_id(script_dir, sw_content):
    """Hash the static app-shell files precached by sw.js (line endings normalized)."""
    match = re.search(r"ASSETS_TO_CACHE\s*=\s*\[([\s\S]*?)\]", sw_content)
    assets = re.findall(r"['\"]\./([^'\"]+)['\"]", match.group(1)) if match else []
    digest = hashlib.sha256()
    missing = []
    for asset in sorted(assets):
        # Data files are served network-first, so they should not bust the shell cache
        if asset.startswith("asset/") and asset.endswith(".json"):
            continue
        path = os.path.join(script_dir, asset)
        if not os.path.exists(path):
            missing.append(asset)
            continue
        with open(path, 'rb') as f:
            data = f.read()
        if not asset.endswith(".png"):
            data = data.replace(b"\r\n", b"\n")
        digest.update(asset.encode("utf-8") + b"\0" + data)
    return digest.hexdigest()[:8], missing


def update_recipe_list():
    """
    Dynamically updates asset/recipes.json and asset/info.json by recursively
    scanning the recipes directory for JSON files.
    Also synchronizes application version, stamps the service worker cache name
    with a content hash, validates the recipe schema, and validates that all
    ingredients exist in asset/nutrition.json.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    recipes_dir = os.path.join(script_dir, 'recipes')
    recipes_output_path = os.path.join(script_dir, 'asset', 'recipes.json')
    info_path = os.path.join(script_dir, 'asset', 'info.json')
    nutrition_path = os.path.join(script_dir, 'asset', 'nutrition.json')
    aliases_path = os.path.join(script_dir, 'asset', 'ingredient_aliases.json')

    # --- 1. Version Synchronization ---
    sw_path = os.path.join(script_dir, 'sw.js')
    index_path = os.path.join(script_dir, 'index.html')

    version = "v0.0.0"
    if os.path.exists(sw_path):
        with open(sw_path, 'r', encoding='utf-8') as f:
            content = f.read()
            match = re.search(r"CACHE_NAME\s*=\s*['\"].*?-v([\d\.]+)(?:-[0-9a-f]+)?['\"]", content)
            if match:
                version = f"v{match.group(1)}"
                print(f"Detected version: {version}")

    if version != "v0.0.0":
        # Update index.html
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = re.sub(r'(id="app-version"[^>]*>Version: )v[\d\.]+<', rf'\g<1>{version}<', content)
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

        print(f"Successfully synchronized version {version} to index.html")

        # Stamp the cache name with a hash of the app shell so any change to
        # HTML/CSS/JS invalidates installed PWAs without a manual version bump
        with open(sw_path, 'r', encoding='utf-8') as f:
            sw_content = f.read()
        build_id, missing_assets = compute_build_id(script_dir, sw_content)
        if missing_assets:
            print(f"[ERROR] sw.js 的 ASSETS_TO_CACHE 中有不存在的檔案：{', '.join(missing_assets)}")
            sys.exit(1)
        new_sw_content = re.sub(
            r"(CACHE_NAME\s*=\s*['\"].*?-v[\d\.]+)(?:-[0-9a-f]+)?(['\"])",
            rf"\g<1>-{build_id}\g<2>",
            sw_content,
            count=1
        )
        if new_sw_content != sw_content:
            with open(sw_path, 'w', encoding='utf-8') as f:
                f.write(new_sw_content)
        print(f"Service worker cache name stamped with build id {build_id}")

    # --- 2. Nutrition Database & Ingredient Standardization Validation ---
    nutrition_db = {}
    if os.path.exists(nutrition_path):
        with open(nutrition_path, 'r', encoding='utf-8') as f:
            nutrition_db = json.load(f)
        print(f"Loaded {len(nutrition_db)} standard ingredients from {nutrition_path}")
    else:
        print(f"WARNING: {nutrition_path} does not exist!")

    # Old/variant ingredient names -> standard name (+ note), used for error hints
    aliases = {}
    if os.path.exists(aliases_path):
        with open(aliases_path, 'r', encoding='utf-8') as f:
            aliases = json.load(f)

    # --- 3. Recipe Update Logic & Ingredient Verification ---
    recipe_summaries = []
    all_recipes_data = {}
    all_tags = set()
    missing_ingredients = {}
    schema_errors = []
    filenames = {}
    recipe_names = {}

    for root, _, files in os.walk(recipes_dir):
        for file in files:
            if file.endswith('.json') and not file.startswith('.'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, recipes_dir).replace('\\', '/')

                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        recipe_data = json.load(f)
                except Exception as e:
                    schema_errors.append(f"{relative_path}: 無法解析 JSON（{e}）")
                    continue

                errors = validate_recipe(recipe_data, relative_path)
                if errors:
                    schema_errors.extend(errors)
                    continue

                filenames.setdefault(file, []).append(relative_path)
                recipe_names.setdefault(recipe_data["name"].strip(), []).append(relative_path)

                # Validate ingredients against standard nutrition table
                for ing in recipe_data["ingredients"]:
                    ing_name = ing["name"].strip()
                    if ing_name not in nutrition_db:
                        missing_ingredients.setdefault(ing_name, []).append(relative_path)

                summary = {
                    "path": relative_path,
                    "filename": os.path.splitext(file)[0],
                    "name": recipe_data["name"],
                    "description": recipe_data.get("description", ""),
                    "tags": recipe_data.get("tags", []),
                    "servings": recipe_data["servings"],
                    "totalTime": recipe_data["totalTime"],
                    # Unique ingredient names, so the list can search by ingredient
                    "ingredients": list(dict.fromkeys(ing["name"].strip() for ing in recipe_data["ingredients"]))
                }
                recipe_summaries.append(summary)
                all_recipes_data[relative_path] = recipe_data

                for tag in recipe_data.get("tags", []):
                    all_tags.add(tag)

    for kind, index in (("檔名", filenames), ("食譜名稱", recipe_names)):
        for key, paths in sorted(index.items()):
            if len(paths) > 1:
                schema_errors.append(f"重複的{kind}「{key}」：{', '.join(sorted(paths))}")

    if schema_errors:
        print(f"\n[ERROR] 發現 {len(schema_errors)} 個食譜格式問題：")
        for e in schema_errors:
            print(f"  * {e}")
        print("\n請修正後再重新執行 update_recipes.py！\n")
        sys.exit(1)

    print(f"[OK] All {len(recipe_summaries)} recipes passed schema validation!")

    # Check for missing ingredients
    if missing_ingredients:
        print("\n[ERROR] 發現未在 asset/nutrition.json 中的非標準食材！")
        print("為了確保「食材標準化」與「熱量確定化」，請先將以下食材及其每 100g 熱量新增至 asset/nutrition.json：")
        for ing_name, file_list in sorted(missing_ingredients.items()):
            files_str = ", ".join(file_list[:2]) + ("..." if len(file_list) > 2 else "")
            hint = ""
            if ing_name in aliases:
                alias = aliases[ing_name]
                hint = f" → 請改用標準名稱 \"{alias['name']}\"" + (f"，note: \"{alias['note']}\"" if alias.get('note') else "")
            print(f"  * {ing_name} (見於: {files_str}){hint}")
        print("\n請補齊 asset/nutrition.json 後再重新執行 update_recipes.py！\n")
        sys.exit(1)

    print("[OK] All ingredients in all recipes strictly match asset/nutrition.json!")

    # --- 4. Report ingredients whose calorie value is still unknown (null) ---
    invalid_values = {k: v for k, v in nutrition_db.items()
                      if v is not None and (not is_number(v) or v < 0)}
    if invalid_values:
        print("\n[ERROR] asset/nutrition.json 中有無效的熱量數值（須為 >= 0 的數字或 null）：")
        for k, v in sorted(invalid_values.items()):
            print(f"  * {k}: {v!r}")
        sys.exit(1)

    unknown_kcal = sorted(k for k, v in nutrition_db.items() if v is None)
    if unknown_kcal:
        print(f"[WARN] {len(unknown_kcal)} 項食材尚未建立熱量資料 (null)：{', '.join(unknown_kcal[:10])}{' ...' if len(unknown_kcal) > 10 else ''}")

    used_names = {ing["name"].strip() for r in all_recipes_data.values() for ing in r["ingredients"]}
    unused = sorted(set(nutrition_db) - used_names)
    if unused:
        print(f"[WARN] {len(unused)} 項 asset/nutrition.json 食材未被任何食譜使用：{', '.join(unused[:10])}{' ...' if len(unused) > 10 else ''}")

    # Precompute kcal per serving so the list does not need the full recipe bundle
    for summary in recipe_summaries:
        summary["kcal"] = kcal_per_serving(all_recipes_data[summary["path"]], nutrition_db)

    # Sort recipes by category (directory name)
    recipe_summaries.sort(key=lambda x: x['path'])

    # Sort recipes by path for deterministic cross-platform output
    sorted_recipes_data = {k: all_recipes_data[k] for k in sorted(all_recipes_data.keys())}

    # Save asset/recipes.json
    os.makedirs(os.path.dirname(recipes_output_path), exist_ok=True)
    with open(recipes_output_path, 'w', encoding='utf-8') as f:
        json.dump(sorted_recipes_data, f, separators=(",", ":"), ensure_ascii=False)

    # Save asset/info.json
    info_data = {
        "recipes": recipe_summaries,
        "allTags": sorted(list(all_tags)),
        "totalRecipes": len(recipe_summaries),
        "lastUpdated": None
    }
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(info_data, f, separators=(",", ":"), ensure_ascii=False)

    print(f"Successfully updated {info_path} with {len(recipe_summaries)} recipes.")


if __name__ == "__main__":
    update_recipe_list()
