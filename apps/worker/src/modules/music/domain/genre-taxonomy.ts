/**
 * PartyQueue's expandable DJ-oriented genre vocabulary.
 *
 * This is an application taxonomy, not Spotify's catalogue taxonomy. Tracks may
 * belong to multiple genres/subgenres; aliases support guest-friendly wording.
 * Keep IDs stable because preferences and aggregated feedback will reference them.
 */
export type MusicSubgenre = {
  id: string;
  label: string;
  aliases: readonly string[];
};

export type MusicGenre = {
  id: string;
  label: string;
  description: string;
  subgenres: readonly MusicSubgenre[];
};

const subgenres = (items: readonly [string, string, ...string[]][]): readonly MusicSubgenre[] =>
  items.map(([id, label, ...aliases]) => ({ id, label, aliases }));

export const MUSIC_GENRES: readonly MusicGenre[] = [
  {
    id: "disco-funk-soul",
    label: "Disco, Funk & Soul",
    description: "Groovy, soulful and feel-good dance music.",
    subgenres: subgenres([
      ["disco", "Disco"], ["nu-disco", "Nu-Disco"], ["italo-disco", "Italo Disco"],
      ["funk", "Funk"], ["soul", "Soul"], ["motown", "Motown"], ["boogie", "Boogie"],
      ["yacht-rock", "Yacht Rock"], ["modern-soul", "Modern Soul"],
    ]),
  },
  {
    id: "electronic-dance",
    label: "Electronic & Dance",
    description: "Electronic club sounds, dance anthems and rave styles.",
    subgenres: subgenres([
      ["house", "House"], ["deep-house", "Deep House"], ["tech-house", "Tech House"],
      ["progressive-house", "Progressive House"], ["techno", "Techno"], ["trance", "Trance"],
      ["eurodance", "Eurodance"], ["edm", "EDM"], ["big-room", "Big Room"],
      ["hardstyle", "Hardstyle"], ["hardcore", "Hardcore"], ["drum-and-bass", "Drum & Bass"],
      ["dubstep", "Dubstep"], ["breakbeat", "Breakbeat"], ["garage", "UK Garage"],
      ["electro", "Electro"], ["ambient-electronic", "Ambient Electronic"],
    ]),
  },
  {
    id: "rock-alternative",
    label: "Rock & Alternative",
    description: "Guitar-driven classics, alternative and heavier sounds.",
    subgenres: subgenres([
      ["classic-rock", "Classic Rock"], ["hard-rock", "Hard Rock"], ["pop-rock", "Pop Rock"],
      ["indie-rock", "Indie Rock"], ["alternative-rock", "Alternative Rock"], ["punk", "Punk"],
      ["grunge", "Grunge"], ["metal", "Metal"], ["glam-rock", "Glam Rock"],
      ["britpop", "Britpop"], ["new-wave", "New Wave"], ["ska", "Ska"],
    ]),
  },
  {
    id: "hip-hop-rnb",
    label: "Hip-Hop, R&B & Urban",
    description: "Rap, rhythm and blues and urban dance styles.",
    subgenres: subgenres([
      ["old-school-hip-hop", "Old School Hip-Hop"], ["hip-hop", "Hip-Hop"], ["rap", "Rap"],
      ["trap", "Trap"], ["rnb", "R&B"], ["new-jack-swing", "New Jack Swing"],
      ["dancehall", "Dancehall"], ["reggaeton", "Reggaeton"], ["afrobeats", "Afrobeats"],
      ["funk carioca", "Funk Carioca"],
    ]),
  },
  {
    id: "pop-charts",
    label: "Pop & Charts",
    description: "Mainstream hits, singalongs and synth-driven pop.",
    subgenres: subgenres([
      ["80s-pop", "80s Pop"], ["90s-pop", "90s Pop"], ["00s-pop", "00s Pop"],
      ["10s-pop", "10s Pop"], ["current-pop", "Current Pop"], ["synthpop", "Synthpop"],
      ["europop", "Europop"], ["dance-pop", "Dance Pop"], ["teen-pop", "Teen Pop"],
      ["power-pop", "Power Pop"], ["chart-hits", "Chart Hits"],
    ]),
  },
  {
    id: "latin-world",
    label: "Latin & World",
    description: "Latin rhythms and music from around the world.",
    subgenres: subgenres([
      ["salsa", "Salsa"], ["merengue", "Merengue"], ["bachata", "Bachata"],
      ["latin-pop", "Latin Pop"], ["cumbia", "Cumbia"], ["samba", "Samba"],
      ["brazilian", "Brazilian"], ["afro-house", "Afro House"], ["k-pop", "K-Pop"],
      ["world-fusion", "World Fusion"],
    ]),
  },
  {
    id: "country-folk",
    label: "Country & Folk",
    description: "Country, roots, folk and traditional party singalongs.",
    subgenres: subgenres([
      ["country", "Country"], ["country-rock", "Country Rock"], ["bluegrass", "Bluegrass"],
      ["folk", "Folk"], ["americana", "Americana"], ["irish-folk", "Irish Folk"],
      ["celtic", "Celtic"], ["folk-rock", "Folk Rock"],
    ]),
  },
  {
    id: "schlager-party",
    label: "Schlager & Feest",
    description: "Party classics, local favourites and singalong music.",
    subgenres: subgenres([
      ["schlager", "Schlager"], ["apres-ski", "Après-Ski"], ["party-classics", "Party Classics"],
      ["dutch-language", "Nederlandstalig"], ["flemish-classics", "Vlaamse Klassiekers"],
      ["german-hits", "Duitse Hits"], ["guilty-pleasures", "Foute Hits"],
      ["carnival", "Carnaval"], ["polonaise", "Polonaise"], ["folk-party", "Ambiance"],
    ]),
  },
  {
    id: "jazz-blues-classics",
    label: "Jazz, Blues & Classics",
    description: "Jazz-rooted, blues, orchestral and timeless standards.",
    subgenres: subgenres([
      ["jazz", "Jazz"], ["swing", "Swing"], ["blues", "Blues"], ["gospel", "Gospel"],
      ["classical", "Classical"], ["big-band", "Big Band"], ["easy-listening", "Easy Listening"],
      ["lounge", "Lounge"],
    ]),
  },
] as const;

