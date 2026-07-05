import type { NearbyQuery, NearbyResult } from './types'

// chip → Places (New) includedTypes
export const TYPE_MAP: Record<string, string[]> = {
  // primary row
  all: ['restaurant'],
  japanese: ['japanese_restaurant', 'sushi_restaurant', 'ramen_restaurant'],
  korean: ['korean_restaurant'],
  chinese: ['chinese_restaurant'],
  vegetarian: ['vegetarian_restaurant', 'vegan_restaurant'],
  cafe: ['cafe', 'coffee_shop'],
  // "more" row
  western: ['italian_restaurant', 'french_restaurant', 'american_restaurant', 'steak_house'],
  thai: ['thai_restaurant'],
  vietnamese: ['vietnamese_restaurant'],
  indian: ['indian_restaurant'],
  bbq: ['barbecue_restaurant'],
  seafood: ['seafood_restaurant'],
  brunch: ['breakfast_restaurant', 'brunch_restaurant'],
  dessert: ['dessert_shop', 'bakery', 'ice_cream_shop'],
  bar: ['bar'],
  fastfood: ['fast_food_restaurant', 'hamburger_restaurant', 'pizza_restaurant'],
}

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.rating',
  'places.userRatingCount',
  'places.location',
  'places.formattedAddress',
  'places.priceLevel',
  'places.currentOpeningHours.openNow',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
  'places.photos',
].join(',')

// Bayesian confidence constant / assumed global mean rating
const C = 50
const G = 3.8
// Distance decay coefficient: higher = distance matters more.
// v1 used 1 (aggressive); v1.1 softens to 0.4. Drop to 0.3 to weaken distance further.
const DISTANCE_DECAY_K = 0.4

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371 // km
  const toRad = (x: number) => (x * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const d = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(d * 1000)
}

export function computeScore(
  rating: number | null,
  count: number | null,
  distanceMeters: number
): number {
  const r = rating ?? G
  const n = count ?? 0
  const bayes = (n * r + C * G) / (n + C)
  const decay = 1 / (1 + DISTANCE_DECAY_K * (distanceMeters / 1000))
  return Math.round(bayes * decay * 100) / 100
}

interface GooglePlace {
  id: string
  displayName?: { text?: string }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  location?: { latitude: number; longitude: number }
  formattedAddress?: string
  currentOpeningHours?: { openNow?: boolean }
  primaryTypeDisplayName?: { text?: string }
  googleMapsUri?: string
  photos?: { name?: string }[]
}

export async function searchNearby(key: string, q: NearbyQuery): Promise<NearbyResult[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: q.includedTypes,
      maxResultCount: 20,
      rankPreference: 'POPULARITY',
      languageCode: 'zh-TW',
      regionCode: 'TW',
      locationRestriction: {
        circle: {
          center: { latitude: q.lat, longitude: q.lng },
          radius: q.radius,
        },
      },
    }),
  })

  if (!res.ok) throw new Error('places_failed')

  const data = (await res.json()) as { places?: GooglePlace[] }
  const places = data.places ?? []

  const results: NearbyResult[] = places.map((p) => {
    const lat = p.location?.latitude ?? q.lat
    const lng = p.location?.longitude ?? q.lng
    const rating = typeof p.rating === 'number' ? p.rating : null
    const userRatingCount = typeof p.userRatingCount === 'number' ? p.userRatingCount : null
    const distanceMeters = haversineMeters(q.lat, q.lng, lat, lng)
    return {
      id: p.id,
      name: p.displayName?.text ?? '未命名店家',
      rating,
      userRatingCount,
      priceLevel: p.priceLevel ?? null,
      primaryType: p.primaryTypeDisplayName?.text ?? null,
      address: p.formattedAddress ?? null,
      lat,
      lng,
      openNow: p.currentOpeningHours?.openNow ?? null,
      distanceMeters,
      mapsUri: p.googleMapsUri ?? null,
      photoName: p.photos?.[0]?.name ?? null,
      score: computeScore(rating, userRatingCount, distanceMeters),
    }
  })

  const filtered = q.openNow ? results.filter((r) => r.openNow === true) : results
  filtered.sort((a, b) => b.score - a.score)
  return filtered
}

export interface GeocodeResult {
  lat: number
  lng: number
  formattedAddress: string
}

export async function geocode(key: string, q: string): Promise<GeocodeResult | null> {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json' +
    `?address=${encodeURIComponent(q)}&language=zh-TW&region=tw&key=${key}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('geocode_failed')
  const data = (await res.json()) as {
    status: string
    results?: {
      geometry: { location: { lat: number; lng: number } }
      formatted_address: string
    }[]
  }
  if (data.status !== 'OK' || !data.results?.length) return null
  const r = data.results[0]
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
  }
}
