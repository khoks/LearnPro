import { z } from "zod";

export const TrackLanguageSchema = z.enum(["python", "typescript"]);
export type TrackLanguage = z.infer<typeof TrackLanguageSchema>;

const KEBAB_CASE = /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/;

export const TrackSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "track slug must be lowercase kebab-case");

export const ConceptSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "concept slug must be lowercase kebab-case");

export const ProblemRefSlugSchema = z
  .string()
  .min(1)
  .regex(KEBAB_CASE, "problem slug ref must be lowercase kebab-case");

export const ConceptCardSchema = z.object({
  slug: ConceptSlugSchema,
  name: z.string().min(1),
  summary: z.string().min(1),
  prerequisite_concept_slugs: z.array(ConceptSlugSchema),
  seed_problem_slugs: z.array(ProblemRefSlugSchema).min(1),
});
export type ConceptCard = z.infer<typeof ConceptCardSchema>;

export const TrackSchema = z.object({
  slug: TrackSlugSchema,
  name: z.string().min(1),
  language: TrackLanguageSchema,
  description: z.string().min(1),
  ordered_concepts: z.array(ConceptCardSchema).min(1),
});
export type Track = z.infer<typeof TrackSchema>;
