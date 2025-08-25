import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verify } from 'google-id-token-verifier'

const app = new Hono()
app.use('*', cors())

// カテゴリマッピング
const CATEGORY_MAP: Record<string, string> = {
  '雑記': 'misc',
  '食事': 'meals',
  'フィットネス': 'fitness',
}

// 日時ベースのファイル名生成 (YYYYMMDD-HHmm.md)
// 日付文字列の"見た目"をそのまま使ってファイル名を作る（TZ非依存）
function generateFilename(dateString: string) {
  const iso = (dateString || '').trim();
  // 例: 2025-08-19T13:30[:ss][+09:00|Z]
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:Z|[+-]\d{2}:\d{2})?$/
  );
  if (m) {
    const [, yyyy, MM, dd, HH, mm, ss] = m;
    return `${yyyy}${MM}${dd}-${HH}${mm}.md`;
  }

  // フォールバック（非ISOな文字列が来た場合）
  const d = new Date(dateString);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const H = pad(d.getHours());
  const Mi = pad(d.getMinutes());
  const S = pad(d.getSeconds());
  return `${y}${M}${D}-${H}${Mi}.md`;
}

app.post('/api/post', async (c) => {
  // 認証
  const auth = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!auth) return c.json({ error: 'Missing token' }, 401)

  try {
    await verify({ idToken: auth, clientId: c.env.GOOGLE_CLIENT_ID })
  } catch {
    return c.json({ error: 'Invalid token' }, 403)
  }

  // リクエスト取得
  const body = await c.req.json()
  const { title, date, tags, categories, latitude, longitude, content } = body

  if (!title || !date || !content || !categories?.length) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  // カテゴリ変換（マッピングされていなければ "misc"）
  const category = categories[0]
  const categorySlug = CATEGORY_MAP[category] || 'misc'

  // ファイルパス生成
  const filename = `content/posts/${categorySlug}/${generateFilename(date)}`

  // front matterはcontentに既に含まれている想定（フロント側生成）
  const fileContent = content.trim()

  // lifelog-blogのリポジトリ設定
  const GITHUB_REPO = c.env.GITHUB_REPO
  const BRANCH = c.env.BRANCH

  // GitHub APIエンドポイント
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filename}`

  // 既存ファイル確認
  const checkRes = await fetch(url, {
    headers: {
      Authorization: `Bearer ${c.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lifelog-uploader'
    }
  })

  // アップロード（新規 or 更新）
  const putRes = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${c.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github+json',
      'User-Agent': 'lifelog-uploader'
    },
    body: JSON.stringify({
      message: `Add post ${title}`,
      content: btoa(unescape(encodeURIComponent(fileContent))),
      branch: BRANCH,
      ...(checkRes.ok ? { sha: (await checkRes.json()).sha } : {})
    })
  })

  if (!putRes.ok) {
    const detail = await putRes.text()
    return c.json({ error: 'Failed to upload', detail }, 500)
  }

  const resJson = await putRes.json()

  return c.json({
    success: true,
    url: resJson.content?.html_url || ''
  })
})

export default app
