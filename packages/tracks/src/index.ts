export const PACKAGE_NAME = "@learnpro/tracks";

export {
  ConceptCardSchema,
  ConceptSlugSchema,
  ProblemRefSlugSchema,
  TrackLanguageSchema,
  TrackSchema,
  TrackSlugSchema,
  type ConceptCard,
  type Track,
  type TrackLanguage,
} from "./schema.js";

export {
  loadTrack,
  PYTHON_FUNDAMENTALS_PATH,
  seedTrack,
  TRACKS_ROOT,
  TYPESCRIPT_FUNDAMENTALS_PATH,
  type LoadTrackOptions,
  type SeedTrackOptions,
  type SeedTrackResult,
} from "./loader.js";
