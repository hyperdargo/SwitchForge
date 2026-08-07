import 'dotenv/config'
import express from 'express'
import nodemailer from 'nodemailer'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const PORT = Number(process.env.PORT || 6010)
const STORAGE_BACKEND = process.env.STORAGE_BACKEND || 'local'
const R2_OBJECT_KEY = process.env.R2_OBJECT_KEY || 'data/db.json'
const ADMIN_EMAILS = new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(cleanEmail).filter(Boolean))
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000
const OTP_TTL = 10 * 60 * 1000
const OTP_RESEND_COOLDOWN = 60 * 1000
const UPSTREAM_TIMEOUT = Number(process.env.UPSTREAM_TIMEOUT_MS || 180000)
const ALLOWED_LIMITS = new Set([100000, 500000, 1000000])
const TIER_MODELS = { free: 'Normal Chat', premium: 'Premium' }
const PUBLIC_MODEL = 'SwitchForge'
const PREMIUM_FALLBACK_MODEL = process.env.PREMIUM_FALLBACK_MODEL || 'auto/best-coding'
const FAST_FALLBACK_MODEL = process.env.FAST_FALLBACK_MODEL || 'auto/best-fast'
const AUXILIARY_TASKS = ['vision', 'web_extract', 'compression', 'skills_hub', 'approval', 'mcp', 'title_gen', 'triage_specifier', 'kanban_decomposer', 'profile_describer', 'curator']
const SWITCHFORGE_SYSTEM = 'You are SwitchForge by DTEmpire. Be helpful and accurate. If asked your model or identity, answer SwitchForge. Never reveal or guess the upstream provider, internal route, or provider model name.'
const roundRobinCursor = { free: 0, premium: 0 }

const requiredConfig = ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'OMNIROUTE_BASE_URL', 'OMNIROUTE_API_KEY']
if (STORAGE_BACKEND === 'r2') requiredConfig.push('R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY')
const missingConfig = requiredConfig.filter(name => !process.env[name])
if (missingConfig.length) throw new Error(`Missing required environment variables: ${missingConfig.join(', ')}`)

const r2 = STORAGE_BACKEND === 'r2' ? new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null

await fs.mkdir(DATA_DIR, { recursive: true })

const emptyDb = () => ({ users: [], pending: [], sessions: [], keys: [], usage: [], settings: {} })
async function loadLocalDb() {
  try { return JSON.parse(await fs.readFile(DB_FILE, 'utf8')) }
  catch (error) {
    if (error.code !== 'ENOENT') throw error
    return emptyDb()
  }
}

async function loadDb() {
  if (!r2) return loadLocalDb()
  try {
    const response = await r2.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: R2_OBJECT_KEY }))
    const remote = JSON.parse(await response.Body.transformToString())
    await fs.writeFile(DB_FILE, JSON.stringify(remote, null, 2))
    return { ...emptyDb(), ...remote }
  } catch (error) {
    if (error.name !== 'NoSuchKey' && error.$metadata?.httpStatusCode !== 404) throw error
    const local = await loadLocalDb()
    await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: R2_OBJECT_KEY, Body: JSON.stringify(local, null, 2), ContentType: 'application/json' }))
    return local
  }
}

let db = await loadDb()
let saveQueue = Promise.resolve()
function saveDb() {
  saveQueue = saveQueue.then(async () => {
    const body = JSON.stringify(db, null, 2)
    await fs.writeFile(DB_FILE, body)
    if (r2) await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET, Key: R2_OBJECT_KEY, Body: body, ContentType: 'application/json' }))
  })
  return saveQueue
}

