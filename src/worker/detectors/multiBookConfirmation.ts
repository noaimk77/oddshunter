/**
 * MULTI_BOOK_CONFIRMATION detector — spec point I: confirm a move when
 * several independent bookmakers shift on the same event/market/selection
 * close together in time. Pure function over a list of "this bookmaker's
 * market just fired ODDS_DROP or ODDS_RISE" records for one
 * (event, marketType, position) group — the worker (index.ts) is
 * responsible for grouping by that key, since only it knows how markets
 * map to events/selections in the database.
 *
 * Each bookmaker's odds already live as their own `Market` row (both
 * providers — api-football and betexplorer — encode one bookmaker per
 * Market, see their externalMarketId convention), so "independent
 * bookmaker" here means "independent Market row", not a guess.
 */

export interface BookmakerMove {
  marketId: string;
  selectionId: string;
  /** Human label if available (e.g. "BetInAsia") — falls back to an id string otherwise. */
  bookmakerLabel: string;
  priceChangePct: number;
  /** How long this book's price stayed at/below the drop threshold before
   *  this pass — the real substitute for a staked-amount figure we don't
   *  have access to (no exchange data in France): several books moving
   *  together AND fast is the closest legitimate proxy for "real money,
   *  not noise" (Noaim, 2026-08-22). */
  persistedForSec: number;
}

export interface MultiBookConfirmationConfig {
  /** Minimum number of independent bookmakers moving together to confirm. */
  minConfirmingBookmakers: number;
}

export const DEFAULT_MULTI_BOOK_CONFIRMATION_CONFIG: MultiBookConfirmationConfig = {
  minConfirmingBookmakers: 2,
};

export interface MultiBookConfirmationSignal {
  fires: true;
  confirmingCount: number;
  bookmakers: string[];
  /** The record with the largest |priceChangePct| — used as the anchor market/selection for the Signal row. */
  anchor: BookmakerMove;
  averagePriceChangePct: number;
  /** The fastest-moving confirming book — several books shifting together
   *  in a short window is more suspicious than the same shift spread over
   *  days, so this (not an average) is the headline timing figure. */
  fastestPersistedForSec: number;
  /** The book that has held the drop level the LONGEST — i.e. moved first,
   *  the others followed. In a steam move this is a strong hint about who
   *  had the information (Noaim, 2026-08-23, inspired by Suspicious Game's
   *  premium bot which surfaces originator info per alert). */
  firstMoverBookmaker: string;
  firstMoverPersistedForSec: number;
}

export interface MultiBookConfirmationRejection {
  fires: false;
  reason: "insufficient_data" | "below_threshold";
}

export type MultiBookConfirmationOutcome = MultiBookConfirmationSignal | MultiBookConfirmationRejection;

export function detectMultiBookConfirmation(
  moves: BookmakerMove[],
  config: MultiBookConfirmationConfig = DEFAULT_MULTI_BOOK_CONFIRMATION_CONFIG,
): MultiBookConfirmationOutcome {
  if (moves.length === 0) return { fires: false, reason: "insufficient_data" };

  // "Independent" — dedupe by market, not just by count of records, in case
  // a caller ever passes the same market twice in one pass.
  const byMarket = new Map<string, BookmakerMove>();
  for (const move of moves) byMarket.set(move.marketId, move);
  const distinctMoves = [...byMarket.values()];

  if (distinctMoves.length < config.minConfirmingBookmakers) {
    return { fires: false, reason: "below_threshold" };
  }

  const anchor = distinctMoves.reduce((biggest, m) =>
    Math.abs(m.priceChangePct) > Math.abs(biggest.priceChangePct) ? m : biggest,
  );
  const averagePriceChangePct = distinctMoves.reduce((sum, m) => sum + m.priceChangePct, 0) / distinctMoves.length;
  const fastestPersistedForSec = Math.min(...distinctMoves.map((m) => m.persistedForSec));
  const firstMover = distinctMoves.reduce((longest, m) =>
    m.persistedForSec > longest.persistedForSec ? m : longest,
  );

  return {
    fires: true,
    confirmingCount: distinctMoves.length,
    bookmakers: distinctMoves.map((m) => m.bookmakerLabel),
    anchor,
    averagePriceChangePct,
    fastestPersistedForSec,
    firstMoverBookmaker: firstMover.bookmakerLabel,
    firstMoverPersistedForSec: firstMover.persistedForSec,
  };
}
