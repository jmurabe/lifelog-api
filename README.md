# LifeLog API

このリポジトリは **LifeLog 投稿フォーム** からのリクエストを受け取り、Hugo (PaperMod) ベースのブログリポジトリ (`lifelog-blog`) の `main`ブランチへ直接投稿記事を追加する **Cloudflare Workers API** です。

-   フロントエンド: `lifelog-blog/static/post-form/index.html`
-   バックエンド: 本リポジトリ (`lifelog-api`)
-   デプロイ環境: [Cloudflare Workers](https://developers.cloudflare.com/workers/)

------------------------------------------------------------------------

## 構成

-   **Hono**: ルーティングフレームワーク
-   **Google Identity Services**: 投稿認証（Googleアカウントログイン必須）
-   **GitHub REST API**: 投稿データを Hugo のリポジトリにコミット
-   **Cloudflare Workers**: デプロイ先環境

------------------------------------------------------------------------

## セットアップ

### 1. リポジトリの準備

``` sh
git clone https://github.com/jmurabe/lifelog-api.git
cd lifelog-api
```



#### wrangler作業用のDocker環境

Dockerfile

``` dockerfile
FROM node:24

WORKDIR /app

RUN npm install -g wrangler

# Port for the local dev server to listen on. Defaults to 8787
EXPOSE 8787

```
.env

```ini
CLOUDFLARE_API_TOKEN=<MY_WORKERS_EDIT_API_KEY>
```

docker build の例

``` sh
docker build -t murave/lifelog .
```

docker run の例

``` sh
docker run -it --rm --env-file .env -p 8787:8787 -v $PWD:/app murave/lifelog /bin/bash
```

runした後、作業用に exec bash

``` sh
docker exec -it $(docker ps -q) bash
```

------------------------------------------------------------------------

### 2. 環境変数の設定

Cloudflare Workers は `wrangler.toml` または `.dev.vars`で環境変数を管理します。
開発時は `.dev.vars` を利用してください。

`wrangler.toml` から抜粋

``` ini
	"vars": {
		"GITHUB_REPO": "jmurabe/lifelog-blog",
		"BRANCH": "main"
	}
```


`.dev.vars`

``` ini
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com
```

> 本番環境でファイルに書きたくないvarsを扱う場合以下で環境変数を登録してください。
>
> wrangler secret put GITHUB_TOKEN
> wrangler secret put GOOGLE_CLIENT_ID

#### 必要な GitHub Token のスコープ

-   `repo` → Contents API を使ってファイルをコミットするため必須

------------------------------------------------------------------------

### 3. ローカル開発サーバー

``` sh
# 前述のDocker環境ではポート公開を調整してある(wrangler dev --ip=0.0.0.0)
npm run dev
# で起動。その他環境で調整が必要なければ以下でも良い
wrangler dev
```

→ http://localhost:8787/api/post が利用可能になります。

------------------------------------------------------------------------

### 4. デプロイ

``` sh
wrangler deploy
```

デプロイ完了後、Cloudflare Workers のエンドポイントが払い出されます。

フロントエンドの投稿フォーム側の設定ファイル
(`lifelog-blog/static/post-form/config.js`) の `API_ENDPOINT`を、このエンドポイントに書き換えてください。

------------------------------------------------------------------------

## API 仕様

### POST `/api/post`

#### リクエストヘッダ

-   `Authorization: Bearer <Google ID Token>`
-   `Content-Type: application/json`

#### リクエストボディ

``` json
{
  "title": "記事タイトル",
  "date": "2025-08-18T10:00:00+09:00",
  "tags": ["旅行","写真"],
  "categories": ["旅行"],
  "latitude": 35.681236,
  "longitude": 139.767125,
  "content": "+++ TOML front matter +++\n本文Markdown..."
}
```

#### レスポンス

``` json
{
  "success": true,
  "url": "https://github.com/jmurabe/lifelog-blog/blob/main/content/posts/20250818-1000.md"
}
```

------------------------------------------------------------------------

## 運用フロー

1.  投稿フォームから記事送信\
2.  Cloudflare Workers (本API) が Google Token を検証\
3.  Hugo リポジトリ (`lifelog-blog`) に Markdown ファイルをコミット\
4.  GitHub Pages / Cloudflare Pages が自動ビルドして公開

------------------------------------------------------------------------

## 注意事項

-   **直接 main に push**するため、編集競合が起きると失敗する場合があります。
-   投稿後の修正は基本想定していません。必要な場合は `lifelog-blog`側で手動修正してください。
-   GitHub API には `User-Agent` ヘッダが必須です。Hono実装で自動追加しています。