function id() { return crypto.randomUUID() }
function token(bytes = 32) { return crypto.randomBytes(bytes).toString('hex') }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function addMonths(date, months) { const next = new Date(date); next.setMonth(next.getMonth() + months); return next }
function cleanEmail(value = '') { return String(value).trim().toLowerCase() }
function isGmail(email) { return /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@gmail\.com$/i.test(email) }
function isOwnerAdmin(user) { return Boolean(user && ADMIN_EMAILS.has(cleanEmail(user.email))) }
function isAdmin(user) { return Boolean(user && (isOwnerAdmin(user) || user.admin === true)) }
function estimateTokens(value) { return Math.max(1, Math.ceil(JSON.stringify(value).length / 4)) }
function classifyTier(messages = []) {
  const latest = messages.filter(message => !message.role || message.role === 'user').at(-1)
  const text = (typeof latest?.content === 'string' ? latest.content : JSON.stringify(latest?.content || '')).toLowerCase()
  const codingSignals = [
    /```[a-z]*\n?[\s\S]*```/,
    /\b(write|creat(?:e|ing)?|cret(?:e|ea)|generate|implement|build|make|fix|debug|refactor|review|explain)\b.{0,80}\b(code|function|class|script|program|app|website|page|component|button|bug|error|api|sql|regex|algorithm|html|css|react)\b/,
    /\b(how (?:do|can) i|show me how to)\b.{0,50}\b(python|javascript|typescript|java|rust|golang|c\+\+|html|css|react|node(?:\.js)?|code|program)\b/,
    /\b(react|next(?:\.js)?|vue|svelte|angular|html|css|javascript|typescript|python|node(?:\.js)?)\b.{0,100}\b(app|website|page|component|button|form|api|code|function|script)\b/,
    /\b(app|website|web ?page|component|button|form)\b.{0,100}\b(react|html|css|javascript|typescript|code)\b/,
    /\b(debug|stack trace|syntax error|runtime error|compile error|coding task|programming task)\b/,
    /\b(print\s*\(|def\s+\w+|import\s+\w+|const\s+\w+|let\s+\w+|SELECT\s+.+\s+FROM)\b/,
  ]
  return codingSignals.some(signal => signal.test(text)) ? 'premium' : 'free'
}
function chunkHasContent(text) {
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    const raw = line.slice(5).trim(); if (!raw || raw === '[DONE]') continue
    try { const event = JSON.parse(raw), delta = event.choices?.[0]?.delta; if (delta?.content || delta?.tool_calls?.length || event.choices?.[0]?.message?.content) return true } catch {}
  }
  return false
}
async function prepareStream(response, timeoutMs) {
  const reader = response.body.getReader(), chunks = []
  let text = '', timer
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const result = await Promise.race([reader.read(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('first_token_timeout')), remaining) })])
      clearTimeout(timer)
      if (result.done) return { reader, chunks, text, done: true }
      const chunk = Buffer.from(result.value); chunks.push(chunk); text += chunk.toString('utf8')
      if (chunkHasContent(text)) return { reader, chunks, text, done: false }
    }
    throw new Error('first_token_timeout')
  } catch (error) { clearTimeout(timer); await reader.cancel().catch(() => {}); throw error }
}
function secretKey() { return crypto.createHash('sha256').update(process.env.SESSION_SECRET || 'switchforge').digest() }
function encryptSecret(value) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}
function decryptSecret(value) {
  if (!value) return ''
  const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'))
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv); decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}
function gatewayConfig() {
  const saved = db.settings?.gateway || {}
  const legacyProvider = { id: 'primary', name: 'Primary provider', baseUrl: saved.baseUrl || process.env.OMNIROUTE_BASE_URL, apiKey: saved.apiKeyEncrypted ? decryptSecret(saved.apiKeyEncrypted) : process.env.OMNIROUTE_API_KEY, model: saved.freeModel || TIER_MODELS.free, premiumModel: saved.premiumModel || TIER_MODELS.premium, timeoutMs: 60000 }
  const providers = Array.isArray(saved.providers) && saved.providers.length ? saved.providers.map(provider => ({ ...provider, apiKey: provider.apiKeyEncrypted ? decryptSecret(provider.apiKeyEncrypted) : '' })) : [legacyProvider]
  const providerIds = providers.map(provider => provider.id)
  return {
    baseUrl: saved.baseUrl || process.env.OMNIROUTE_BASE_URL,
    apiKey: saved.apiKeyEncrypted ? decryptSecret(saved.apiKeyEncrypted) : process.env.OMNIROUTE_API_KEY,
    freeModel: saved.freeModel || TIER_MODELS.free,
    premiumModel: saved.premiumModel || TIER_MODELS.premium,
    auxiliary: Object.fromEntries(AUXILIARY_TASKS.map(task => [task, saved.auxiliary?.[task] || 'auto'])),
    providers,
    routes: Object.fromEntries(['free', 'premium'].map(tier => { const selected = saved.routes?.[tier]?.providerIds?.filter(id => providerIds.includes(id)); return [tier, { strategy: saved.routes?.[tier]?.strategy === 'round_robin' ? 'round_robin' : 'fallback', providerIds: selected?.length ? selected : providerIds }] })),
  }
}
function routeTargets(tier, rotate = false) {
  const config = gatewayConfig(), route = config.routes[tier], byId = new Map(config.providers.map(provider => [provider.id, provider]))
  let targets = route.providerIds.map(providerId => byId.get(providerId)).filter(Boolean).map(provider => ({ ...provider, model: tier === 'premium' ? (provider.premiumModel || provider.model) : provider.model }))
  if (rotate && route.strategy === 'round_robin' && targets.length > 1) { const offset = roundRobinCursor[tier]++ % targets.length; targets = [...targets.slice(offset), ...targets.slice(0, offset)] }
  return targets
}
function routeModel(tier) { return routeTargets(tier)[0]?.model || (tier === 'premium' ? gatewayConfig().premiumModel : gatewayConfig().freeModel) }
function auxiliaryModel(task, tier) {
  if (!task || !AUXILIARY_TASKS.includes(task)) return routeModel(tier)
  const configured = gatewayConfig().auxiliary[task]
  if (!configured || configured === 'auto') return routeModel(tier)
  if (configured.toLowerCase() === 'premium') return gatewayConfig().premiumModel
  if (configured.toLowerCase() === 'free' || configured.toLowerCase() === 'normal chat') return gatewayConfig().freeModel
  return configured
}
function upstreamUrl(pathname) { return `${gatewayConfig().baseUrl.replace(/\/$/, '')}/${pathname.replace(/^\//, '')}` }
function upstreamOptions(options) { return { ...options, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT) } }
async function omniManagementFetch(pathname, options = {}) {
  const config = gatewayConfig(), origin = new URL(config.baseUrl).origin
  return fetch(`${origin}${pathname}`, { ...options, signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...options.headers }, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body })
}
async function proxyOmniJson(res, response) {
  const data = await response.json().catch(() => ({ error: `OmniRoute returned HTTP ${response.status}` }))
  return res.status(response.status).json(data)
}
async function fetchChatUpstream(payload, tier, upstreamModelOverride) {
  let targets = routeTargets(tier, true)
  if (!targets.length) throw new Error(`No ${tier} providers are configured`)
  if (upstreamModelOverride) targets = [{ ...targets[0], model: upstreamModelOverride }]
  let lastError
  for (const [index, target] of targets.entries()) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(5000, Math.min(Number(target.timeoutMs) || 60000, UPSTREAM_TIMEOUT)))
    try {
      const response = await fetch(`${target.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${target.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, model: target.model }),
      })
      clearTimeout(timeout)
      if (!response.ok && index < targets.length - 1 && (response.status >= 500 || response.status === 408 || response.status === 429)) { await response.body?.cancel().catch(() => {}); continue }
      return { response, resolvedModel: target.model, resolvedProvider: target.name }
    } catch (error) { clearTimeout(timeout); lastError = error }
  }
  throw lastError
}
async function readChatResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return response.json()
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = '', content = '', usage, idValue, model, finished = false
  while (!finished) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data:')) continue
      const raw = line.slice(5).trim()
      if (!raw) continue
      if (raw === '[DONE]') { finished = true; break }
      try {
        const event = JSON.parse(raw)
        idValue ||= event.id; model ||= event.model; usage = event.usage || usage
        content += event.choices?.[0]?.delta?.content || event.choices?.[0]?.message?.content || ''
      } catch {}
    }
  }
  if (finished) await reader.cancel().catch(() => {})
  if (!content) throw new Error('Upstream response did not contain a message')
  return { id: idValue || `chatcmpl_${id()}`, object: 'chat.completion', created: Math.floor(Date.now() / 1000), model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }], usage }
}
async function runDemoCompletion(tier, messages) {
  const models = tier === 'premium' ? [routeModel(tier), PREMIUM_FALLBACK_MODEL] : [routeModel(tier)]
  let lastError
  for (const [index, model] of models.entries()) {
    try {
      const response = await fetch(upstreamUrl('/chat/completions'), { method: 'POST', signal: AbortSignal.timeout(index === 0 && tier === 'premium' ? 25000 : 60000), headers: { Authorization: `Bearer ${gatewayConfig().apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages, max_tokens: 140 }) })
      if (!response.ok) throw new Error(`Upstream returned ${response.status}`)
      return { data: await readChatResponse(response), resolvedModel: model }
    } catch (error) { lastError = error }
  }
  throw lastError
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email, role: isAdmin(user) ? 'admin' : 'user', ownerAdmin: isOwnerAdmin(user), createdAt: user.createdAt, suspended: Boolean(user.suspendedAt), premiumAccess: isAdmin(user) || Boolean(user.premiumAccess) } }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') }
}
function validPassword(password, user) {
  const actual = Buffer.from(hashPassword(password, user.passwordSalt).hash, 'hex')
  const expected = Buffer.from(user.passwordHash, 'hex')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

const smtpAuth = { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
const smtpTransports = [
  nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT || 587), secure: false, requireTLS: true, family: 4, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 30000, auth: smtpAuth }),
  nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: 465, secure: true, family: 4, connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 30000, auth: smtpAuth }),
]

