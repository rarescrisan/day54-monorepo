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

// Not an env var: the URL is neither a secret nor environment-dependent, and
// tests substitute the upstream at the network boundary (MSW) — see RFC 0001.
const POKEAPI_BASE_URL = "https://pokeapi.co/api/v2/pokemon";
const SPRITE_BASE_URL =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

interface PokeApiListResponse {
  next: string | null;
  results: Array<{ name: string; url: string }>;
}

// PokeAPI's list items carry no id field; it is the trailing segment of the
// item URL (`…/api/v2/pokemon/25/`).
function idFromItemUrl(url: string): number {
  return Number(url.split("/").filter(Boolean).at(-1));
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = pokemonQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return Response.json(
      { error: z.prettifyError(parsed.error) },
      { status: 400 },
    );
  }

  const { offset, limit } = parsed.data;
  try {
    const upstream = await fetch(
      `${POKEAPI_BASE_URL}?offset=${offset}&limit=${limit}`,
    );
    if (!upstream.ok) {
      return Response.json(
        { error: `Upstream responded with ${upstream.status}` },
        { status: 502 },
      );
    }
    const data = (await upstream.json()) as PokeApiListResponse;
    const page: PokemonPage = {
      items: data.results.map(({ name, url }) => {
        const id = idFromItemUrl(url);
        return { id, name, spriteUrl: `${SPRITE_BASE_URL}/${id}.png` };
      }),
      nextOffset: data.next === null ? null : offset + limit,
    };
    return Response.json(page);
  } catch {
    return Response.json({ error: "Upstream request failed" }, { status: 502 });
  }
}
