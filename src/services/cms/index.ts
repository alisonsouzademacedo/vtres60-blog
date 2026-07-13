import type { ContentRepository } from "./content-repository";
import { localContentRepository } from "@/repositories/local-content-repository";

// Único ponto de troca para Payload, Sanity, Strapi ou Supabase.
export const contentRepository: ContentRepository = localContentRepository;