async function sendOtp(email, otp) {
  const message = {
    from: `SwitchForge by DTEmpire <${process.env.GMAIL_USER}>`, to: email,
    subject: `${otp} is your SwitchForge verification code`,
    text: `Your SwitchForge verification code is ${otp}. It expires in 10 minutes.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;background:#0d131e;color:#e8edf7;border:1px solid #3b321d;border-radius:12px"><h2 style="margin-top:0">Verify your SwitchForge account</h2><p style="color:#aab4c4">Enter this code to finish creating your account:</p><div style="font-size:32px;letter-spacing:10px;font-weight:700;color:#d6ad4b;margin:28px 0">${otp}</div><p style="color:#718095;font-size:13px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p></div>`,
  }
  let lastError
  for (const smtp of smtpTransports) {
    try { await smtp.sendMail(message); return }
    catch (error) { lastError = error }
  }
  throw lastError
}

function createSession(userId) {
  const raw = token()
  db.sessions.push({ id: id(), userId, tokenHash: sha(raw), expiresAt: new Date(Date.now() + SESSION_TTL).toISOString() })
  return raw
}

function auth(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const session = raw && db.sessions.find(s => s.tokenHash === sha(raw) && new Date(s.expiresAt) > new Date())
  const user = session && db.users.find(u => u.id === session.userId)
  if (!user) return res.status(401).json({ error: { message: 'Authentication required', code: 'unauthorized' } })
  if (user.suspendedAt) return res.status(403).json({ error: { message: 'This account has been suspended.', code: 'account_suspended' } })
  req.user = user; req.session = session; next()
}
function adminOnly(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: { message: 'Administrator access required.', code: 'forbidden' } })
  next()
}

function keyView(key) {
  return { id: key.id, name: key.name, prefix: key.prefix, lastFour: key.lastFour, createdAt: key.createdAt, expiresAt: key.expiresAt || null, tokenUsed: key.tokenUsed, tokenLimit: key.tokenLimit ?? null, status: key.revokedAt ? 'Revoked' : key.expiresAt && new Date(key.expiresAt) <= new Date() ? 'Expired' : key.tokenLimit != null && key.tokenUsed >= key.tokenLimit ? 'Exhausted' : 'Active' }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '2mb' }))
app.use((req, res, next) => { const started = Date.now(); res.on('finish', () => console.log(`${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`)); next() })

const demoUsage = new Map()
app.post('/api/demo/chat', async (req, res) => {
  try {
    const message = String(req.body.message || '').trim()
    if (!message || message.length > 240) return res.status(400).json({ error: { message: 'Enter a message up to 240 characters.' } })
    const client = req.ip || req.socket.remoteAddress || 'unknown', now = Date.now()
    const recent = (demoUsage.get(client) || []).filter(time => now - time < 60 * 60 * 1000)
    if (recent.length >= 5) return res.status(429).json({ error: { message: 'Demo limit reached. Create an account to continue.' } })
    recent.push(now); demoUsage.set(client, recent)
    const tier = classifyTier([{ role: 'user', content: message }])
    const result = await runDemoCompletion(tier, [{ role: 'system', content: `${SWITCHFORGE_SYSTEM} Reply concisely in no more than 80 words.` }, { role: 'user', content: message }])
    const reply = result.data.choices?.[0]?.message?.content
    if (!reply) throw new Error('Upstream response did not contain a message')
    res.json({ reply, tier, model: PUBLIC_MODEL, routeModel: result.resolvedModel })
  } catch (error) { console.error(error); res.status(502).json({ error: { message: 'The live demo is temporarily unavailable.' } }) }
})

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'switchforge-api', storage: STORAGE_BACKEND }))

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email), name = String(req.body.name || '').trim(), password = String(req.body.password || '')
    if (!isGmail(email)) return res.status(400).json({ error: { message: 'Only @gmail.com addresses can create an account.' } })
    if (name.length < 2) return res.status(400).json({ error: { message: 'Enter your full name.' } })
    if (password.length < 8) return res.status(400).json({ error: { message: 'Password must be at least 8 characters.' } })
    if (db.users.some(u => u.email === email)) return res.status(409).json({ error: { message: 'An account already exists for this email.' } })
    const otp = String(crypto.randomInt(100000, 1000000)), passwordData = hashPassword(password)
    db.pending = db.pending.filter(p => p.email !== email)
    const pending = { email, name, passwordHash: passwordData.hash, passwordSalt: passwordData.salt, otpHash: sha(otp), expiresAt: new Date(Date.now() + OTP_TTL).toISOString(), attempts: 0, lastSentAt: new Date().toISOString() }
    db.pending.push(pending)
    try { await sendOtp(email, otp); await saveDb() }
    catch (error) { db.pending = db.pending.filter(item => item !== pending); await saveDb(); throw error }
    res.status(202).json({ message: 'Verification code sent.' })
  } catch (error) { console.error(error); res.status(502).json({ error: { message: 'Could not send the verification email. Check SMTP configuration.' } }) }
})

