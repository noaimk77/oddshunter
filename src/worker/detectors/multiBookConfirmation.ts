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

  return {
    fires: true,
    confirmingCount: distinctMoves.length,
    bookmakers: distinctMoves.map((m) => m.bookmakerLabel),
    anchor,
    averagePriceChangePct,
  };
}
