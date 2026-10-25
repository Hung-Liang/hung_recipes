# Hung 的食譜 🍽️

一個個人化且現代化的食譜管理網站，讓您輕鬆瀏覽、搜尋及管理美味食譜，並支援行動裝置離線瀏覽。

## ✨ 功能特色

### 🏠 瀏覽與搜尋
- **美觀介面**：基於 Tailwind CSS 的響應式設計，完美適配手機與桌面端。
- **Hung 的特色標題**：專屬個人風格的食譜空間。
- **智慧搜尋**：支援名稱、描述及標籤的全文檢索。

### 🏷️ 標籤與分類系統
- **多維度分類**：涵蓋菜系、核心食材、料理類型、工具（氣炸鍋、電鍋等）。
- **標準化標籤**：經過語意整合的精簡標籤系統（例如：整合「簡單/快速」為「懶人料理」）。
- **AND 邏輯篩選**：多標籤聯動篩選，精確定位想找的料理。

### 📖 食譜詳細功能
- **動態份數縮放**：自動計算不同份數下的材料比例。
- **材料反向縮放**：修改單一材料用量，系統會自動按比例推算其他材料。
- **清晰引導**：包含詳細步驟、材料清單及烹飪筆記。

### 📱 行動裝置支援 (PWA)
- **支援 PWA**：可將網站安裝至手機主畫面，像 App 一樣啟動。
- **離線瀏覽**：透過 Service Worker 快取，即使在網路不穩或無網路環境下也能查閱食譜。

## 🚀 開發與管理

### 新增食譜流程
本專案支援自動化整理流程：
1. 將 JSON 格式的食譜放入 `recipes/unsort/` 目錄。
2. 檔案命名不拘，只需確保 JSON 結構符合規範。
3. 執行整理指令（或由 AI 代理人執行），系統將自動：
   - 識別食譜名稱並重新命名為 `snake_case.json`。
   - 根據食材與類型自動分類至 `meat/`, `poultry/`, `staples/` 等目錄。
   - 標準化標籤（Normalization），確保分類一致性。
   - 執行 `update_recipes.py` 更新全站索引。

### 食材格式
```json
{ "name": "黑胡椒", "quantity": 2, "unit": "g", "note": "醬汁用" }
{ "name": "植物油", "quantity": 500, "unit": "ml", "note": "炸用", "calorieRatio": 0.1 }
```
- `name`：標準食材名稱，必須存在於 `asset/nutrition.json`（kcal / 100g 或 100ml，`null` 表示尚無資料）。
- `note`（選填）：用途、切法或替代品等備註，顯示在食材名稱旁，不影響熱量計算。
- `calorieRatio`（選填，0–1）：實際攝取比例，例如炸油只計入吸收的部分。
- 舊名稱或變體寫法請參考 `asset/ingredient_aliases.json`；`update_recipes.py` 遇到時會提示對應的標準名稱。
- 修改 HTML/JS 中的 Tailwind class 後，執行 `npm run build:css` 重新產生 `css/tailwind.css`（CI 也會自動建置）。

## 🛠️ 技術架構
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Data**: JSON 檔案儲存，純靜態實現
- **Automation**: Python 腳本更新索引 (`update_recipes.py`)
- **PWA**: Service Worker (`sw.js`) + Manifest (`manifest.json`)

## 🤝 貢獻
收錄各式精選食譜並持續增加中。歡迎透過 Pull Request 貢獻您的私藏食譜！

## ✨ 作者
This project was developed by [Hung Liang](https://github.com/Hung-Liang)

## ☕ 贊助
<a href="https://www.buymeacoffee.com/hungliang" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
