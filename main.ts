// Tiny momentum-rotation bot for the make.fun bars-replay competition.
//
// Strategy: cross-sectional momentum with a cash default.
// - Every 12 bars, rank the universe by trailing 12-bar return.
// - Buy the top 3 symbols, but only those whose 12-bar return is positive:
//   on a falling market the bot sits in cash instead of catching knives.
// - A position is sold when its 12-bar return turns negative, when it is
//   no longer in the top 3, or when it falls 6% below its cost (stop-loss).
// - Buys split the cash evenly over the incoming symbols, capped at the
//   25% per-symbol weight cap. Sells settle first; their proceeds fund
//   the buys on the next bar (a sell never funds a buy in the same reply).
// - Deterministic: no clock, no environment, no unseeded random. The two
//   graded executions must match byte for byte.
//
// Laid out like the house baselines: the grader runs `node /bot/main.ts`
// with this directory mounted at /bot; vendor/makefun-bars.ts is a
// byte-identical copy of the kit's sdk/makefun-bars.ts.

import { BPS, runBars, type BarsState, type BuyInput, type OrderInput } from './vendor/makefun-bars.ts';

const LOOKBACK_BARS = 12; // bars of trailing return used to rank symbols and
// to judge the market: one lookback keeps the bot's read of the tape
// consistent, and a 12-bar window is slow enough to dodge hourly noise
const REBALANCE_EVERY = 12; // bars between rebalances
const TOP_N = 3; // most symbols held at once
const MIN_RETURN_BPS = 0n; // only buy a symbol whose trailing return is positive
const STOP_BPS = 600n; // sell a position 6% below its cost
const MAX_SLIPPAGE_BPS = 10_000; // wide open, like the house baselines: never rejected on slippage

/** Each symbol's latest close as of every batch so far (null before its first bar). */
const history = new Map<string, (bigint | null)[]>();
/** Symbols chosen on the last rebalance bar, to buy once the sells have filled. */
let pendingBuys: string[] | null = null;
/** Next batch seq at which a rebalance happens. */
let nextRebalance = LOOKBACK_BARS;

/** Trailing `lookback` return in bps, or null without enough history. */
function trailingReturnBps(symbol: string, lookback: number): bigint | null {
  const closes = history.get(symbol) ?? [];
  if (closes.length <= lookback) return null;
  const now = closes[closes.length - 1]!;
  const then = closes[closes.length - 1 - lookback]!;
  if (now === null || then === null || then === 0n) return null;
  return ((now - then) * 10_000n) / then;
}

function buyOrders(state: BarsState, symbols: readonly string[]): BuyInput[] {
  const { caps, fees } = state.hello;
  const coming = symbols.filter((s) => !state.positions.has(s) && state.close(s) !== null);
  if (coming.length === 0) return [];
  const room = Math.min(coming.length, caps.max_open_positions, caps.max_orders_per_bar);
  const chosen = coming.slice(0, room);
  const even = state.cash / BigInt(chosen.length);
  const byWeight = (BigInt(caps.max_weight_bps) * state.equity) / BPS;
  const size = even < byWeight ? even : byWeight;
  if (size < BigInt(fees.min_notional_quote_units)) return [];
  return chosen.map((symbol): BuyInput => ({ side: 'buy', symbol, notional_quote_units: size, max_slippage_bps: MAX_SLIPPAGE_BPS }));
}

await runBars({
  onBatch(state, batch) {
    for (const { symbol } of state.hello.symbols) {
      const closes = history.get(symbol) ?? [];
      closes.push(state.close(symbol));
      history.set(symbol, closes);
    }
    if (state.warmingUp) return [];

    // Stop-loss: sell any position worth 6% less than it cost.
    const stops: OrderInput[] = [];
    for (const [symbol, holding] of state.positions) {
      if (holding.qty === 0n) continue;
      const value = state.value(symbol, holding.qty);
      if (value * 10_000n < holding.cost * (10_000n - STOP_BPS)) {
        stops.push({ side: 'sell', symbol, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }
    if (stops.length > 0) return stops;

    // Buys queued by the previous rebalance's sells: the proceeds are in cash now.
    if (pendingBuys !== null) {
      const orders = buyOrders(state, pendingBuys);
      pendingBuys = null;
      return orders;
    }

    if (batch.seq < nextRebalance) return [];
    nextRebalance = batch.seq + REBALANCE_EVERY;

    const ranked: { symbol: string; ret: bigint }[] = [];
    let marketSum = 0n;
    let marketCount = 0;
    for (const { symbol } of state.hello.symbols) {
      const ret = trailingReturnBps(symbol, LOOKBACK_BARS);
      if (ret !== null) ranked.push({ symbol, ret });
      const mret = trailingReturnBps(symbol, LOOKBACK_BARS);
      if (mret !== null) {
        marketSum += mret;
        marketCount++;
      }
    }
    // Market filter: only buy when the equal-weight universe is itself
    // rising over the lookback. In a broad sell-off the bot holds cash
    // instead of buying the least-bad losers.
    const marketUp = marketCount > 0 && marketSum / BigInt(marketCount) > 0n;
    // Best trailing return first; ties keep universe order (sort is stable).
    ranked.sort((a, b) => {
      if (a.ret !== b.ret) return a.ret > b.ret ? -1 : 1;
      return 0;
    });
    const want = marketUp
      ? ranked.slice(0, TOP_N).filter((x) => x.ret > MIN_RETURN_BPS).map((x) => x.symbol)
      : [];

    const sells: OrderInput[] = [];
    for (const [symbol, holding] of state.positions) {
      if (!want.includes(symbol)) {
        sells.push({ side: 'sell', symbol, qty: holding.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
      }
    }
    if (sells.length > 0) {
      pendingBuys = want;
      return sells;
    }
    return buyOrders(state, want);
  },
});
