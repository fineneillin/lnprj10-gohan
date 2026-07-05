'use strict'

const LIFF_ID = '2010604898-QOamS041'

const state = {
  coords: null, // { lat, lng }
  candidates: [], // up to 20, sorted by score
  type: 'all',
  radius: 1000,
  openNow: true,
  mode: 'here', // 'here' | 'search'
}

const $ = (id) => document.getElementById(id)
const els = {}

/* ---------- helpers ---------- */

const PRICE_SYMBOL = {
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

function priceSymbol(level) {
  return PRICE_SYMBOL[level] || ''
}

function distanceText(m) {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`
}

function walkText(m) {
  return `步行約 ${Math.max(1, Math.round(m / 80))} 分`
}

function starsHtml(rating) {
  const full = Math.round(rating || 0)
  let out = ''
  for (let i = 1; i <= 5; i++) {
    out += i <= full ? '<span class="star-full">★</span>' : '<span class="star-empty">★</span>'
  }
  return out
}

function photoUrl(name, w) {
  return `${location.origin}/api/photo?name=${encodeURIComponent(name)}&w=${w || 800}`
}

function navUrl(p) {
  const placeId = p.id.replace(/^places\//, '')
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}&destination_place_id=${placeId}`
}

let toastTimer
function toast(msg) {
  els.toast.textContent = msg
  els.toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2200)
}

function showStatus(msg) {
  els.status.textContent = msg
  els.status.classList.remove('hidden')
  els.list.innerHTML = ''
}
function hideStatus() {
  els.status.classList.add('hidden')
}
function showSpinner(msg) {
  els.status.innerHTML = `<div class="spinner"></div><p>${msg}</p>`
  els.status.classList.remove('hidden')
  els.list.innerHTML = ''
}
function showEmptyWithButton(msg, btnLabel, onClick) {
  els.status.innerHTML =
    `<p>${msg}</p>` +
    `<button class="btn btn-solid" id="emptyActionBtn" style="margin-top:16px">${btnLabel}</button>`
  els.status.classList.remove('hidden')
  els.list.innerHTML = ''
  const b = document.getElementById('emptyActionBtn')
  if (b) b.addEventListener('click', onClick)
}

/* ---------- weighted pick for 換一批 ---------- */

function pickTen(candidates) {
  const pool = candidates.slice()
  const chosen = []
  while (chosen.length < 10 && pool.length) {
    const total = pool.reduce((s, p) => s + Math.max(p.score, 0.01), 0)
    let r = Math.random() * total
    let idx = 0
    for (let i = 0; i < pool.length; i++) {
      r -= Math.max(pool[i].score, 0.01)
      if (r <= 0) { idx = i; break }
    }
    chosen.push(pool.splice(idx, 1)[0])
  }
  return chosen
}

/* ---------- rendering ---------- */

function cardHtml(p) {
  const price = priceSymbol(p.priceLevel)
  const metaBits = [p.primaryType, price].filter(Boolean).join(' · ')
  const hero = p.photoName
    ? `<img class="card-photo" src="${photoUrl(p.photoName, 800)}" alt="${p.name}" loading="lazy" />`
    : `<div class="card-photo placeholder">碗</div>`
  const openBadge = p.openNow === true ? '<span class="open-badge">營業中</span>' : ''
  const ratingRow =
    p.rating != null
      ? `<div class="rating-row">
           <span class="stars">${starsHtml(p.rating)}</span>
           <span class="rating-num">${p.rating.toFixed(1)}</span>
           <span class="rating-count">(${p.userRatingCount ?? 0})</span>
         </div>`
      : ''

  return `
    <article class="card" data-id="${p.id}">
      <span class="card-chevron" aria-hidden="true">›</span>
      ${hero}
      <div class="card-body">
        <div class="card-name">${p.name}</div>
        ${metaBits ? `<div class="card-meta">${metaBits}</div>` : ''}
        ${ratingRow}
        <div class="dist-row">
          <span>${distanceText(p.distanceMeters)} · ${walkText(p.distanceMeters)}</span>
          ${openBadge}
        </div>
        <div class="card-actions">
          <button class="btn btn-ghost" data-act="share">分享</button>
          <button class="btn btn-solid" data-act="nav">導航</button>
        </div>
      </div>
    </article>`
}

