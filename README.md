# TV Dashboard

Full-screen grid of TradingView charts for a TV browser (built for a Samsung QN90C running Tizen).
Plain HTML + CSS + JS: no build step, no libraries, no API keys.

Live page: https://danielrincon-m.github.io/tv-dashboard/

## Edit the symbols

Everything lives in the `CONFIG` object at the top of `app.js`:

| Field | What it does |
| --- | --- |
| `charts` | Charts in display order: `{ symbol: 'NASDAQ:NVDA', interval: 'D' }`. Use TradingView's `EXCHANGE:TICKER` (search the symbol on tradingview.com; it is in the page URL). |
| `interval` | `'1'`, `'5'`, `'15'`, `'60'`, `'240'` (minutes), `'D'`, `'W'`, `'M'`, or hours such as `'4h'`. |
| `columns`, `rows` | Grid size. Rows are added when the charts don't fit. |
| `showQuotes` | Fills the first free cell with the price and daily % change of every chart symbol. |
| `reloadEveryHours` | Full page reload, so the TV browser doesn't hang after running all day. |
| `loadTimeoutSeconds`, `retryAfterMinutes` | A widget that hasn't loaded after the timeout shows a message, and the page retries after that many minutes. |
| `maxWidgets` | Above this number of widgets the page shows a memory warning. |
| `locale` | TradingView language (`'es'`, `'en'`, ...). |

Commit and push to `main`; GitHub Pages publishes the change in about a minute.

## URL parameters

The URL overrides `CONFIG` without editing code:

| Parameter | Example | Meaning |
| --- | --- | --- |
| `s` | `s=NASDAQ:QQQ,AMEX:VOO` | Symbols, comma separated. |
| `tf` | `tf=D,4h` | Interval per symbol, same order as `s`. Missing ones reuse the last given (or `D`). |
| `layout` | `layout=2x1` | `columns x rows`. |

Examples:

- Two daily charts side by side: `https://danielrincon-m.github.io/tv-dashboard/?s=NASDAQ:QQQ,AMEX:VOO&tf=D,D&layout=2x1`
- Three charts plus the quotes cell: `https://danielrincon-m.github.io/tv-dashboard/?s=NASDAQ:NVDA,NASDAQ:ANT,BINANCE:BTCUSDT&tf=D,1h,4h&layout=2x2`

The quotes cell only appears when the layout has a free cell left after the charts.

## Open it on the TV

1. Press **Home** on the remote and open the **Internet** app.
2. Select the address bar and type the page URL (with parameters, if you want a custom grid).
3. Open the browser menu and add it to **Bookmarks**, or set it as the **homepage** in the browser settings, so it opens in one click next time.
4. Keep the screen on: in the TV settings turn off **Auto Protection Time** (screen saver) and **Auto Power Off**. Menu names vary by firmware; search for them in **Settings**.

## Notes

- An unknown symbol shows TradingView's own "This symbol doesn't exist" notice inside its cell; the large label on top tells you which one it is.
- Each widget is an iframe. Eight is a safe number for the TV browser.
- To try it on a computer: `python3 -m http.server` in this folder, then open http://localhost:8000.
