# Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana

[![make.fun](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![rank](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/isnames2/tiny-bot-easy-2-beat/rank.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)
[![reward](https://make.fun/badge/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1/isnames2/tiny-bot-easy-2-beat/reward.svg)](https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1)

A tiny trading bot for the make.fun competition "Tiny Bot, Easy $2: Beat Buy-and-Hold on Solana".

Bounty page: https://make.fun/bounty/u-gorun-gadget-tiny-bot-easy-2-beat-a48f3ce1

## Strategy

Cross-sectional momentum with a cash default, over the 7-symbol Solana
universe (FARTCOIN, JITOSOL, POPCAT, RAY, SOL, WETH, WIF), on hourly bars:

- Every 12 bars, rank the universe by trailing 12-bar return.
- Buy the top 3, but only those whose 12-bar return is positive.
- Market filter: only buy when the equal-weight universe is itself rising
  over the same 12 bars. In a broad sell-off the bot holds cash instead of
  buying the least-bad losers.
- A position is sold when its 12-bar return turns negative, when it leaves
  the top 3, or when it falls 6% below its cost (stop-loss).
- Buys split the cash evenly over the incoming symbols, capped at the 25%
  per-symbol weight cap. A sell's proceeds fund buys on the next bar only.

Deterministic: no clock, no environment, no unseeded random. The two graded
executions match byte for byte.

## Local dev score

Graded with the kit's `grade-local` (`--driver process`) on the dev window
(136 hourly bars, 2026-11-19 → 2026-11-25, a broad sell-off):

| bot | net PnL (USDC) |
| --- | --- |
| **tiny-bot-easy-2-beat** | **+157.25** |
| macd-cci (best house baseline) | −20.22 |
| rsi-bollinger | −56.49 |
| adx-momentum | −114.42 |
| ema-cross | −173.04 |
| momentum | −268.23 |
| buy-and-hold | −869.34 |
| hold-cash | 0.00 (fails the 8-trade minimum) |

11 trades over 4 symbols, win rate 57%, max drawdown 1.7%, exposure 15%,
fees 35.56 USDC. Guardrails met. The 90% interval on the dev score is
+58.9 to +260.5 USDC.

The final window is a different 3 days, so the dev score is a guide, not a
promise: the bot's edge is that it sits in cash while the market falls and
rotates into the strongest names when it rises.

## Run

`main.ts` speaks the `agent-fun/bars-replay/v1` line protocol on stdin/stdout
via `vendor/makefun-bars.ts` (a byte-identical copy of the kit's
`sdk/makefun-bars.ts`). Node 22 built-ins only, no network, no files read
outside the repo.
