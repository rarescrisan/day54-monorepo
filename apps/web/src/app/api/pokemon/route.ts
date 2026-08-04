import { z } from "zod";

export const pokemonQuerySchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export interface PokemonItem {
  id: number;
  name: string;
  spriteUrl: string;
}

export interface PokemonPage {
  items: PokemonItem[];
  // null when the last page has been served
  nextOffset: number | null;
}
