/**
 * The real analysis stages MAEVE's CV service emits, presented in MAEVE's
 * editorial voice. ORDER MUST MATCH the backend stage array (7 stages) so
 * stageIndex from the API lines up 1:1 with the loader.
 */
export const CAPTURE_STAGES = [
  'READING YOUR PHOTOGRAPH',
  'ANALYZING THE IMAGE',
  'DETECTING GARMENTS',
  'ISOLATING THE PIECES',
  'CLEANING THE BACKGROUND',
  'UNDERSTANDING THE DETAILS',
  'PREPARING YOUR WARDROBE ENTRY',
] as const