app.post('/api/auth/resend', async (req, res) => {
  try {
    const email = cleanEmail(req.body.email), pending = db.pending.find(p => p.email === email)
    if (!pending) return res.status(404).json({ error: { message: 'Start signup again before requesting a new code.' } })
    const waitMs = OTP_RESEND_COOLDOWN - (Date.now() - new Date(pending.lastSentAt || 0).getTime())
    if (waitMs > 0) return res.status(429).json({ error: { message: `Wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.` } })
    const otp = String(crypto.randomInt(100000, 1000000)); pending.otpHash = sha(otp); pending.expiresAt = new Date(Date.now() + OTP_TTL).toISOString(); pending.attempts = 0; pending.lastSentAt = new Date().toISOString()
    await sendOtp(email, otp); await saveDb(); res.json({ message: 'A new verification code was sent.' })
  } catch (error) { console.error(error); res.status(502).json({ error: { message: 'Could not resend the verification email.' } }) }
})

app.post('/api/auth/verify', async (req, res) => {
  const email = cleanEmail(req.body.email), otp = String(req.body.otp || ''), pending = db.pending.find(p => p.email === email)
  if (!pending || new Date(pending.expiresAt) <= new Date()) return res.status(400).json({ error: { message: 'Verification code is invalid or expired.' } })
  pending.attempts += 1
  if (pending.attempts > 5 || sha(otp) !== pending.otpHash) { await saveDb(); return res.status(400).json({ error: { message: 'Verification code is invalid or expired.' } }) }
  const user = { id: id(), name: pending.name, email, passwordHash: pending.passwordHash, passwordSalt: pending.passwordSalt, createdAt: new Date().toISOString() }
  db.users.push(user); db.pending = db.pending.filter(p => p !== pending); const sessionToken = createSession(user.id); await saveDb()
  res.status(201).json({ token: sessionToken, user: publicUser(user) })
})

app.post('/api/auth/login', async (req, res) => {
  const email = cleanEmail(req.body.email), user = db.users.find(u => u.email === email)
  if (!user || !validPassword(String(req.body.password || ''), user)) return res.status(401).json({ error: { message: 'Email or password is incorrect.' } })
  if (user.suspendedAt) return res.status(403).json({ error: { message: 'This account has been suspended. Contact the administrator.' } })
  const sessionToken = createSession(user.id); await saveDb(); res.json({ token: sessionToken, user: publicUser(user) })
})
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }))
app.post('/api/auth/logout', auth, async (req, res) => { db.sessions = db.sessions.filter(s => s !== req.session); await saveDb(); res.status(204).end() })
app.put('/api/auth/password', auth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || ''), newPassword = String(req.body.newPassword || '')
  if (!validPassword(currentPassword, req.user)) return res.status(400).json({ error: { message: 'Current password is incorrect.' } })
  if (newPassword.length < 8) return res.status(400).json({ error: { message: 'New password must be at least 8 characters.' } })
  if (currentPassword === newPassword) return res.status(400).json({ error: { message: 'Choose a password different from your current password.' } })
  const passwordData = hashPassword(newPassword)
  req.user.passwordHash = passwordData.hash; req.user.passwordSalt = passwordData.salt
  db.sessions = db.sessions.filter(item => item.userId !== req.user.id || item.id === req.session.id)
  await saveDb(); res.json({ message: 'Password changed successfully.' })
})

