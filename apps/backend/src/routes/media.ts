import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';

type Bindings = {
  irori_db: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

// 認証ミドルウェア適用
app.use('*', authMiddleware());

app.post('/preview', async (c) => {
  const { url } = await c.req.json<{ url: string }>();

  if (!url) {
    return c.json({ error: 'URL is required' }, 400);
  }

  // Google Drive のファイルID抽出用の正規表現
  const driveFileDRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
  const driveIdQueryRegex = /[?&]id=([a-zA-Z0-9_-]+)/;

  let fileId = '';
  const matchD = url.match(driveFileDRegex);
  if (matchD) {
    fileId = matchD[1];
  } else {
    const matchQuery = url.match(driveIdQueryRegex);
    if (matchQuery) {
      fileId = matchQuery[1];
    }
  }

  if (fileId) {
    return c.json({
      previewUrl: `https://drive.google.com/thumbnail?id=${fileId}&w=800&sz=w800`,
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      title: 'Google Drive File',
    });
  }

  // Google Photos やその他の URL の簡易フォールバック
  let mimeType = 'text/html';
  if (url.match(/\.(jpeg|jpg|gif|png|webp|svg)/i)) {
    mimeType = 'image/jpeg';
  }

  return c.json({
    previewUrl: url,
    width: 600,
    height: 400,
    mimeType,
    title: 'Shared Media Link',
  });
});

export default app;
