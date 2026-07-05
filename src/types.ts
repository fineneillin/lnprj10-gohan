export interface Bindings {
  GOOGLE_MAPS_API_KEY: string
  ASSETS: Fetcher
}

export interface NearbyResult {
  id: string
  name: string
  rating: number | null
  userRatingCount: number | null
  priceLevel: string | null
  primaryType: string | null
  address: string | null
  lat: number
  lng: number
  openNow: boolean | null
  distanceMeters: number
  mapsUri: string | null
  photoName: string | null
  score: number
}

export interface NearbyQuery {
  lat: number
  lng: number
  radius: number
  includedTypes: string[]
  openNow: boolean
}
