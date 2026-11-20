# 博客來書圖與內容簡介擷取器

以部分書名搜尋博客來圖書，再輸入選定的商品網址，下載書圖並儲存內容簡介。使用 TypeScript、Playwright 與 Chromium，提供命令列操作及內附執行環境的可攜包。

## Electron 桌面預覽版

新增本機 UI：搜尋部分書名、選擇版本、直接輸入商品網址、選擇儲存資料夾、下載書圖與內容簡介、取消工作，以及開啟下載資料夾。顯示網站驗證視窗預設開啟；遇到驗證時，請在另外開啟的 Chromium 視窗完成操作。

目前 Linux x86_64 桌面預覽版已在本機完成實際搜尋、下載兩張圖片及簡介，並在離線 Ubuntu 22.04 容器以測試資料驗證 UI 與內附執行環境。Windows 打包與 CI 已準備，尚未實測。搜尋只讀第一頁，最多 20 筆。

```bash
# 已封裝的本機預覽版；執行時保留整個資料夾。
./dist/books-desktop-linux-x64-2026-11-12-preview/books-desktop

# 開發執行（需要先安裝依賴與 Playwright Chromium）
node node_modules/electron/install.js
npm run desktop
```

也可以使用 Bun 執行相同的 npm scripts：

```bash
bun install
bunx playwright install chromium
bun run desktop
```

若只想直接開啟一個可見的 Chromium 執行擷取：

```bash
bun run scrape -- --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030"
```

Playwright 會自行啟動 Chromium，擷取完成後關閉視窗。若要使用系統 Chrome／Chromium，可指定執行檔：

```bash
SCRAPER_BROWSER_PATH=/usr/bin/chromium bun run scrape -- --headed \
  --timeout 120000 --url "https://www.books.com.tw/products/0011063030"
```

UI 預設儲存到使用者「下載」目錄下的 `Books/`。每次下載會建立獨立 `book-<隨機字串>/<商品編號>/`，保留先前下載；取消時保留已寫入的檔案。設定目前只在本次開啟期間有效。搜尋候選在畫面中顯示，CLI 的 `search` 另提供 JSON 保存。

Electron UI 使用隔離的 preload／IPC，爬蟲在背景 Node 子程序執行；與 CLI 共用搜尋和擷取函式。套件包含 Electron、Node、Playwright 與獨立 Chromium。Linux 額外附帶非 glibc 函式庫（含 GTK）、字型與授權文件，需要 glibc 2.35 以上及可用的桌面環境。UI 可以離線啟動，搜尋及下載博客來仍需網路。預覽版尚無自動更新或簽章。

從相同平台已驗證的 CLI 可攜包建立桌面包：

```bash
npm run package:desktop -- --runtime dist/books-scraper-linux-x64-2026-11-12-search
```

Linux 正式打包應在 Ubuntu 22.04 執行；本機可用容器保持函式庫基準：

```bash
npm run build:desktop
docker run --rm \
  -v "$PWD:/work:ro" -v "$PWD/dist:/work/dist:rw" \
  ubuntu:22.04 sh /work/scripts/package-desktop-linux-container.sh \
  dist/books-scraper-linux-x64-2026-11-12-search
```

桌面版由 GitHub Actions 建置。Codeberg 的 `trunk` 同步到 GitHub 預設分支後，在 **Actions → Desktop preview packages → Run workflow** 選擇 `trunk` 執行。工作流程會在 Windows 和 Ubuntu 分別打包並執行桌面 UI 測試。

建置成功後，在該次執行頁面的 **Artifacts** 下載 `books-desktop-Windows-x64`，解壓後可選擇 `BookContentStudio-Setup-x64.exe` 使用安裝精靈，或解壓便攜版 ZIP 後執行 `books-desktop.cmd`。Linux 套件在 `books-desktop-Linux-x64`。詳見[桌面版建置流程](.github/workflows/desktop.yml)。

```bash
npm run test:desktop
# 指定封裝後的目錄進行同一套 UI 測試
BOOKS_TEST_PACKAGE=dist/books-desktop-linux-x64-2026-11-12-preview node tests/desktop.mjs
```

UI 測試開啟真實 Electron、背景程序與 Chromium，以測試資料驗證搜尋／下載、取消／重試、錯誤狀態、重複下載保留舊檔及視窗隔離。測試中的資料夾選擇器／開啟資料夾 API 使用替身；實際網站驗證另執行。證據位於 `artifacts/electron-20261112/`。

## 目前功能