app.get('/api/admin/gateway', auth, adminOnly, (_req, res) => {
  const config = gatewayConfig(), saved = db.settings?.gateway || {}
  res.json({ gateway: { baseUrl: config.baseUrl, freeModel: config.freeModel, premiumModel: config.premiumModel, auxiliary: config.auxiliary, providers: config.providers.map(({ apiKey, apiKeyEncrypted, ...provider }) => ({ ...provider, apiKeyConfigured: Boolean(apiKey) })), routes: config.routes, apiKeyConfigured: Boolean(config.apiKey), source: saved.updatedAt ? 'admin' : 'environment', updatedAt: saved.updatedAt || null } })
})
app.put('/api/admin/gateway', auth, adminOnly, async (req, res) => {
  const baseUrl = String(req.body.baseUrl || '').trim().replace(/\/$/, '')
  const freeModel = String(req.body.freeModel || '').trim(), premiumModel = String(req.body.premiumModel || '').trim(), apiKey = String(req.body.apiKey || '').trim()
  const auxiliary = Object.fromEntries(AUXILIARY_TASKS.map(task => [task, String(req.body.auxiliary?.[task] || 'auto').trim().slice(0, 160) || 'auto']))
  try { const parsed = new URL(baseUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() }
  catch { return res.status(400).json({ error: { message: 'Enter a valid provider HTTP or HTTPS base URL.' } }) }
  if (!freeModel || !premiumModel || freeModel.length > 120 || premiumModel.length > 120) return res.status(400).json({ error: { message: 'Enter valid free and premium model names.' } })
  const previous = db.settings?.gateway || {}
  const previousProviders = new Map((previous.providers || []).map(provider => [provider.id, provider]))
  const activeProviderSecrets = new Map(gatewayConfig().providers.map(provider => [provider.id, provider.apiKey]))
  const providers = Array.isArray(req.body.providers) ? req.body.providers.slice(0, 20).map((provider, index) => {
    const providerBaseUrl = String(provider.baseUrl || '').trim().replace(/\/$/, ''), model = String(provider.model || '').trim(), premiumProviderModel = String(provider.premiumModel || model).trim()
    try { const parsed = new URL(providerBaseUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error() } catch { throw new Error(`Provider ${index + 1} has an invalid base URL.`) }
    if (!model || !premiumProviderModel) throw new Error(`Provider ${index + 1} needs normal and premium model names.`)
    const providerId = String(provider.id || id()), prior = previousProviders.get(providerId), replacementKey = String(provider.apiKey || '').trim()
    const retainedSecret = prior?.apiKeyEncrypted || (activeProviderSecrets.get(providerId) ? encryptSecret(activeProviderSecrets.get(providerId)) : undefined)
    return { id: providerId, name: String(provider.name || `Provider ${index + 1}`).trim().slice(0, 80), baseUrl: providerBaseUrl, model: model.slice(0, 160), premiumModel: premiumProviderModel.slice(0, 160), timeoutMs: Math.max(5000, Math.min(Number(provider.timeoutMs) || 60000, UPSTREAM_TIMEOUT)), apiKeyEncrypted: replacementKey ? encryptSecret(replacementKey) : retainedSecret }
  }) : previous.providers
  if (Array.isArray(providers) && providers.some(provider => !provider.apiKeyEncrypted)) return res.status(400).json({ error: { message: 'Every provider needs an API key.' } })
  const providerIds = new Set((providers || []).map(provider => provider.id))
  const cleanRoute = tier => ({ strategy: req.body.routes?.[tier]?.strategy === 'round_robin' ? 'round_robin' : 'fallback', providerIds: (req.body.routes?.[tier]?.providerIds || []).filter(providerId => providerIds.has(providerId)) })
  const routes = providers?.length ? { free: cleanRoute('free'), premium: cleanRoute('premium') } : previous.routes
  if (providers?.length && (!routes.free.providerIds.length || !routes.premium.providerIds.length)) return res.status(400).json({ error: { message: 'Assign at least one provider to both Normal and Premium routes.' } })
  db.settings ||= {}; db.settings.gateway = { ...previous, baseUrl, freeModel, premiumModel, auxiliary, providers, routes, updatedAt: new Date().toISOString(), updatedBy: req.user.id }
  if (apiKey) db.settings.gateway.apiKeyEncrypted = encryptSecret(apiKey)
  await saveDb()
  const config = gatewayConfig()
  res.json({ gateway: { baseUrl, freeModel, premiumModel, auxiliary, providers: config.providers.map(({ apiKey: secret, apiKeyEncrypted, ...provider }) => ({ ...provider, apiKeyConfigured: Boolean(secret) })), routes: config.routes, apiKeyConfigured: Boolean(apiKey || previous.apiKeyEncrypted || process.env.OMNIROUTE_API_KEY), source: 'admin', updatedAt: db.settings.gateway.updatedAt } })
})
app.post('/api/admin/gateway/test', auth, adminOnly, async (req, res) => {
  try {
    const saved = gatewayConfig()
    const baseUrl = String(req.body.baseUrl || saved.baseUrl || '').trim().replace(/\/$/, '')
    const apiKey = String(req.body.apiKey || '').trim() || saved.apiKey
    const parsed = new URL(baseUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid_url')
    if (!apiKey) return res.status(400).json({ error: { message: 'Enter a provider API key before testing.' } })
    const response = await fetch(`${baseUrl}/models`, upstreamOptions({ headers: { Authorization: `Bearer ${apiKey}` } }))
    if (!response.ok) return res.status(502).json({ error: { message: `The provider returned HTTP ${response.status}.` } })
    const data = await response.json()
    const models = [...new Set((Array.isArray(data.data) ? data.data : []).map(model => typeof model === 'string' ? model : model?.id).filter(Boolean))].sort((a, b) => a.localeCompare(b))
    res.json({ ok: true, count: models.length, models })
  } catch { res.status(502).json({ error: { message: 'Could not connect to the provider with this URL and API key.' } }) }
})

const OAUTH_PROVIDERS = [
  { id: 'antigravity', name: 'Google Antigravity', flow: 'browser' },
  { id: 'gemini', name: 'Google Gemini', flow: 'browser' },
  { id: 'claude-code', name: 'Claude Code', flow: 'device', providerKey: 'command-code' },
  { id: 'codex', name: 'OpenAI Codex', flow: 'device', providerKey: 'codex' },
  { id: 'copilot', name: 'GitHub Copilot', flow: 'device', providerKey: 'copilot' },
]
app.get('/api/admin/oauth', auth, adminOnly, async (_req, res) => {
  try {
    const response = await omniManagementFetch('/api/providers')
    const data = await response.json().catch(() => ({})), items = data.providers || data.items || (Array.isArray(data) ? data : [])
    res.json({ providers: OAUTH_PROVIDERS, connections: items.filter(item => item.authType === 'oauth' || item.authType === 'oauth2') })
  } catch { res.status(502).json({ error: { message: 'Could not read OAuth connections from OmniRoute.' } }) }
})
app.post('/api/admin/oauth/:provider/start', auth, adminOnly, async (req, res) => {
  const provider = OAUTH_PROVIDERS.find(item => item.id === req.params.provider)
  if (!provider) return res.status(404).json({ error: { message: 'Unsupported OAuth provider.' } })
  try {
    if (provider.flow === 'device') return proxyOmniJson(res, await omniManagementFetch(`/api/providers/${provider.providerKey}/auth/start`, { method: 'POST' }))
    const redirectUri = String(req.body.redirectUri || 'http://127.0.0.1:20128/callback')
    return proxyOmniJson(res, await omniManagementFetch(`/api/oauth/${provider.id}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`))
  } catch { res.status(502).json({ error: { message: 'Could not start OAuth authorization.' } }) }
})
app.post('/api/admin/oauth/:provider/exchange', auth, adminOnly, async (req, res) => {
  const provider = OAUTH_PROVIDERS.find(item => item.id === req.params.provider && item.flow === 'browser')
  if (!provider) return res.status(400).json({ error: { message: 'This provider does not use callback exchange.' } })
  const pasted = String(req.body.callback || '').trim(); let code, state = req.body.state
  try { const parsed = new URL(pasted); code = parsed.searchParams.get('code'); state = parsed.searchParams.get('state') || parsed.hash.replace(/^#/, '') || state } catch { [code, state = state] = pasted.split('#', 2) }
  if (!code) return res.status(400).json({ error: { message: 'Paste the complete callback URL or code#state.' } })
  try { return proxyOmniJson(res, await omniManagementFetch(`/api/oauth/${provider.id}/exchange`, { method: 'POST', body: { code, state, redirectUri: req.body.redirectUri, codeVerifier: req.body.codeVerifier } })) }
  catch { res.status(502).json({ error: { message: 'OAuth code exchange failed.' } }) }
})
app.get('/api/admin/oauth/:provider/status', auth, adminOnly, async (req, res) => {
  const provider = OAUTH_PROVIDERS.find(item => item.id === req.params.provider && item.flow === 'device')
  if (!provider) return res.status(400).json({ error: { message: 'Unsupported device flow.' } })
  try { return proxyOmniJson(res, await omniManagementFetch(`/api/providers/${provider.providerKey}/auth/status?state=${encodeURIComponent(String(req.query.state || ''))}`)) }
  catch { res.status(502).json({ error: { message: 'Could not check authorization status.' } }) }
})
app.post('/api/admin/oauth/:provider/apply', auth, adminOnly, async (req, res) => {
  const provider = OAUTH_PROVIDERS.find(item => item.id === req.params.provider && item.flow === 'device')
  if (!provider) return res.status(400).json({ error: { message: 'Unsupported device flow.' } })
  try { return proxyOmniJson(res, await omniManagementFetch(`/api/providers/${provider.providerKey}/auth/apply`, { method: 'POST', body: { state: req.body.state } })) }
  catch { res.status(502).json({ error: { message: 'Could not apply authorized connection.' } }) }
})

app.get('/api/admin/users', auth, adminOnly, (_req, res) => {
  const users = db.users.map(user => {
    const keys = db.keys.filter(key => key.userId === user.id)
    const keyIds = new Set(keys.map(key => key.id))
    const events = db.usage.filter(event => keyIds.has(event.keyId))
    return { ...publicUser(user), tokens: events.reduce((sum, event) => sum + Number(event.tokens || 0), 0), requests: events.length, activeKeys: keys.filter(key => !key.revokedAt).length }
  }).sort((a, b) => b.tokens - a.tokens)
  res.json({ users })
})
app.put('/api/admin/users/:id/suspension', auth, adminOnly, async (req, res) => {
  const user = db.users.find(item => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } })
  if (user.id === req.user.id || isAdmin(user)) return res.status(400).json({ error: { message: 'Administrator accounts cannot be suspended here.' } })
  user.suspendedAt = req.body.suspended ? new Date().toISOString() : null
  if (user.suspendedAt) db.sessions = db.sessions.filter(session => session.userId !== user.id)
  await saveDb(); res.json({ user: publicUser(user) })
})
app.put('/api/admin/users/:id/premium', auth, adminOnly, async (req, res) => {
  const user = db.users.find(item => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } })
  if (isAdmin(user)) return res.status(400).json({ error: { message: 'Administrators already have premium access.' } })
  user.premiumAccess = Boolean(req.body.enabled)
  await saveDb(); res.json({ user: publicUser(user) })
})
app.put('/api/admin/users/:id/role', auth, adminOnly, async (req, res) => {
  const user = db.users.find(item => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } })
  const makeAdmin = Boolean(req.body.admin)
  if (user.id === req.user.id && !makeAdmin) return res.status(400).json({ error: { message: 'You cannot remove your own administrator access.' } })
  if (isOwnerAdmin(user) && !makeAdmin) return res.status(400).json({ error: { message: 'The configured owner administrator cannot be demoted.' } })
  user.admin = makeAdmin
  if (makeAdmin) { user.premiumAccess = true; user.suspendedAt = null }
  await saveDb(); res.json({ user: publicUser(user) })
})
app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  const user = db.users.find(item => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } })
  if (user.id === req.user.id) return res.status(400).json({ error: { message: 'You cannot delete your own account.' } })
  if (isOwnerAdmin(user)) return res.status(400).json({ error: { message: 'The configured owner administrator cannot be deleted.' } })
  const keyIds = new Set(db.keys.filter(key => key.userId === user.id).map(key => key.id))
  db.users = db.users.filter(item => item.id !== user.id)
  db.sessions = db.sessions.filter(item => item.userId !== user.id)
  db.keys = db.keys.filter(item => item.userId !== user.id)
  db.usage = db.usage.filter(item => !keyIds.has(item.keyId))
  await saveDb(); res.status(204).end()
})
app.post('/api/admin/users/:id/grant', auth, adminOnly, async (req, res) => {
  const user = db.users.find(item => item.id === req.params.id)
  if (!user) return res.status(404).json({ error: { message: 'User not found.' } })
  const key = db.keys.filter(item => item.userId === user.id && !item.revokedAt && item.tokenLimit != null && (!item.expiresAt || new Date(item.expiresAt) > new Date())).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
  if (!key) return res.status(409).json({ error: { message: 'This user has no active metered API key.' } })
  key.tokenLimit += 100000
  await saveDb(); res.json({ key: keyView(key), granted: 100000 })
})

