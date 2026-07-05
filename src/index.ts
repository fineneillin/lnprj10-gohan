import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Bindings } from './types'
import { TYPE_MAP, searchNearby, geocode } from './places'

const app = new Hono<{ Bindings: Bindings }>()

app.use('/api/*', cors())

// GET /api/nearby — proxy Places searchNearby + weighted sort + Haversine
app.get('/api/nearby', async (c) => {
  const lat = parseFloat(c.req.query('lat') ?? '')
  const lng = parseFloat(c.req.query('lng') ?? '')
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return c.json({ error: 'bad_request' }, 400)
  }

  const radiusRaw = parseInt(c.req.query('radius') ?? '1000', 10)
  const radius = isFinite(radiusRaw) ? Math.min(Math.max(radiusRaw, 1), 50000) : 1000
  const typeKey = c.req.query('type') ?? 'all'
  const includedTypes = TYPE_MAP[typeKey] ?? TYPE_MAP.all
  const openNow = c.req.query('openNow') === 'true'

  // Cache key: lat/lng rounded to ~100m + radius + type + openNow, 5 min
  const rLat = lat.toFixed(3)
  const rLng = lng.toFixed(3)
  const cacheKey = new Request(
    `https://cache.local/nearby?lat=${rLat}&lng=${rLng}&radius=${radius}&type=${typeKey}&openNow=${openNow}`
  )
  const cache = caches.default
  const hit = await cache.match(cacheKey)
  if (hit) return hit

  try {
    const results = await searchNearby(c.env.GOOGLE_MAPS_API_KEY, {
      lat,
      lng,
      radius,
      includedTypes,
      openNow,
    })
    const res = c.json({ results })
    res.headers.set('Cache-Control', 'public, max-age=300')
    c.executionCtx.waitUntil(cache.put(cacheKey, res.clone()))
    return res
  } catch {
    return c.json({ error: 'upstream_failed' }, 502)
  }
})

// GET /api/geocode — address/landmark → lat,lng
app.get('/api/geocode', async (c) => {
  const q = c.req.query('q')?.trim()
  if (!q) return c.json({ error: 'bad_request' }, 400)
  try {
    const result = await geocode(c.env.GOOGLE_MAPS_API_KEY, q)
    if (!result) return c.json({ error: 'not_found' }, 404)
    return c.json(result)
  } catch {
    return c.json({ error: 'upstream_failed' }, 502)
  }
})

// GET /api/photo — proxy Google place photo (keeps key server-side)
app.get('/api/photo', async (c) => {
  const name = c.req.query('name')
  if (!name || !name.startsWith('places/')) return c.json({ error: 'bad_request' }, 400)
  const wRaw = parseInt(c.req.query('w') ?? '800', 10)
  const w = isFinite(wRaw) ? Math.min(Math.max(wRaw, 1), 1600) : 800

  try {
    const upstream = await fetch(
      `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}`,
      { headers: { 'X-Goog-Api-Key': c.env.GOOGLE_MAPS_API_KEY } }
    )
    if (!upstream.ok || !upstream.body) return c.json({ error: 'not_found' }, 404)
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return c.json({ error: 'upstream_failed' }, 502)
  }
})

app.get('/api/health', (c) => c.json({ status: 'ok' }))

// Static SPA served via ASSETS binding
app.get('*', (c) => c.env.ASSETS.fetch(c.req.raw))

export default app
