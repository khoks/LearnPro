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
  TRACKS_ROOT,
  type LoadTrackOptions,
} from "./loader.js";
