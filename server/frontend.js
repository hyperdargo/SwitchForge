import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
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

function proxy(req, res) {
  const target = new URL(req.url, backendUrl)
  const upstream = http.request({ hostname: target.hostname, port: target.port || 80, path: `${target.pathname}${target.search}`, method: req.method, headers: { ...req.headers, host: target.host } }, response => {
    res.writeHead(response.statusCode || 502, response.headers)
    response.pipe(res)
    response.on('error', () => { if (!res.writableEnded) res.end() })
  })
  upstream.on('error', () => {
    if (res.headersSent) { if (!res.writableEnded) res.end(); return }
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'Backend is unavailable.' } }))
  })
  req.on('aborted', () => upstream.destroy())
  res.on('close', () => { if (!upstream.destroyed) upstream.destroy() })
  req.pipe(upstream)
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
