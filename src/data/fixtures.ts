import type { MarketType, Sport } from "@/types";

/** A league/competition pool used to generate believable mock fixtures. */
export interface LeaguePool {
  id: string;
  sport: Sport;
  country: string;
  league: string;
  marketType: MarketType;
  hasDraw: boolean;
  /** Team or player names; fixtures are drawn as consecutive pairs. */
  entrants: string[];
}

export const LEAGUE_POOLS: LeaguePool[] = [
  {
    id: "py-di",
    sport: "football",
    country: "Paraguay",
    league: "División Intermedia",
    marketType: "match-odds",
    hasDraw: true,
    entrants: [
      "Club Fernando",
      "Resistencia",
      "Sportivo San Lorenzo",
      "Guaraní de Trinidad",
      "Fulgencio Yegros",
      "2 de Mayo",
      "Benjamín Aceval",
      "Sportivo Ameliano",
    ],
  },
  {
    id: "ar-pn",
    sport: "football",
    country: "Argentina",
    league: "Primera Nacional",
    marketType: "match-odds",
    hasDraw: true,
    entrants: [
      "Chaco For Ever",
      "Gimnasia",
      "Estudiantes (RC)",
      "Güemes",
      "Deportivo Maipú",
      "Almirante Brown",
      "Brown de Adrogué",
      "Chacarita Juniors",
    ],
  },
  {
    id: "fi-yk",
    sport: "football",
    country: "Finland",
    league: "Ykkönen",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["JäPS", "TPS", "EIF Ekenäs", "PK-35", "Musan Salama", "KTP Kotka", "AC Oulu", "FC Haka"],
  },
  {
    id: "ee-es",
    sport: "football",
    country: "Estonia",
    league: "Esiliiga",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Tammeka", "Kalev Tallinn", "Kuressaare", "Vändra Vaprus", "Legion", "Real Tartu"],
  },
  {
    id: "is-1d",
    sport: "football",
    country: "Iceland",
    league: "1. Deild",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Þróttur Reykjavík", "Leiknir", "Grótta", "Álftanes", "Fjölnir", "Selfoss"],
  },
  {
    id: "eg-2d",
    sport: "football",
    country: "Egypt",
    league: "Second Division",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Tersana", "El Mokawloon", "Haras El Hodoud", "Ghazl El Mahalla", "Aswan", "Baladeyet El Mahalla"],
  },
  {
    id: "vn-v2",
    sport: "football",
    country: "Vietnam",
    league: "V.League 2",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Long An", "Phù Đổng", "Bình Phước", "Đồng Nai", "Trẻ TP.HCM", "PVF-CAND"],
  },
  {
    id: "th-l2",
    sport: "football",
    country: "Thailand",
    league: "League 2",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Chiangmai United", "Uthai Thani", "Rayong FC", "Customs United", "Krabi FC", "Nakhon Pathom"],
  },
  {
    id: "br-sd",
    sport: "football",
    country: "Brazil",
    league: "Série D",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Retrô", "Central", "Sousa", "Maranhão", "ASA", "Confiança"],
  },
  {
    id: "ie-fd",
    sport: "football",
    country: "Ireland",
    league: "First Division",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Cork City", "Bray Wanderers", "Longford Town", "Cobh Ramblers", "Wexford", "Athlone Town"],
  },
  {
    id: "pl-2l",
    sport: "football",
    country: "Poland",
    league: "II Liga",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Chrobry Głogów", "Stal Rzeszów", "GKS Jastrzębie", "Concordia Elbląg", "Podbeskidzie", "Motor Lublin"],
  },
  {
    id: "en-nl",
    sport: "football",
    country: "England",
    league: "National League",
    marketType: "match-odds",
    hasDraw: true,
    entrants: ["Boreham Wood", "Solihull Moors", "Dagenham & Redbridge", "Aldershot Town", "Wealdstone", "Maidenhead United"],
  },
  {
    id: "gr-bl",
    sport: "basketball",
    country: "Greece",
    league: "Basket League",
    marketType: "handicap",
    hasDraw: false,
    entrants: ["Peristeri", "Kolossos Rodou", "Ionikos Nikaias", "Apollon Patras"],
  },
  {
    id: "lt-lkl",
    sport: "basketball",
    country: "Lithuania",
    league: "LKL",
    marketType: "handicap",
    hasDraw: false,
    entrants: ["Nevėžis", "Šiauliai", "Wolves Twinsbet", "Juventus Utena"],
  },
  {
    id: "itf-ant",
    sport: "tennis",
    country: "Turkey",
    league: "ITF M15 Antalya",
    marketType: "match-odds",
    hasDraw: false,
    entrants: ["A. Petrov", "D. Kovač", "M. Lindqvist", "T. Yamamoto", "R. Silva", "J. Dubois"],
  },
  {
    id: "tt-elite",
    sport: "table-tennis",
    country: "Poland",
    league: "TT Elite Series",
    marketType: "match-odds",
    hasDraw: false,
    entrants: ["K. Nowak", "P. Zieliński", "M. Bartos", "L. Novotny", "S. Krejčí", "V. Horvath"],
  },
];

export interface FixtureSeed {
  id: string;
  pool: LeaguePool;
  home: string;
  away: string;
  startOffsetMinutes: number; // minutes from "now" (mock reference time)
}

/** The three flagship examples from the product brief are kept upcoming so their countdowns read naturally. */
const START_OFFSET_OVERRIDES: Record<string, number> = {
  "py-di-0": 102, // ~1h42m — matches the "Match starts in 01:42:18" example
  "ar-pn-0": 46,
  "fi-yk-0": 187,
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
