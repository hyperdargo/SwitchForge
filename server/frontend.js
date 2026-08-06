import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')
const port = Number(process.env.FRONTEND_PORT || 6009)
const backendUrl = process.env.BACKEND_URL || 'http://backend:6010'
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
}

async function proxy(req, res) {
  try {
    const headers = { ...req.headers }
    delete headers.host
    const response = await fetch(`${backendUrl}${req.url}`, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
      duplex: 'half',
    })
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Backend is unavailable.' } }))
  }
}

function serve(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  const requested = path.resolve(root, `.${pathname}`)
  const safePath = requested.startsWith(root) ? requested : path.join(root, 'index.html')
  const filePath = fs.existsSync(safePath) && fs.statSync(safePath).isFile() ? safePath : path.join(root, 'index.html')
  res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/v1/')) proxy(req, res)
  else serve(req, res)
}).listen(port, '0.0.0.0', () => console.log(`SwitchForge frontend listening on http://localhost:${port}`))