| 功能 | 說明 |
| --- | --- |
| 書名搜尋 | 輸入部分書名／關鍵字，列出候選書名、作者／譯者與商品網址，保存 JSON |
| 書圖下載 | 預設擷取 `#thumbnail` 內的圖片，例如封面與封底 |
| 內容簡介 | 自動定位「內容簡介」，另存 UTF-8 純文字，保留換行與收合內容 |
| HTML 保存 | 儲存書圖容器的 `outerHTML` 與 `innerHTML` |
| 下載紀錄 | 記錄標題、網址、擷取時間、圖片來源、本地路徑與失敗原因 |
| 自訂範圍 | 可分別指定書圖與簡介的 CSS selector |
| 頁面檢查 | `inspect` 列出 selector 候選並保存截圖 |
| 網站驗證 | `--headed` 顯示瀏覽器，遇到 Cloudflare 驗證時等待使用者完成 |
| 可攜執行 | 內附 Node、Playwright、Chromium；Linux 額外附上共享函式庫、NSS 模組與中文字型 |
| 離線自測 | 檢查瀏覽器啟動、圖片網址、簡介換行、渲染及本機 HTTPS／NSS |

搜尋與下載分為兩個指令；選定候選書的商品網址後再下載。目前尚未提供批次擷取或圖形操作介面。

## 透過部分書名搜尋

```bash
./books-scraper search --query "原子習" --limit 5 --headed --timeout 120000
# 從候選結果選擇商品網址，再下載：
./books-scraper scrape --url "https://www.books.com.tw/products/0010822522" --headed --timeout 120000
```

原始碼執行方式為 `npm run search -- --query "原子習" --limit 5 --headed --timeout 120000`。

搜尋使用博客來的圖書分類與關鍵字比對，可以只輸入部分書名；不保證自動修正錯字，也可能包含作者、簡介相關的結果。維持網站排序，只讀第一頁，預設最多顯示 20 筆，`--limit` 可設為 1～100。作者欄包含網站列出的作者及譯者。搜尋不會自動下載第一筆或翻頁。

結果顯示於終端機，另存至 `output/search-<時間>.json`（可用 `--out` 更換目錄），其中含查詢字串、搜尋網址、時間及候選清單。確認為查無資料頁時輸出空陣列；網站驗證、一般 HTTP 錯誤或無法辨識的版型會回報錯誤。

## 快速開始：Linux 可攜版

目前已實測的建置產物：

- [Linux x86_64 tar.gz（含書名搜尋）](dist/books-scraper-linux-x64-2026-11-12-search.tar.gz)
- [SHA256 校驗檔](dist/books-scraper-linux-x64-2026-11-12-search.tar.gz.sha256)

以上檔案位於本機工作目錄，尚未發布至外部下載服務。進入壓縮包所在目錄後執行：

```bash
tar -xzf books-scraper-linux-x64-2026-11-12-search.tar.gz
cd books-scraper-linux-x64-2026-11-12-search

./books-scraper scrape --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030"
```

保留解壓後的整個資料夾。可攜版不需要另外安裝 Node、Bun 或瀏覽器，也不會在啟動時下載瀏覽器。

建議使用 `--headed`：若網站顯示 Cloudflare 驗證提示，請在瀏覽器視窗中完成操作。程式會等到商品頁成功載入後繼續；`--timeout 120000` 將導覽及驗證等待的逾時設定為 120 秒。

確認內附環境能否正常執行：

```bash
./books-scraper --self-test
```

自測不連線博客來，但會啟動本機 HTTPS 伺服器。只有自測情境接受附帶的測試憑證；正式擷取仍驗證網站憑證。

## 平台與驗證狀態

| 環境 | 目前狀態 |
| --- | --- |
| Arch Linux x86_64 桌面 | 可攜包實際成功下載 2 張書圖與完整簡介 |
| Ubuntu 22.04 x86_64 | 乾淨容器通過離線自測，包含 HTTPS／NSS |
| Ubuntu 24.04 x86_64 | NSS 修正版通過離線自測；最新版本沿用相同原生執行環境 |
| Windows 10／11 x64 | 已實作啟動器與 Windows 建置 CI，尚未執行 Windows 驗證 |

Linux 發行包以 Ubuntu 22.04 為基準，需要 **glibc 2.35 以上**、系統核心及基本 `/bin/sh`；`--headed` 需要桌面顯示環境。未支援 Alpine／musl、ARM 或 macOS。

Windows 包的預期操作方式如下；目前尚未產出經驗證的 Windows ZIP：

```powershell
.\books-scraper.cmd scrape --headed --timeout 120000 --url "https://www.books.com.tw/products/0011063030"
.\books-scraper.cmd --self-test
```

## 輸出內容

預設輸出到**執行指令時所在目錄**的 `output/<商品編號>/`：

