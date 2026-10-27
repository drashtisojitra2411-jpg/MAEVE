/** Taxonomy for a garment's role in an outfit. */
export type GarmentCategory =
  | 'shirt'
  | 'tops'
  | 'bottoms'
  | 'dresses'
  | 'traditional'
  | 'outerwear'
  | 'footwear'

export type GarmentPattern =
  | 'solid'
  | 'striped'
  | 'floral'
  | 'check'
  | 'printed'
  | 'textured'

export type GarmentStyle =
  | 'casual'
  | 'formal'
  | 'ethnic'
  | 'sporty'
  | 'evening'
  | 'smart-casual'

/**
 * A single piece in a user's wardrobe. Every field reflects real data:
 * the item is owned by exactly one user, and attribute values are either
 * produced by the connected CV pipeline or left null — never fabricated.
 *
 * `imageUrl` is the isolated garment image (segmentation output).
 * `originalImageUrl` is the photograph the user uploaded.
 */
export interface WardrobeItem {
  id: string
  userId: string
  /** Human-readable title; editable by the user. */
  name: string
  /** Isolated garment image. */
  imageUrl: string
  /** Full-canvas isolated mask image if distinct from thumbnail. */
  isolatedImageUrl?: string
  /** Tight-cropped thumbnail image. */
  thumbnailUrl?: string
  /** The user's original uploaded photograph. */
  originalImageUrl?: string
  category: GarmentCategory | null
  /** The CV model's raw class name (e.g. short_sleeved_shirt). */
  subcategory?: string | null
  color: string | null
  colorHex?: string | null
  secondaryColor?: string | null
  /** Pixel-reader confidence in the dominant colour, 0..1 (null = not measured). */
  colorConfidence?: number | null
  pattern?: GarmentPattern | null
  style?: GarmentStyle | null
  material?: string | null
  sleeve?: string | null
  length?: string | null
  season?: string | null
  weatherSuitability?: string | null
  /** Model-generated classification confidence — null until real inference runs. */
  confidence: number | null
  /** True when the model's confidence was below the confirm threshold. */
  needsUserInput?: boolean
  /** True once the user edited a model-suggested attribute before saving. */
  userCorrected?: boolean
  timesWorn: number
  lastWornAt?: string | null
  createdAt: number
  updatedAt: number
}

/**
 * Alias kept for readability in components that render a wardrobe piece.
 */
export type Garment = WardrobeItem

/** CV-detected object geometry. */
export interface DetectionBox {
  x: number
  y: number
  width: number
  height: number
}

/** One garment discovered by the CV pipeline inside an uploaded photograph. */
export interface DetectedGarment {
  /** Stable id used by the backend for this candidate. */
  id?: string
  /** Isolated garment image (transparent background, server-served). */
  imageUrl?: string
  /** Square-ish mask-cropped thumbnail. */
  thumbnailUrl?: string
  /** The uploaded photograph as served by the backend. */
  originalImageUrl?: string
  category?: GarmentCategory | null
  /** The model's raw class name (e.g. short_sleeved_shirt). */
  subcategory?: string | null
  color?: string | null
  colorHex?: string | null
  secondaryColor?: string | null
  /** Pixel-reader confidence in the dominant colour, 0..1. */
  colorConfidence?: number | null
  pattern?: GarmentPattern | null
  material?: string | null
  style?: GarmentStyle | null
  sleeve?: string | null
  length?: string | null
  season?: string | null
  /** True when the model's confidence is below the confirm threshold. */
  needsUserInput?: boolean
  confidence?: number | null
  boundingBox?: DetectionBox | null
  segmentationMask?: string | null
}

/** Honest end-states of a real garment-analysis run. */
export type GarmentAnalysisStatus =
  | 'complete' // model found pieces and at least one is confident
  | 'no-detection' // model ran and found nothing
  | 'low-confidence' // pieces found, but none above the confirm threshold
  | 'failed' // the request was rejected (bad/oversize file, expired job)
  | 'unreachable' // the backend could not be reached at all
  | 'cv-unavailable' // backend is up but the analysis worker failed
  | 'unauthenticated' // no valid session — the user must sign in

