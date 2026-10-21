import os
import json
import re

def update_recipe_list():
    """
    Dynamically updates asset/recipes.json and asset/info.json by recursively
    scanning the recipes directory for JSON files.
    Also synchronizes the application version across files.
    """
    script_dir = os.path.dirname(os.path.abspath(__file__))
    recipes_dir = os.path.join(script_dir, 'recipes')
    recipes_output_path = os.path.join(script_dir, 'asset', 'recipes.json')
    info_path = os.path.join(script_dir, 'asset', 'info.json')

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

    # --- 2. Recipe Update Logic ---
    recipe_summaries = []
    all_recipes_data = {}
    all_tags = set()

    for root, _, files in os.walk(recipes_dir):
        for file in files:
            if file.endswith('.json') and not file.startswith('.'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, recipes_dir).replace('\\', '/')
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        recipe_data = json.load(f)
                    
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
