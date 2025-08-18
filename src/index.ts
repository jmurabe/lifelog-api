import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verify } from 'google-id-token-verifier'

const app = new Hono()
app.use('*', cors())

// 日時ベースのファイル名生成
function generateFilename(dateString: string) {
  const dt = new Date(dateString)
  const yyyy = dt.getFullYear()
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const dd = String(dt.getDate()).padStart(2, '0')
  const hh = String(dt.getHours()).padStart(2, '0')
  const mi = String(dt.getMinutes()).padStart(2, '0')
  return `${yyyy}${mm}${dd}-${hh}${mi}.md`
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

  if (!title || !date || !content) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  // ファイル名生成
  const filename = `content/posts/${generateFilename(date)}`

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