/**
 * Normalized output of `garmentAnalysisService`. The frontend never cares
 * which model produced this — YOLO, SAM, U2-Net, rembg, GroundingDINO etc.
 * Every field is the result of real inference; nothing is ever fabricated.
 */
export interface GarmentAnalysisResult {
  status: GarmentAnalysisStatus
  /** Reason when the service could not analyse the photograph. */
  message?: string
  garments: DetectedGarment[]
  /** Which real model produced this result. */
  model?: string
  /** Total analysis stages (used for progress rendering). */
  totalStages?: number
  image?: { width: number; height: number }
}

/** A composed outfit — item references come from user wardrobe records only. */
export interface ComposedLook {
  id: string
  items: WardrobeItem[]
  reasoning: string
  occasion: string
  createdAt: number
}

/** A historical look record, persisted per user. */
export interface LookRecord {
  id: string
  userId: string
  occasion: string
  itemIds: string[]
  reasoning: string
  createdAt: number
}

/** Structured personal style profile preferences. */
export interface StylePreferences {
  preferredStyles?: string[]
  favoriteColors?: string[]
  avoidColors?: string[]
  formality?: 'casual' | 'smart-casual' | 'formal' | string | null
  comfort?: string[] | string | null
  layering?: 'minimal' | 'moderate' | 'layered' | string | null
  typicalOccasions?: string[]
  silhouettes?: string[]
}

/** Styling preferences accepted by the rule-based engine. */
export interface LookPreferences extends StylePreferences {
  style?: string | null
  comfort?: string[] | string | null
}

/**
 * A faithful snapshot of the real weather at the moment a look was composed.
 * Every field comes from the live Open-Meteo fetch; nothing is estimated.
 */
export interface WeatherSnapshot {
  locationName?: string | null
  temperature?: number | null
  feelsLike?: number | null
  humidity?: number | null
  precipitationProbability?: number | null
  precipitation?: number | null
  windSpeed?: number | null
  condition?: string | null
  icon?: string | null
  weatherCode?: number | null
  updatedAt?: number | null
}

export interface PieceScore {
  itemId: string
  score: number
  occasion?: number | null
  weather?: number | null
  preference?: number | null
}

/**
 * A look produced by the backend's rule-based `recommendOutfit`. Items are a
 * snapshot of the real wardrobe records used (so history stays renderable even
 * after a piece is deleted). `score` and `breakdown` are transparent rules
 * scores — never model confidence.
 */
export interface GeneratedLook {
  id: string
  occasion: string
  itemIds: string[]
  items: (WardrobeItem & { isAvailable?: boolean })[]
  explanation: string[]
  score: number | null
  breakdown: {
    occasion: number | null
    weather: number | null
    colour: number | null
    preference: number | null
    style?: number | null
    pattern?: number | null
  }
  pieceScores?: PieceScore[]
  feedback?: 'like' | 'dislike' | null
  rating?: number | null
  incomplete?: boolean
  isIncomplete?: boolean
  missingCategories?: string[]
  missingItemIds?: string[]
  weather: WeatherSnapshot
  preferences: LookPreferences
  createdAt: number
}

export interface RecommendResult {
  look: GeneratedLook | null
  recommendations: GeneratedLook[]
  missingCategories?: string[]
  reason?: string
}

/** Result of recording a wear event on wardrobe pieces. */
export interface WearEventResult {
  success?: boolean
  ok?: boolean
  updated: number
  items?: WardrobeItem[]
  recorded?: boolean
  wornAt?: string
  timestamp?: string
  deduped?: boolean
  duplicatePrevented?: boolean
}

/** Saved per-account settings (location + styling prefs) on the backend. */
export interface ProfileSettings {
  location: {
    name: string
    region: string
    country: string
    latitude: number
    longitude: number
  } | null
  style: string | null
  comfort: string | null
  theme: string | null
  preferences?: StylePreferences
  updatedAt?: number | null
}