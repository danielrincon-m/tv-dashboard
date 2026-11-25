# TV Dashboard

Full-screen grid of TradingView candlestick charts for a TV browser (built for a Samsung QN90C running Tizen).
Charts use TradingView's free Symbol Overview widget, which needs about half the memory of the Advanced Chart.
Plain HTML + CSS + JS: no build step, no libraries, no API keys.

Live page: https://danielrincon-m.github.io/tv-dashboard/

## Edit the symbols

Everything lives in the `CONFIG` object at the top of `app.js`:

| Field | What it does |
| --- | --- |
| `charts` | Charts in display order: `{ symbol: 'NASDAQ:NVDA', interval: 'D' }`. Use TradingView's `EXCHANGE:TICKER` (search the symbol on tradingview.com; it is in the page URL). |
| `interval` | Candle size: `'1'`, `'5'`, `'15'`, `'60'`, `'240'` (minutes), `'D'`, `'W'`, `'M'`, or hours such as `'4h'`. |
| `range` | Optional, per chart: how much history to show: `'1d'`, `'5d'`, `'1m'`, `'3m'`, `'6m'`, `'12m'`, `'60m'`, `'all'`. Defaults to `'1m'` for daily candles and `'5d'` for 30-minute to 4-hour ones; any other value falls back to the default. |
| `movingAverage` | Optional, per chart: draws a simple moving average over that many candles, e.g. `200` on daily candles for the 200-day average. Such a chart uses TradingView's heavier Advanced Chart widget, because the default widget drops its average on the first data update. |
| `columns`, `rows` | Grid size. Rows are added when the charts and the calendar don't fit. |
| `chartFontSize` | Size of the chart axis numbers. |
| `showQuotes` | Shows the price and daily % change of every chart symbol in the last column, stretched over the free cells. |
| `quoteSymbols` | Extra symbols shown only in the quotes list, for market context (VIX, 10-year Treasury yield, dollar index). Some symbols, such as `CBOE:VIX` or `TVC:US10Y`, show no data in free widgets. |
| `showCalendar` | Adds a cell with the upcoming medium and high importance US economic events. |
| `portfolioRefreshSeconds` | How often the purchases panel refreshes its prices. |
| `staggerSeconds` | Delay between widgets at start-up, so the TV doesn't load them all at once. |
| `loadTimeoutSeconds`, `retryAfterMinutes` | A widget that hasn't loaded after the timeout shows a message, and the page retries after that many minutes. |
| `maxWidgets` | Above this number of widgets the page shows a memory warning. |
| `locale` | TradingView language (`'es'`, `'en'`, ...). |
| `pixelShiftPixels`, `pixelShiftEveryMinutes` | Moves the whole grid up to that many pixels every few minutes, so the static lines and labels don't leave a ghost image on the TV. `0` turns it off. |

Commit and push to `main`; GitHub Pages publishes the change in about a minute.

## URL parameters

The URL overrides `CONFIG` without editing code:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `s` | `s=NASDAQ:QQQ,AMEX:VOO` | Symbols, comma separated. |
| `tf` | `tf=D,4h` | Interval per symbol, same order as `s`. Missing ones reuse the last given (or `D`). |
| `r` | `r=6m,1m` | Range per symbol, same order as the charts. |
| `layout` | `layout=2x1` | `columns x rows`. |

Examples:

- The previous 4 x 2 grid: `https://danielrincon-m.github.io/tv-dashboard/?layout=4x2`
- Two daily charts side by side: `https://danielrincon-m.github.io/tv-dashboard/?s=NASDAQ:QQQ,AMEX:VOO&tf=D,D&layout=2x1`
- Three charts plus the quotes cell: `https://danielrincon-m.github.io/tv-dashboard/?s=NASDAQ:NVDA,NASDAQ:ANT,BINANCE:BTCUSDT&tf=D,1h,4h&layout=2x2`

The quotes cell only appears when the layout has a free cell left after the charts.

## Your purchases

Add your purchases after a `#` in the link, and the calendar cell shows your average price, the current price and your gain per symbol, plus the total. Each purchase is the amount spent `@` the price paid; join a symbol's purchases with `+` and symbols with `,`:

`https://danielrincon-m.github.io/tv-dashboard/#buy=QQQ:1000@600+500@580,BTCUSDT:250@60000`

- Use the ticker shown on a chart (`QQQ`, `BTCUSDT`), or `EXCHANGE:TICKER` for a symbol without a chart.
- Everything after `#` stays in the browser: it is never sent to the server nor stored in this public repo. Keep the link as a bookmark on the TV.
- Prices come from TradingView's market screener, which needs no key but is not an official API: if it stops answering, the panel shows `—` and keeps your averages.

## Open it on the TV

1. Press **Home** on the remote and open the **Internet** app.
2. Select the address bar and type the page URL (with parameters, if you want a custom grid).
3. Open the browser menu and add it to **Bookmarks**, or set it as the **homepage** in the browser settings, so it opens in one click next time.
4. Select **Full screen** (top-right corner) to hide the browser bar. The remote's **Back** key leaves full screen.
5. Keep the screen on: in the TV settings turn off **Auto Protection Time** (screen saver) and **Auto Power Off**. Menu names vary by firmware; search for them in **Settings**.

## Notes

- An unknown symbol shows TradingView's own "Invalid symbol" notice inside its cell; the large label on top tells you which one it is.
- Each widget is an iframe. Samsung caps a TV app at 380 MB for 4K models; the page staggers widget start-up so ten load fine.
- To try it on a computer: `python3 -m http.server` in this folder, then open http://localhost:8000.