```text
output/
└── 0011063030/
    ├── content.txt       # 內容簡介純文字
    ├── fragment.html     # 書圖容器 outerHTML
    ├── inner.html        # 書圖容器 innerHTML
    ├── metadata.json     # 商品資訊與圖片下載結果
    ├── images/
    │   ├── 001.webp
    │   └── 002.webp
    └── inspection/       # 執行 inspect 才會產生
        ├── candidates.json
        └── page.png
```

圖片副檔名依伺服器回傳的 `Content-Type` 決定，支援 JPG、PNG、WebP、GIF、AVIF、SVG 與 BMP，不另行轉檔。下載的是頁面圖片來源提供的版本，**不保證為出版原圖或最高解析度**；目前實測的兩張書圖為 348 × 348 WebP。

`metadata.json` 包含商品標題、請求與最終網址、selector、擷取時間、圖片下載數量，以及各張圖片的來源網址、本地路徑或失敗原因。部分圖片下載失敗時，請以此檔案確認結果。

HTML 保留網站原有網址，未改寫成本地圖片路徑，也不附帶網站 CSS／JavaScript，因此不是完整離線網頁。`content.txt` 儲存的是內容簡介，而非書圖容器文字。

同一本書重複輸出到相同位置時，既有同名檔案可能被覆寫。需要保留不同次結果時，請指定新的 `--out` 目錄。

## 指令與參數

新版可攜版支援 `search`、`scrape`、`inspect` 與 `--self-test`；省略子指令時預設執行 `scrape`。11/9 的舊版可攜包不含搜尋功能。

| 參數 | 用途 | 預設值／範圍 |
| --- | --- | --- |
| `--url` | 博客來單一商品 HTTPS 網址，供 scrape／inspect 使用 | 必填；`https://www.books.com.tw/products/<編號>` |
| `--query` | 部分書名／關鍵字，供 search 使用 | 必填；不得空白 |
| `--limit` | search 第一頁最多顯示筆數 | `20`；`1`～`100` |
| `--headed` | 顯示瀏覽器，等待人工完成網站驗證 | 預設無視窗 |
| `--timeout` | 導覽及驗證等待逾時，毫秒 | `30000`；`1000`～`120000` |
| `--out` | 輸出根目錄 | `output` |
| `--selector` | 書圖容器，供 scrape 使用 | `#thumbnail` |
| `--content-selector` | 簡介容器，供 scrape 使用 | 自動定位「內容簡介」 |
| `--max-images` | 最多嘗試下載的圖片元素數，供 scrape 使用 | `60`；`0`～`500` |
| `--help` | 顯示說明 | — |

例如指定輸出目錄並最多下載兩張圖：

```bash
./books-scraper scrape --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030" \
  --out "./my-books" --max-images 2
```

## 網站版型不同時

先產生 selector 候選與頁面截圖：

```bash
./books-scraper inspect --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030"
```

候選清單不保證 selector 唯一，也可以從瀏覽器開發者工具取得實際 selector。再分別指定書圖與簡介範圍：

```bash
./books-scraper scrape --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030" \
  --selector "#thumbnail" \
  --content-selector "YOUR_CONFIRMED_INTRODUCTION_SELECTOR"
```

書圖 selector 符合多個元素時會提示並使用第一個。簡介 selector 必須恰好符合一個元素；找不到簡介或文字為空時會回報錯誤。

自動定位規則是找到唯一的「內容簡介」標題，向外尋找最近一層只有一個 `.content` 的容器。擷取時保留收合文字、將 `<br>` 轉成換行，並移除 script、style 等內容。此規則已在上述商品頁實際驗證。

## 常見問題與限制

- **Cloudflare 驗證：** 無視窗模式遇到驗證會提示改用 `--headed`。程式不會自動解驗證碼；驗證未完成或逾時仍會失敗。
- **其他 HTTP 403：** 表示請求遭拒，顯示視窗不保證能解決所有封鎖、地區限制或權限問題。
- **擷取範圍：** 搜尋後一次處理一本書、順序下載圖片；沒有登入流程、批次佇列或背景圖擷取。
- **延遲載入：** 會捲動可見圖片並檢查常見 lazy-loading 屬性，特殊網站腳本仍可能漏圖。
- **圖片限制：** 僅允許 HTTPS 的 `books.com.tw`、`book.com.tw` 及其子網域，並檢查圖片類型及每張 15 MiB 大小限制。網站更換 CDN 時可能需要調整允許清單。
- **使用範圍：** 使用前請確認網站條款、robots 規則與內容授權；程式中的路徑限制不是完整 robots.txt 解析器。