function render(list) {
  if (!list.length) {
    if (state.openNow) {
      showEmptyWithButton(
        '附近營業中的店家找不到——試試關閉「僅營業中」或放大半徑',
        '關閉「僅營業中」',
        () => {
          state.openNow = false
          els.openNowToggle.checked = false
          loadNearby()
        }
      )
    } else {
      showStatus('附近找不到，放大半徑或換地點')
    }
    return
  }
  hideStatus()
  els.list.innerHTML = list.map(cardHtml).join('')
}

/* ---------- data fetch ---------- */

async function loadNearby() {
  if (!state.coords) return
  showSpinner('尋找附近的好店…')
  const { lat, lng } = state.coords
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius: String(state.radius),
    type: state.type,
    openNow: String(state.openNow),
  })
  try {
    const res = await fetch(`/api/nearby?${params}`)
    if (!res.ok) throw new Error('nearby')
    const data = await res.json()
    state.candidates = data.results || []
    render(pickTen(state.candidates))
  } catch {
    showStatus('查詢失敗，請稍後再試')
  }
}

async function geocodeAndLoad(q) {
  showSpinner('定位地點中…')
  try {
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`)
    if (res.status === 404) {
      showStatus('找不到這個地點，換個關鍵字')
      return
    }
    if (!res.ok) throw new Error('geocode')
    const data = await res.json()
    state.coords = { lat: data.lat, lng: data.lng }
    els.locStatusText.textContent = `📌 基準：${data.formattedAddress}`
    await loadNearby()
  } catch {
    showStatus('定位失敗，請稍後再試')
  }
}

function useCurrentLocation() {
  if (!navigator.geolocation) {
    els.locStatusText.textContent = '此裝置不支援定位，請切換到「輸入地點」'
    return
  }
  showSpinner('取得目前位置…')
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      els.locStatusText.textContent = '📍 以你的目前位置為基準'
      loadNearby()
    },
    () => {
      els.locStatusText.textContent = '無法取得定位，請切換到「輸入地點」'
      showStatus('無法取得定位，請切換到「輸入地點」後搜尋')
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
  )
}

/* ---------- location mode + chip helpers ---------- */

function setMode(mode) {
  state.mode = mode
  els.locModeSeg.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset.mode === mode)
  })
  if (mode === 'search') {
    els.locInputWrap.hidden = false
    els.locRelocateBtn.hidden = true
    els.locStatusText.textContent = '輸入地點後按 Enter 定位'
    els.locInput.focus()
  } else {
    els.locInputWrap.hidden = true
    els.locRelocateBtn.hidden = false
    useCurrentLocation()
  }
}

function selectChip(btn) {
  els.chipRow.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
  btn.classList.add('active')
  state.type = btn.dataset.type
  // keep the selected chip in view within the horizontal scroll row
  btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  loadNearby()
}

/* ---------- share (LIFF) ---------- */

function buildFlex(p) {
  const price = priceSymbol(p.priceLevel)
  const rating = p.rating != null ? p.rating.toFixed(1) : '—'
  const bodyContents = [
    { type: 'text', text: p.name, weight: 'bold', size: 'lg', wrap: true, color: '#2B2621' },
    {
      type: 'box', layout: 'baseline', spacing: 'sm', contents: [
        { type: 'text', text: `★ ${rating}`, size: 'sm', color: '#A8432B', flex: 0 },
        { type: 'text', text: `(${p.userRatingCount ?? 0})${price ? ' · ' + price : ''}`, size: 'sm', color: '#9A8F7F' },
      ],
    },
    { type: 'text', text: `${p.primaryType || '餐廳'} · ${distanceText(p.distanceMeters)}`, size: 'sm', color: '#9A8F7F', wrap: true },
  ]
  if (p.address) {
    bodyContents.push({ type: 'text', text: p.address, size: 'xs', color: '#B0A695', wrap: true })
  }

  const bubble = {
    type: 'bubble',
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
    footer: {
      type: 'box', layout: 'vertical', contents: [
        {
          type: 'button', style: 'primary', color: '#A8432B',
          action: { type: 'uri', label: '在地圖開啟', uri: navUrl(p) },
        },
      ],
    },
  }
  if (p.photoName) {
    bubble.hero = {
      type: 'image',
      url: photoUrl(p.photoName, 1024),
      size: 'full', aspectRatio: '20:13', aspectMode: 'cover',
    }
  }

  return {
    type: 'flex',
    altText: `今日のごはん｜${p.name} ★${rating}`,
    contents: bubble,
  }
}

async function share(p) {
  try {
    if (window.liff && liff.isApiAvailable && liff.isApiAvailable('shareTargetPicker')) {
      await liff.shareTargetPicker([buildFlex(p)])
      return
    }
  } catch (e) {
    // fall through to clipboard fallback
  }
  const text = `${p.name}\n${navUrl(p)}`
  try {
    await navigator.clipboard.writeText(text)
    toast('已複製店名與導航連結')
  } catch {
    toast(text)
  }
}

/* ---------- events ---------- */

function bindEvents() {
  els.locModeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]')
    if (!btn || btn.dataset.mode === state.mode) return
    setMode(btn.dataset.mode)
  })
  els.locRelocateBtn.addEventListener('click', useCurrentLocation)
  els.locInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = els.locInput.value.trim()
      if (q) geocodeAndLoad(q)
    }
  })
  els.locInputIcon.addEventListener('click', () => {
    const q = els.locInput.value.trim()
    if (q) geocodeAndLoad(q)
  })

  els.chipRow.addEventListener('click', (e) => {
    const btn = e.target.closest('.chip[data-type]')
    if (btn) selectChip(btn)
  })

  els.radiusSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button')
    if (!btn) return
    els.radiusSeg.querySelectorAll('button').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    state.radius = parseInt(btn.dataset.radius, 10)
    loadNearby()
  })

  els.openNowToggle.addEventListener('change', () => {
    state.openNow = els.openNowToggle.checked
    loadNearby()
  })

  els.reshuffleBtn.addEventListener('click', () => {
    if (state.candidates.length) render(pickTen(state.candidates))
  })

  els.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]')
    if (!btn) return
    const card = e.target.closest('.card')
    const p = state.candidates.find((x) => x.id === card.dataset.id)
    if (!p) return
    if (btn.dataset.act === 'nav') window.open(navUrl(p), '_blank')
    else if (btn.dataset.act === 'share') share(p)
  })
}

/* ---------- boot ---------- */

function cacheEls() {
  ;['controls', 'locModeSeg', 'locInputWrap', 'locInput', 'locInputIcon',
    'locStatus', 'locStatusText', 'locRelocateBtn', 'chipRow',
    'radiusSeg', 'openNowToggle', 'reshuffleBtn', 'statusBox',
    'list', 'toast'
  ].forEach((id) => {
    els[id === 'statusBox' ? 'status' : id] = $(id)
  })
}

async function boot() {
  cacheEls()
  bindEvents()
  els.controls.hidden = false
  els.openNowToggle.checked = state.openNow

  try {
    await liff.init({ liffId: LIFF_ID })
  } catch (e) {
    // LIFF may fail outside LINE (e.g. desktop browser) — app still works
  }

  // default mode: current location
  useCurrentLocation()
}

document.addEventListener('DOMContentLoaded', boot)
