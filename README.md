# 記帳

一冊只留在自己裝置上的帳本。介面是繁體中文，金額以歐元計，日期以歐洲巴黎時區為準。沒有帳號、沒有伺服器，第一次開啟後即可離線使用。

## 本地預覽

```bash
npm install
npm run dev
```

開發伺服器預設在 [http://127.0.0.1:47321](http://127.0.0.1:47321)。

```bash
npm test
npm run build
npm run preview
```

`npm run build` 會把靜態網站輸出到 `dist/`，包含可離線的 service worker。

## 部署到 GitHub Pages

路徑全部是相對的，所以網站可以放在 `https://<user>.github.io/<repo>/` 這種子路徑，不必改設定。

1. 把這個專案推上 GitHub。
2. 到倉庫的 Settings → Pages → Build and deployment，Source 選 **GitHub Actions**。
3. 推送到 `main` 時，`.github/workflows/pages.yml` 會建置 `dist/` 並發布。

也可以在本機建置後，把 `dist/` 的內容放到 GitHub Pages 所使用的分支。請一併帶上 `dist/.nojekyll`，避免 Jekyll 略過檔案。

在 iPhone 上用 Safari 開啟網站，點分享，再點「加入主畫面」。Android 則用 Chrome 的「加到主畫面」。第一次開啟需要網路，之後可離線記帳。

## 資料

紀錄存在這台裝置的 IndexedDB（若瀏覽器擋住，則退回 localStorage）。設定頁的「備份到 iCloud／檔案」會用系統分享把 JSON 存進 iCloud 雲碟或檔案；沒有分享功能時改為下載。換手機後用「從備份還原」，可選擇合併或取代。超過 7 天沒備份，首頁會出現提醒。也可以另外匯出 CSV。iPhone 的 Safari 若久未開啟網站，可能清掉網站資料。

部署後的網址會是 `https://maxtheg221.github.io/jizhang/`。相對路徑與 service worker 的範圍都從這個子路徑算起。

字型是自行托管的 Cormorant Garamond 與 Inter，授權為 SIL Open Font License，檔案在 `src/fonts/`。