app.get('/api/keys', auth, (req, res) => res.json({ keys: db.keys.filter(k => k.userId === req.user.id && !k.revokedAt).map(keyView) }))
app.get('/api/usage', auth, (req, res) => {
  const userKeys = db.keys.filter(key => key.userId === req.user.id)
  const keyIds = new Set(userKeys.map(key => key.id))
  const events = db.usage.filter(event => keyIds.has(event.keyId)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  const since = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recentEvents = events.filter(event => new Date(event.createdAt).getTime() >= since)
  const dailyMap = new Map()
  for (let offset = 29; offset >= 0; offset -= 1) { const date = new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10); dailyMap.set(date, { date, requests: 0, tokens: 0 }) }
  for (const event of recentEvents) { const day = event.createdAt.slice(0, 10), entry = dailyMap.get(day); if (entry) { entry.requests += 1; entry.tokens += Number(event.tokens || 0) } }
  const keyNames = new Map(userKeys.map(key => [key.id, key.name]))
  const successfulRequests = events.filter(event => event.success !== false).length
  const latencySamples = events.map(event => Number(event.latencyMs)).filter(Number.isFinite)
  res.json({
    summary: { requests: events.length, tokens: events.reduce((sum, event) => sum + Number(event.tokens || 0), 0), freeRequests: events.filter(event => event.tier === 'free').length, premiumRequests: events.filter(event => event.tier === 'premium').length, successRate: events.length ? (successfulRequests / events.length) * 100 : null, averageLatencyMs: latencySamples.length ? Math.round(latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length) : null, latencySamples: latencySamples.length },
    daily: [...dailyMap.values()],
    keys: userKeys.map(key => ({ ...keyView(key), requests: events.filter(event => event.keyId === key.id).length })),
    recent: events.slice(0, 20).map(event => ({ ...event, keyName: keyNames.get(event.keyId) || 'Deleted key' })),
  })
})
app.post('/api/keys', auth, async (req, res) => {
  const active = db.keys.filter(k => k.userId === req.user.id && !k.revokedAt)
  if (!isAdmin(req.user) && active.length >= 3) return res.status(409).json({ error: { message: 'Maximum of 3 API keys reached.' } })
  const name = String(req.body.name || '').trim(), months = Number(req.body.months), tokenLimit = Number(req.body.tokenLimit)
  const validMonths = [1,2,3].includes(months) || (isAdmin(req.user) && months === 0)
  const validLimit = ALLOWED_LIMITS.has(tokenLimit) || (isAdmin(req.user) && tokenLimit === 0)
  if (!name || !validMonths || !validLimit) return res.status(400).json({ error: { message: 'Invalid key configuration.' } })
  const raw = `dt_live_${token(24)}`, now = new Date()
  const key = { id: id(), userId: req.user.id, name, keyHash: sha(raw), prefix: raw.slice(0, 12), lastFour: raw.slice(-4), createdAt: now.toISOString(), expiresAt: months === 0 ? null : addMonths(now, months).toISOString(), tokenUsed: 0, tokenLimit: tokenLimit === 0 ? null : tokenLimit, revokedAt: null }
  db.keys.push(key); await saveDb(); res.status(201).json({ key: keyView(key), secret: raw })
})
app.delete('/api/keys/:id', auth, async (req, res) => {
  const key = db.keys.find(k => k.id === req.params.id && k.userId === req.user.id && !k.revokedAt)
  if (!key) return res.status(404).json({ error: { message: 'API key not found.' } })
  key.revokedAt = new Date().toISOString(); await saveDb(); res.status(204).end()
})