export const MUSIC_DECADES = [
  { id: "60s", label: "60s" },
  { id: "70s", label: "70s" },
  { id: "80s", label: "80s" },
  { id: "90s", label: "90s" },
  { id: "00s", label: "00s" },
  { id: "10s", label: "10s" },
  { id: "20s", label: "20s" },
] as const;

export const MUSIC_MOODS = [
  "feel-good", "nostalgic", "energetic", "romantic", "dark", "playful",
  "anthemic", "laid-back", "singalong", "unexpected",
] as const;

export const MUSIC_ENERGY_SCALE = { min: 1, max: 10 } as const;
export const MUSIC_DANCEABILITY_SCALE = { min: 1, max: 10 } as const;

/** Flattened stable lookup used by validation and guest-facing preference controls. */
export function listMusicGenres(): Array<{ id: string; label: string; parentId: string | null }> {
  return MUSIC_GENRES.flatMap(genre => [
    { id: genre.id, label: genre.label, parentId: null },
    ...genre.subgenres.map(item => ({ id: item.id, label: item.label, parentId: genre.id })),
  ]);
}

/** Case-insensitive lookup across stable IDs, labels and guest-friendly aliases. */
export function findMusicGenreId(value: string): string | null {
  const normalized = value.trim().toLocaleLowerCase("nl-BE");
  if (!normalized) return null;
  for (const genre of MUSIC_GENRES) {
    if ([genre.id, genre.label, ...genre.subgenres.flatMap(item => [item.id, item.label, ...item.aliases])]
      .some(candidate => candidate.toLocaleLowerCase("nl-BE") === normalized)) {
      return genre.id;
    }
    const match = genre.subgenres.find(item =>
      [item.id, item.label, ...item.aliases].some(candidate => candidate.toLocaleLowerCase("nl-BE") === normalized));
    if (match) return match.id;
  }
  return null;
}