## 開發環境

需要 Node.js 20 以上，建議 Node 22。以下使用 Bun 與既有鎖檔安裝依賴：

```bash
bun install --frozen-lockfile
bunx playwright install --no-shell chromium
```

專案只使用 Chromium，不需要下載 Firefox 或 WebKit。Playwright 的瀏覽器下載仍可能依賴開發主機的系統函式庫；可攜包則已將額外依賴一起封裝。

Arch 開發時可以使用系統 Chromium：

```bash
sudo pacman -S chromium
export SCRAPER_BROWSER_PATH=/usr/bin/chromium
```

不要在 Arch 照 Ubuntu 提示執行 `apt-get` 或 `playwright install-deps`。`SCRAPER_BROWSER_PATH` 僅供原始碼執行使用；可攜啟動器固定使用包內瀏覽器。

從原始碼執行：

```bash
npm run scrape -- --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030"

npm run inspect -- --headed --timeout 120000 \
  --url "https://www.books.com.tw/products/0011063030"
```

## 建置可攜包

在對應平台安裝官方 Node 22、專案依賴與 Playwright Chromium 後執行：

```bash
npm run build:portable
```

產生 `dist/books-scraper-<platform>-x64-<timestamp>/` 目錄，包含執行環境、瀏覽器、編譯後程式、授權文件與 `build-info.json`。此指令建立資料夾；壓縮包由 CI 或額外壓縮步驟產生。

Linux 會收集 Node、Chromium 與 NSS 動態模組所需的非 glibc 函式庫及中文字型。正式 Linux 包應在 Ubuntu 22.04 建置，以維持 glibc 2.35 基準；直接在較新的 Arch 建置可能提高最低版本需求。

Arch 開發機可用一次性 Ubuntu 容器建置。Docker 只用於建置，使用者執行可攜版不需要 Docker：

```bash
mkdir -p dist
# 先安裝 Playwright Chromium；快取位置若有自訂，調整掛載路徑。
docker run --rm \
  -v "$PWD:/work:ro" \
  -v "$PWD/dist:/work/dist:rw" \
  -v "$HOME/.cache/ms-playwright:/browser-cache:ro" \
  ubuntu:22.04 sh /work/scripts/build-linux-container.sh
```

[GitHub Actions 工作流程](.github/workflows/portable.yml) 已設定 Windows 與 Ubuntu 22.04 原生建置、Windows 搬移路徑自測、Ubuntu 22.04／24.04 乾淨容器自測及 ZIP／tar.gz 產出。可手動觸發或透過 `v*` tag 觸發；Windows 工作流程尚未在本次開發中執行。

## 檢查與測試

```bash
npm run typecheck

# 以下為 Arch／Linux 使用系統 Chromium 的範例。
SCRAPER_BROWSER_PATH=/usr/bin/chromium node --import tsx tests/book-extraction.ts
SCRAPER_BROWSER_PATH=/usr/bin/chromium node --import tsx tests/site-verification.ts
SCRAPER_BROWSER_PATH=/usr/bin/chromium node --import tsx tests/book-search.ts
```

擷取測試涵蓋兩張圖片保存、簡介換行、收合文字與錯誤處理；圖片下載回應使用測試資料。驗證流程測試涵蓋 Cloudflare 辨識、一般 403、商品主框架載入、驗證 iframe 不被誤判，以及等待逾時。

2026-11-09 已用可攜包實際擷取《你的名字。【電影上映十週年紀念版】》，成功保存兩張書圖與完整簡介。此次使用 `--headed`，不需要人工介入；後續請求仍可能出現驗證。

- [實際擷取與驗證紀錄](artifacts/cloudflare-debug-20261109T140629Z.md)
- [成功執行日誌](artifacts/portable-headed-live-20261109T140629Z.log)

## 專案結構

```text
src/
  cli.ts                       # 擷取流程與檔案輸出
  inspect.ts                   # selector 候選與截圖
  search-cli.ts                # 搜尋指令與 JSON 輸出
  search.ts                    # 搜尋網址、圖書候選擷取
  options.ts                   # CLI 參數與網址驗證
  browser.ts                   # 瀏覽器、導覽與網站驗證
  extract.ts                   # 書圖來源與簡介文字擷取
  download.ts                  # 圖片下載與結果紀錄
scripts/
  build-portable.mjs           # 原生平台可攜包建置
  build-linux-container.sh     # Ubuntu 容器建置
  portable/                    # 啟動器與本機 HTTPS 自測資料
tests/                         # 擷取與網站驗證回歸測試
.github/workflows/portable.yml # Windows／Linux 建置 CI
```