function customerKey(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const key = raw && db.keys.find(k => k.keyHash === sha(raw) && !k.revokedAt)
  if (!key) return res.status(401).json({ error: { message: 'Invalid API key.', type: 'authentication_error', code: 'invalid_api_key' } })
  const user = db.users.find(item => item.id === key.userId)
  if (!user || user.suspendedAt) return res.status(403).json({ error: { message: 'This account has been suspended.', type: 'authentication_error', code: 'account_suspended' } })
  if (key.expiresAt && new Date(key.expiresAt) <= new Date()) return res.status(401).json({ error: { message: 'API key has expired.', type: 'authentication_error', code: 'key_expired' } })
  if (key.tokenLimit != null && key.tokenUsed >= key.tokenLimit) return res.status(429).json({ error: { message: 'Token allowance exhausted.', type: 'rate_limit_error', code: 'token_limit_exceeded' } })
  req.apiKey = key; req.apiUser = user; next()
}

app.get('/v1/models', customerKey, (_req, res) => res.json({ object: 'list', data: [{ id: PUBLIC_MODEL, object: 'model', owned_by: 'dtempire' }, { id: 'DTEmpire', object: 'model', owned_by: 'dtempire', deprecated: true }] }))
app.get('/v1/models/:model', customerKey, (req, res) => {
  if (![PUBLIC_MODEL.toLowerCase(), 'dtempire'].includes(String(req.params.model).toLowerCase())) return res.status(404).json({ error: { message: 'Model not found.', type: 'invalid_request_error' } })
  res.json({ id: PUBLIC_MODEL, object: 'model', owned_by: 'dtempire' })
})
app.get('/v1/usage', customerKey, (req, res) => res.json({ token_used: req.apiKey.tokenUsed, token_limit: req.apiKey.tokenLimit ?? null, remaining: req.apiKey.tokenLimit == null ? null : Math.max(0, req.apiKey.tokenLimit - req.apiKey.tokenUsed), expires_at: req.apiKey.expiresAt || null }))
app.post('/v1/chat/completions', customerKey, async (req, res) => {
  const startedAt = Date.now()
  let usageRecorded = false
  const recordUsage = ({ tier = 'unknown', model = null, tokens = 0, success }) => {
    if (usageRecorded) return
    usageRecorded = true
    db.usage.push({ id: id(), keyId: req.apiKey.id, tier, model, tokens, success, latencyMs: Date.now() - startedAt, createdAt: new Date().toISOString() })
  }
  try {
    if (!Array.isArray(req.body.messages) || req.body.messages.length === 0) return res.status(400).json({ error: { message: 'messages must be a non-empty array.', type: 'invalid_request_error' } })
    const requestedTier = String(req.body.tier || req.headers['x-dtempire-tier'] || 'auto').toLowerCase()
    if (!['auto', 'free', 'premium'].includes(requestedTier)) return res.status(400).json({ error: { message: 'tier must be auto, free, or premium.', type: 'invalid_request_error' } })
    const premiumAllowed = isAdmin(req.apiUser) || Boolean(req.apiUser.premiumAccess)
    const resolvedRequestedTier = requestedTier === 'auto' ? classifyTier(req.body.messages) : requestedTier
    const tier = premiumAllowed ? resolvedRequestedTier : 'free'
    const task = String(req.body.switchforge_task || req.headers['x-switchforge-task'] || '').trim().toLowerCase().replace(/[-\s]+/g, '_')
    if (task && !AUXILIARY_TASKS.includes(task)) return res.status(400).json({ error: { message: 'Unknown SwitchForge auxiliary task.', type: 'invalid_request_error' } })
    const upstreamModelOverride = premiumAllowed ? (req.body.upstream_model || (task ? auxiliaryModel(task, tier) : undefined)) : undefined
    const payload = { ...req.body, messages: [{ role: 'system', content: SWITCHFORGE_SYSTEM }, ...req.body.messages] }; delete payload.tier; delete payload.upstream_model
    delete payload.switchforge_task
    const requestedTokens = Number(payload.max_completion_tokens || payload.max_tokens || 1024)
    const estimatedRequest = estimateTokens(payload.messages) + (Number.isFinite(requestedTokens) ? Math.max(0, requestedTokens) : 1024)
    if (req.apiKey.tokenLimit != null && req.apiKey.tokenUsed + estimatedRequest > req.apiKey.tokenLimit) return res.status(429).json({ error: { message: 'This request may exceed the remaining token allowance.', type: 'rate_limit_error', code: 'token_limit_exceeded' } })
    console.log(`SwitchForge route tier=${tier} model=${upstreamModelOverride || routeModel(tier)} task=${task || 'main'} stream=${Boolean(payload.stream)}`)
    let { response: upstream, resolvedModel } = await fetchChatUpstream(payload, tier, upstreamModelOverride)
    if (!upstream.ok) { const body = await upstream.text(); recordUsage({ tier, model: resolvedModel, success: false }); await saveDb(); res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(body); return }
    if (payload.stream) {
      let prepared
      try { prepared = await prepareStream(upstream, tier === 'free' && !upstreamModelOverride ? 7000 : 18000) }
      catch (error) {
        if (tier !== 'free' || upstreamModelOverride || resolvedModel === FAST_FALLBACK_MODEL) throw error
        const fallback = await fetchChatUpstream(payload, tier, FAST_FALLBACK_MODEL); upstream = fallback.response; resolvedModel = fallback.resolvedModel
        if (!upstream.ok) { const body = await upstream.text(); recordUsage({ tier, model: resolvedModel, success: false }); await saveDb(); res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(body); return }
        prepared = await prepareStream(upstream, 18000)
      }
      res.status(200); res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache'); res.setHeader('X-DTEmpire-Tier', tier); res.setHeader('X-SwitchForge-Route-Model', resolvedModel); if (task) res.setHeader('X-SwitchForge-Task', task)
      const reader = prepared.reader; let completionText = prepared.text
      for (const chunk of prepared.chunks) res.write(chunk)
      if (prepared.done) { const estimated = estimateTokens(payload.messages) + estimateTokens(completionText); req.apiKey.tokenUsed += estimated; recordUsage({ tier, model: resolvedModel, tokens: estimated, success: true }); res.end(); saveDb().catch(console.error); return }
      while (true) { const { done, value } = await reader.read(); if (done) break; const chunk = Buffer.from(value); completionText += chunk.toString('utf8'); res.write(chunk) }
      const estimated = estimateTokens(payload.messages) + estimateTokens(completionText); req.apiKey.tokenUsed += estimated; recordUsage({ tier, model: resolvedModel, tokens: estimated, success: true }); res.end(); saveDb().catch(console.error); return
    }
    const data = await readChatResponse(upstream), used = Number(data.usage?.total_tokens || estimateTokens(payload.messages) + estimateTokens(data.choices?.[0]?.message?.content || ''))
    req.apiKey.tokenUsed += used; recordUsage({ tier, model: resolvedModel, tokens: used, success: true })
    data.model = PUBLIC_MODEL; data.switchforge = { tier, model: resolvedModel, requested_tier: requestedTier, premium_access: premiumAllowed, task: task || null }; data.dtempire = data.switchforge; res.setHeader('X-DTEmpire-Tier', tier); res.setHeader('X-SwitchForge-Route-Model', resolvedModel); if (task) res.setHeader('X-SwitchForge-Task', task); res.json(data); saveDb().catch(console.error)
  } catch (error) {
    console.error(error)
    recordUsage({ success: false })
    saveDb().catch(console.error)
    if (!res.headersSent) res.status(502).json({ error: { message: 'The configured model provider is unavailable.', type: 'upstream_error' } })
    else if (!res.writableEnded) { res.write(`data: ${JSON.stringify({ error: { message: 'The upstream stream ended unexpectedly.', type: 'upstream_error' } })}\n\ndata: [DONE]\n\n`); res.end() }
  }
})

const dist = path.join(__dirname, '..', 'dist')
if (process.env.SERVE_FRONTEND !== 'false') {
  app.use(express.static(dist))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}
app.listen(PORT, '0.0.0.0', () => console.log(`SwitchForge backend listening on http://localhost:${PORT}`))
