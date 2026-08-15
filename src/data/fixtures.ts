import type { MarketType, Sport } from "@/types";

/**
 * Every competition, country, and club name below is entirely fictional.
 * Odds Hunter never pairs real teams into synthetic matches — see the
 * DemoDataBadge shown throughout the UI while this mock provider is active.
 */
export interface LeaguePool {
  id: string;
  sport: Sport;
  country: string;
  competition: string;
  marketType: MarketType;
  hasDraw: boolean;
  /** Team or player names; fixtures are drawn as consecutive pairs. */
  entrants: string[];
}

export const LEAGUE_POOLS: LeaguePool[] = [
  {
    id: "vantera-li",
    sport: "football",
    country: "Vantera",
    competition: "Liga Intermedia",
    marketType: "match-odds",
    hasDraw: true,
    entrants: [
      "Club Aurora",
      "Racing Norte",
      "Union Central",
      "Sportivo Azul",
      "Deportivo Real",
      "Atlético Vantera",
      "Sporting Meridian",
      "FC Halcón",
    ],
  },
  {
    id: "aurelia-2d",
    sport: "football",
    country: "Aurelia",
    competition: "Segunda División",
    marketType: "match-odds",
    hasDraw: true,
    entrants: [
      "Racing Kastel",
      "Athletic Central",
      "Deportivo Aurelia",
      "Union Marovia",
      "Sporting Norte",
      "Club Corvenna",
      "Estrella Roja",
      "Real Solantis",
    ],
  },
  {
    id: "norlund-1d",
    sport: "football",
    country: "Norlund",
    competition: "1. Divisjon",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["FK Brennheim", "IK Solvane", "SK Isleford", "FK Halveport", "IK Ostravia", "SK Dravenia"],
  },
  {
    id: "kastel-2l",
    sport: "football",
    country: "Kastel",
    competition: "Second League",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Union Deportiva", "Atlético Norlund", "Club Meridiano", "FC Aurora Sur", "Deportivo Sur", "Racing Vantera"],
  },
  {
    id: "isleford-c2",
    sport: "football",
    country: "Isleford",
    competition: "Championship Two",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Corvenna Rovers", "Halveport Town", "Solantis City", "Marovia Athletic", "Ostravia United", "Brennheim FC"],
  },
  {
    id: "marovia-2d",
    sport: "football",
    country: "Marovia",
    competition: "Second Division",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Club Dravenia", "Union Ostravia", "Real Corvenna", "Sportivo Norte", "Athletic Kastel", "FC Meridian"],
  },
  {
    id: "dravenia-lr",
    sport: "football",
    country: "Dravenia",
    competition: "Liga Regional",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Atlético Marovia", "Deportivo Vantera", "Racing Aurelia", "Club Solantis", "Union Aurora", "Sporting Kastel"],
  },
  {
    id: "solantis-pl",
    sport: "football",
    country: "Solantis",
    competition: "Provincial League",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["FC Norlund", "Athletic Isleford", "Real Meridian", "Deportivo Halveport", "Sporting Central", "Club Azul"],
  },
  {
    id: "corvenna-2t",
    sport: "football",
    country: "Corvenna",
    competition: "Second Tier",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Union Halveport", "Racing Solantis", "Deportivo Kastel", "Athletic Aurora", "Club Ostravia", "FC Central"],
  },
  {
    id: "brennheim-rl",
    sport: "football",
    country: "Brennheim",
    competition: "Regionalliga",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["SK Vantera", "FK Corvenna", "IK Marovia", "SK Aurelia", "FK Solantis", "IK Norte"],
  },
  {
    id: "halveport-n2",
    sport: "football",
    country: "Halveport",
    competition: "National League Two",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Meridian Wanderers", "Aurora Rangers", "Kastel Town", "Central Athletic", "Norlund City", "Dravenia FC"],
  },
  {
    id: "ostravia-2l",
    sport: "football",
    country: "Ostravia",
    competition: "II Liga",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Solvane Górnik", "Halveport Stal", "Marovia Concordia", "Brennheim Motor", "Isleford Podbeskid", "Corvenna Chrobry"],
  },
  {
    id: "kastonia-bl",
    sport: "basketball",
    country: "Kastonia",
    competition: "Basket League",
    marketType: "handicap",
    hasDraw: false,
    entrants: ["Kastonia Eagles", "Meridian Hawks", "Solvane Titans", "Aurora Wolves"],
  },
  {
    id: "rovanne-pl",
    sport: "basketball",
    country: "Rovanne",
    competition: "Premier League",
    marketType: "handicap",
    hasDraw: false,
    entrants: ["Rovanne Comets", "Vantera Storm", "Norlund Kings", "Central Bears"],
  },
  {
    id: "solvara-open",
    sport: "tennis",
    country: "Solvara",
    competition: "Solvara Open — Challenger",
    marketType: "match-odds",
    hasDraw: false,
    entrants: ["M. Doran", "A. Reyes", "K. Vantel", "T. Solberg", "J. Marek", "R. Kastel"],
  },
  {
    id: "ostravia-tt",
    sport: "table-tennis",
    country: "Ostravia",
    competition: "TT Series",
    marketType: "match-odds",
    hasDraw: false,
    entrants: ["N. Vasko", "P. Ilic", "M. Berget", "L. Nowak", "S. Kral", "V. Horvat"],
  },
];

export interface FixtureSeed {
  id: string;
  pool: LeaguePool;
  home: string;
  away: string;
  startOffsetMinutes: number; // minutes from "now" (mock reference time)
}

/** The flagship examples used throughout the demo are kept upcoming so their countdowns read naturally. */
const START_OFFSET_OVERRIDES: Record<string, number> = {
  "vantera-li-0": 102, // ~1h42m
  "aurelia-2d-0": 46,
  "norlund-1d-0": 187,
};

/** Deterministically pairs up entrants within each pool into fixtures. */
export function buildFixtureSeeds(): FixtureSeed[] {
  const seeds: FixtureSeed[] = [];
  let cursor = 0;
  for (const pool of LEAGUE_POOLS) {
    for (let i = 0; i < pool.entrants.length - 1; i += 2) {
      const home = pool.entrants[i];
      const away = pool.entrants[i + 1];
      const id = `${pool.id}-${i / 2}`;
      // Spread start times across a ±20h window so the scanner feels alive.
      const startOffsetMinutes = START_OFFSET_OVERRIDES[id] ?? -600 + ((cursor * 97) % 1200);
      seeds.push({
        id,
        pool,
        home,
        away,
        startOffsetMinutes,
      });
      cursor += 1;
    }
  }
  return seeds;
}
