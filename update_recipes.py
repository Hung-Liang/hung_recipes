import os
import json
import re
import sys

def update_recipe_list():
    """
    Dynamically updates asset/recipes.json and asset/info.json by recursively
    scanning the recipes directory for JSON files.
    Also synchronizes application version, standardizes ingredients,
    and validates that all ingredients exist in asset/nutrition.json.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    recipes_dir = os.path.join(script_dir, 'recipes')
    recipes_output_path = os.path.join(script_dir, 'asset', 'recipes.json')
    info_path = os.path.join(script_dir, 'asset', 'info.json')
    nutrition_path = os.path.join(script_dir, 'asset', 'nutrition.json')

    # --- 1. Version Synchronization ---
    sw_path = os.path.join(script_dir, 'sw.js')
    index_path = os.path.join(script_dir, 'index.html')
    app_js_path = os.path.join(script_dir, 'js', 'app.js')

    version = "v0.0.0"
    if os.path.exists(sw_path):
        with open(sw_path, 'r', encoding='utf-8') as f:
            content = f.read()
            match = re.search(r"CACHE_NAME\s*=\s*['\"].*?-v([\d\.]+)['\"]", content)
            if match:
                version = f"v{match.group(1)}"
                print(f"Detected version: {version}")

    if version != "v0.0.0":
        # Update index.html
        if os.path.exists(index_path):
            with open(index_path, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = re.sub(r'id="app-version".*?>Version: v[\d\.]+<', f'id="app-version" class="mt-1 text-gray-400">Version: {version}<', content)
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(new_content)

        # Update app.js
        if os.path.exists(app_js_path):
            with open(app_js_path, 'r', encoding='utf-8') as f:
                content = f.read()
            new_content = re.sub(r'const APP_VERSION\s*=\s*["\']v[\d\.]+["\']', f'const APP_VERSION = "{version}"', content)
            with open(app_js_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
        
        print(f"Successfully synchronized version {version} to index.html and app.js")

    # --- 2. Nutrition Database & Ingredient Standardization Validation ---
    nutrition_db = {}
    if os.path.exists(nutrition_path):
        with open(nutrition_path, 'r', encoding='utf-8') as f:
            nutrition_db = json.load(f)
        print(f"Loaded {len(nutrition_db)} standard ingredients from {nutrition_path}")
    else:
        print(f"WARNING: {nutrition_path} does not exist!")

    # --- 3. Recipe Update Logic & Ingredient Verification ---
    recipe_summaries = []
    all_recipes_data = {}
    all_tags = set()
    missing_ingredients = {}

    for root, _, files in os.walk(recipes_dir):
        for file in files:
            if file.endswith('.json') and not file.startswith('.'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, recipes_dir).replace('\\', '/')
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        recipe_data = json.load(f)
                    
                    # Validate ingredients against standard nutrition table
                    for ing in recipe_data.get("ingredients", []):
                        ing_name = ing.get("name", "").strip()
                        if ing_name and ing_name not in nutrition_db:
                            if ing_name not in missing_ingredients:
                                missing_ingredients[ing_name] = []
                            missing_ingredients[ing_name].append(relative_path)

                    summary = {
                        "path": relative_path,
                        "filename": os.path.splitext(file)[0],
                        "name": recipe_data.get("name", "未命名食譜"),
                        "description": recipe_data.get("description", ""),
                        "tags": recipe_data.get("tags", [])
                    }
                    recipe_summaries.append(summary)
                    all_recipes_data[relative_path] = recipe_data
                    
                    for tag in recipe_data.get("tags", []):
                        all_tags.add(tag)
                except Exception as e:
                    print(f"Error processing {file_path}: {e}")

    # Check for missing ingredients
    if missing_ingredients:
        print("\n[ERROR] 發現未在 asset/nutrition.json 中的非標準食材！")
        print("為了確保「食材標準化」與「熱量確定化」，請先將以下食材及其每 100g 熱量新增至 asset/nutrition.json：")
        for ing_name, file_list in sorted(missing_ingredients.items()):
            files_str = ", ".join(file_list[:2]) + ("..." if len(file_list) > 2 else "")
            print(f"  * {ing_name} (見於: {files_str})")
        print("\n請補齊 asset/nutrition.json 後再重新執行 update_recipes.py！\n")
        sys.exit(1)

    print("[OK] All ingredients in all recipes strictly match asset/nutrition.json!")

    # --- 4. Report ingredients whose calorie value is still unknown (null) ---
    invalid_values = {k: v for k, v in nutrition_db.items()
                      if v is not None and (not isinstance(v, (int, float)) or isinstance(v, bool) or v < 0)}
    if invalid_values:
        print("\n[ERROR] asset/nutrition.json 中有無效的熱量數值（須為 >= 0 的數字或 null）：")
        for k, v in sorted(invalid_values.items()):
            print(f"  * {k}: {v!r}")
        sys.exit(1)

    unknown_kcal = sorted(k for k, v in nutrition_db.items() if v is None)
    if unknown_kcal:
        print(f"[WARN] {len(unknown_kcal)} 項食材尚未建立熱量資料 (null)：{', '.join(unknown_kcal[:10])}{' ...' if len(unknown_kcal) > 10 else ''}")

    # Sort recipes by category (directory name)
    recipe_summaries.sort(key=lambda x: x['path'])

    # Sort recipes by path for deterministic cross-platform output
    sorted_recipes_data = {k: all_recipes_data[k] for k in sorted(all_recipes_data.keys())}

    # Save asset/recipes.json
    os.makedirs(os.path.dirname(recipes_output_path), exist_ok=True)
    with open(recipes_output_path, 'w', encoding='utf-8') as f:
        json.dump(sorted_recipes_data, f, indent=4, ensure_ascii=False)

    # Save asset/info.json
    info_data = {
        "recipes": recipe_summaries,
        "allTags": sorted(list(all_tags)),
        "totalRecipes": len(recipe_summaries),
        "lastUpdated": None
    }
    with open(info_path, 'w', encoding='utf-8') as f:
        json.dump(info_data, f, indent=4, ensure_ascii=False)

    print(f"Successfully updated {info_path} with {len(recipe_summaries)} recipes.")


if __name__ == "__main__":
    update_recipe_list()
