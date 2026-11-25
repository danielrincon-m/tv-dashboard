'use strict';

const CONFIG = {
  columns: 4,
  rows: 3,
  // interval: TradingView codes ('1', '15', '60', '240', 'D', 'W', 'M') or hours such as '4h'.
  // range (optional): how much history to show: '1d', '5d', '1m', '3m', '6m', '12m', '60m' or 'all'.
  // movingAverage (optional): draws a simple moving average over that many candles, using the
  // Advanced Chart widget, because Symbol Overview drops its average on the first data update.
  charts: [
    { symbol: 'NASDAQ:QQQ', interval: '30' },
    { symbol: 'NASDAQ:VXUS', interval: '30' },
    { symbol: 'AMEX:VOO', interval: '30' },
    { symbol: 'NASDAQ:NVDA', interval: '30' },
    { symbol: 'NASDAQ:SPCX', interval: '30' },
    { symbol: 'NASDAQ:ANT', interval: '30' },
    { symbol: 'BINANCE:BTCUSDT', interval: '60' },
    // Long-term trend of the Nasdaq 100: daily candles with the 200-day moving average.
    { symbol: 'NASDAQ:QQQ', interval: 'D', range: '12m', movingAverage: 200 },
  ],
  chartFontSize: 18,
  // Shows price and daily change of every chart symbol in the last column, over the free cells.
  showQuotes: true,
  // Market context shown only in the quotes list: volatility (VIX), 10-year Treasury yield
  // (FRED's daily close; the live TVC:US10Y has no data in free widgets) and the US dollar index.
  quoteSymbols: ['CAPITALCOM:VIX', 'FRED:DGS10', 'CAPITALCOM:DXY'],
  // Upcoming medium and high importance US economic events (Fed, inflation, jobs). Its cell shows
  // your purchases instead when the link carries them (see readPositions).
  showCalendar: true,
  portfolioRefreshSeconds: 60,
  locale: 'es',
  // Widgets start one after another so the TV doesn't boot them all at once.
  staggerSeconds: 1,
  retryAfterMinutes: 5,
  loadTimeoutSeconds: 30,
  // Samsung caps a TV app at 380 MB; more widgets than this shows a warning.
  maxWidgets: 10,
  // Moves the whole grid up to this many pixels now and then, so lines and labels don't sit on the
  // same pixels all day and leave a ghost image on the screen. 0 turns it off.
  pixelShiftPixels: 4,
  pixelShiftEveryMinutes: 5,
};

const EMBED_URL = 'https://s3.tradingview.com/external-embedding/';
const CHART_SCRIPT_URL = EMBED_URL + 'embed-widget-symbol-overview.js';
const ADVANCED_CHART_SCRIPT_URL = EMBED_URL + 'embed-widget-advanced-chart.js';
const QUOTES_SCRIPT_URL = EMBED_URL + 'embed-widget-market-overview.js';
const CALENDAR_SCRIPT_URL = EMBED_URL + 'embed-widget-events.js';
// TradingView's own market screener: no key and readable from a web page, but undocumented.
const SCANNER_URL = 'https://scanner.tradingview.com/global/scan';
// Measured size of the Market Overview list, used to zoom it until every row fills the cell.
const QUOTES_ROW_PX = 60;
const QUOTES_HEADER_PX = 24;
const QUOTES_MAX_ZOOM = 2;
// The only ranges Symbol Overview accepts; any other value leaves the chart loading forever.
const RANGES = new Set(['1d', '5d', '1m', '3m', '6m', '12m', '60m', 'all']);
const UP_COLOR = '#089981';
const DOWN_COLOR = '#f23645';

function splitList(value) {
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [];
}

function toTradingViewInterval(value) {
  const text = String(value).trim();
  const hours = /^(\d+)h$/i.exec(text);
  if (hours) {
    return String(Number(hours[1]) * 60);
  }
  return /^1?[dw]$/i.test(text) ? text.slice(-1).toUpperCase() : text;
}

/** A range that shows a few dozen candles of the given interval. */
function defaultRange(interval) {
  const ranges = { D: '1m', W: '12m', M: '60m' };
  if (ranges[interval]) {
    return ranges[interval];
  }
  return Number(interval) >= 30 ? '5d' : '1d';
}

function intervalLabel(interval) {
  if (/^[DWM]$/.test(interval)) {
    return '1' + interval;
  }
  const minutes = Number(interval);
  return minutes % 60 === 0 ? minutes / 60 + 'H' : minutes + 'm';
}

function tickerOf(symbol) {
  return symbol.split(':').pop();
}

/**
 * Merges CONFIG with the URL parameters `s` (symbols), `tf` (intervals), `r` (ranges)
 * and `layout` (columns x rows).
 */
function readSettings(config, query) {
  const params = new URLSearchParams(query);
  const symbols = splitList(params.get('s'));
  const intervals = splitList(params.get('tf'));
  const ranges = splitList(params.get('r'));
  const layout = /^(\d+)x(\d+)$/i.exec(params.get('layout') || '');
  const baseCharts = symbols.length ? symbols.map((symbol) => ({ symbol: symbol })) : config.charts;
  const lastInterval = intervals[intervals.length - 1] || 'D';
  return {
    columns: Math.max(1, layout ? Number(layout[1]) : config.columns),
    rows: Math.max(1, layout ? Number(layout[2]) : config.rows),
    charts: baseCharts.map((chart, i) => {
      const interval = toTradingViewInterval(intervals[i] || chart.interval || lastInterval);
      const range = String(ranges[i] || chart.range || '').toLowerCase();
      return {
        symbol: chart.symbol.toUpperCase(),
        interval: interval,
        range: RANGES.has(range) ? range : defaultRange(interval),
        movingAverage: chart.movingAverage || 0,
      };
    }),
  };
}

/**
 * Reads purchases from the link's fragment, e.g. `#buy=QQQ:1000@600+500@580,BTCUSDT:250@60000`:
 * each purchase is the amount spent @ the price paid, joined by `+`. The fragment is never sent to the server, so purchases stay
 * out of the public repo. A ticker resolves to the chart with that ticker; use `EXCHANGE:TICKER`
 * for a symbol without a chart.
 */
function readPositions(hash, charts) {
  const match = /(?:^#|&)buy=([^&]*)/.exec(hash);
  return splitList(match ? decodeURIComponent(match[1]) : '').map((entry) => {
    const split = entry.lastIndexOf(':');
    const name = entry.slice(0, split).toUpperCase();
    const purchases = entry.slice(split + 1).split('+').map((purchase) => purchase.split('@').map(Number));
    const chart = charts.find((candidate) => tickerOf(candidate.symbol) === name);
    return {
      symbol: chart ? chart.symbol : name,
      quantity: purchases.reduce((total, [amount, price]) => total + amount / price, 0),
      cost: purchases.reduce((total, [amount]) => total + amount, 0),
    };
  }).filter((position) => position.quantity > 0 && Number.isFinite(position.cost));
}

/**
 * Adds rows when the charts and the calendar don't fit. The quotes cell is added only when the layout
 * has free cells, and stretches down the last column over as many of them as it can (`quotesRowSpan`).
 */
function planGrid(settings, showQuotes, showCalendar) {
  const flowCells = settings.charts.length + (showCalendar ? 1 : 0);
  const freeCells = settings.columns * settings.rows - flowCells;
  const withQuotes = showQuotes && freeCells > 0;
  const widgetCount = flowCells + (withQuotes ? 1 : 0);
  return {
    withQuotes: withQuotes,
    quotesRowSpan: Math.min(Math.max(freeCells, 1), settings.rows),
    widgetCount: widgetCount,
    rows: Math.max(settings.rows, Math.ceil(widgetCount / settings.columns)),
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) {
    node.textContent = text;
  }
  return node;
}

let retryTimer = null;

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement;
}

/** Rebuilds the widgets in place while in full screen, because reloading the page leaves full screen. */
function refresh() {
  if (fullscreenElement()) {
    renderPage();
  } else {
    window.location.reload();
  }
}

function scheduleRetry() {
  if (retryTimer) {
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    refresh();
  }, CONFIG.retryAfterMinutes * 60 * 1000);
}

function showFailure(cell, message) {
  if (cell.querySelector('.status')) {
    return;
  }
  cell.appendChild(element('div', 'status', message + ' Retrying in ' + CONFIG.retryAfterMinutes + ' min.'));
  scheduleRetry();
}

function showNotice(message) {
  const notice = element('div', 'notice', message);
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 30000);
}

/** Inserts a TradingView embed script; the cell shows a failure if it never creates its iframe. */
function mountEmbed(cell, parent, scriptUrl, widgetConfig, name) {
  const container = element('div', 'tradingview-widget-container');
  const script = document.createElement('script');
  script.src = scriptUrl;
  script.async = true;
  script.text = JSON.stringify(widgetConfig);
  script.onerror = () => showFailure(cell, name + ' did not load.');
  container.appendChild(element('div', 'tradingview-widget-container__widget'));
  container.appendChild(script);
  parent.appendChild(container);
  setTimeout(() => {
    if (!cell.querySelector('iframe')) {
      showFailure(cell, name + ' did not load.');
    }
  }, CONFIG.loadTimeoutSeconds * 1000);
}

function addCell(grid) {
  const cell = element('section', 'cell');
  grid.appendChild(cell);
  return cell;
}

function addChartLabel(cell, chart) {
  const label = element('div', 'label');
  label.appendChild(element('span', 'label__symbol', tickerOf(chart.symbol)));
  label.appendChild(element('span', 'label__interval',
    intervalLabel(chart.interval) + ' · ' + chart.range.toUpperCase()));
  cell.appendChild(label);
}

function mountOverviewChart(cell, chart) {
  const widgetInterval = /^[DWM]$/.test(chart.interval) ? '1' + chart.interval : chart.interval;
  mountEmbed(cell, cell, CHART_SCRIPT_URL, {
    symbols: [[tickerOf(chart.symbol), chart.symbol + '|' + chart.range.toUpperCase()]],
    dateRanges: [chart.range + '|' + widgetInterval],
    chartOnly: true,
    chartType: 'candlesticks',
    width: '100%',
    height: '100%',
    autosize: true,
    colorTheme: 'dark',
    isTransparent: true,
    locale: CONFIG.locale,
    fontSize: String(CONFIG.chartFontSize),
    showVolume: false,
    scalePosition: 'right',
    scaleMode: 'Normal',
    upColor: UP_COLOR,
    downColor: DOWN_COLOR,
    borderUpColor: UP_COLOR,
    borderDownColor: DOWN_COLOR,
    wickUpColor: UP_COLOR,
    wickDownColor: DOWN_COLOR,
  }, chart.symbol);
}

function mountAdvancedChart(cell, chart) {
  mountEmbed(cell, cell, ADVANCED_CHART_SCRIPT_URL, {
    symbol: chart.symbol,
    interval: chart.interval,
    range: chart.range.toUpperCase(),
    studies: [{ id: 'MASimple@tv-basicstudies', inputs: { length: chart.movingAverage } }],
    autosize: true,
    theme: 'dark',
    style: '1',
    locale: CONFIG.locale,
    backgroundColor: '#0b0e14',
    gridColor: 'rgba(0, 0, 0, 0)',
    hide_top_toolbar: true,
    hide_side_toolbar: true,
    hide_legend: true,
    hide_volume: true,
    allow_symbol_change: false,
    save_image: false,
    calendar: false,
  }, chart.symbol);
}

function mountChart(cell, chart) {
  if (chart.movingAverage > 0) {
    mountAdvancedChart(cell, chart);
  } else {
    mountOverviewChart(cell, chart);
  }
}

function quotesZoom(cell, rowCount) {
  return Math.min(QUOTES_MAX_ZOOM, cell.clientHeight / (rowCount * QUOTES_ROW_PX + QUOTES_HEADER_PX));
}

function fitQuotes() {
  const zoom = document.querySelector('.zoomed');
  if (zoom) {
    zoom.style.setProperty('--zoom', quotesZoom(zoom.parentElement, Number(zoom.dataset.rows)));
  }
}

function mountQuotes(cell, symbols) {
  const zoom = element('div', 'zoomed');
  zoom.dataset.rows = symbols.length;
  cell.appendChild(zoom);
  fitQuotes();
  mountEmbed(cell, zoom, QUOTES_SCRIPT_URL, {
    width: '100%',
    height: '100%',
    colorTheme: 'dark',
    isTransparent: true,
    showChart: false,
    showSymbolLogo: false,
    showFloatingTooltip: false,
    locale: CONFIG.locale,
    tabs: [{
      title: 'Hoy',
      symbols: symbols.map((symbol) => ({ s: symbol })),
    }],
  }, 'Quotes');
}

function mountCalendar(cell) {
  mountEmbed(cell, cell, CALENDAR_SCRIPT_URL, {
    width: '100%',
    height: '100%',
    colorTheme: 'dark',
    isTransparent: true,
    locale: CONFIG.locale,
    importanceFilter: '0,1',
    countryFilter: 'us',
  }, 'Calendar');
}

async function fetchPrices(symbols) {
  const response = await fetch(SCANNER_URL, {
    method: 'POST',
    body: JSON.stringify({ symbols: { tickers: symbols }, columns: ['close'] }),
  });
  const body = await response.json();
  return new Map(body.data.map((row) => [row.s, row.d[0]]));
}

function formatNumber(value, digits) {
  return value.toLocaleString(CONFIG.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatMoney(value) {
  return formatNumber(value, Math.abs(value) >= 1000 ? 0 : 2);
}

function addRow(parent, cells) {
  const row = document.createElement('tr');
  cells.forEach(([text, className]) => row.appendChild(element('td', className || '', text)));
  parent.appendChild(row);
}

/** Cells for a gain: signed money and percentage, colored by direction; dashes when unknown. */
function gainCells(cost, value) {
  if (value === null) {
    return [['—'], ['—']];
  }
  const gain = value - cost;
  const className = gain >= 0 ? 'up' : 'down';
  const sign = gain >= 0 ? '+' : '';
  return [[sign + formatNumber(gain / cost * 100, 1) + ' %', className], [sign + formatNumber(gain, 0), className]];
}

function renderPortfolio(body, positions, prices) {
  body.textContent = '';
  positions.forEach((position) => {
    const price = prices.get(position.symbol) ?? null;
    addRow(body, [
      [tickerOf(position.symbol)],
      [formatMoney(position.cost / position.quantity)],
      [price === null ? '—' : formatMoney(price)],
      ...gainCells(position.cost, price === null ? null : price * position.quantity),
    ]);
  });
  const cost = positions.reduce((total, position) => total + position.cost, 0);
  const priced = positions.every((position) => prices.has(position.symbol));
  const value = priced ? positions.reduce((total, p) => total + prices.get(p.symbol) * p.quantity, 0) : null;
  addRow(body, [
    ['Total', 'portfolio__total'],
    [formatMoney(cost), 'portfolio__total'],
    [value === null ? '—' : formatMoney(value), 'portfolio__total'],
    ...gainCells(cost, value),
  ]);
}

/** Shows average cost, current price and gain per purchased symbol; prices refresh until the cell is replaced. */
function mountPortfolio(cell, positions) {
  const table = element('table', 'portfolio');
  const head = document.createElement('thead');
  addRow(head, [[''], ['Medio'], ['Actual'], ['%'], ['$']]);
  const body = document.createElement('tbody');
  table.append(head, body);
  cell.appendChild(table);
  let prices = new Map();
  const update = async () => {
    try {
      prices = await fetchPrices(positions.map((position) => position.symbol));
    } catch (error) {
      console.warn('Prices did not load; showing the last ones.', error);
    }
    renderPortfolio(body, positions, prices);
  };
  update();
  const timer = setInterval(() => {
    if (cell.isConnected) {
      update();
    } else {
      clearInterval(timer);
    }
  }, CONFIG.portfolioRefreshSeconds * 1000);
}

function requestFullscreen() {
  const root = document.documentElement;
  (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
}

/** The button shows only outside full screen; the remote's Back key leaves full screen. */
function addFullscreenButton() {
  if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) {
    return;
  }
  const button = element('button', 'fullscreen', 'Full screen');
  button.type = 'button';
  button.addEventListener('click', requestFullscreen);
  document.body.appendChild(button);
  const sync = () => {
    button.hidden = Boolean(fullscreenElement());
  };
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
}

function shiftGrid(grid, maxPixels) {
  const offset = () => Math.round((Math.random() * 2 - 1) * maxPixels);
  grid.style.transform = 'translate(' + offset() + 'px, ' + offset() + 'px)';
}

/** Builds the grid and starts its widgets, replacing any previous ones. */
function renderPage() {
  const settings = readSettings(CONFIG, window.location.search);
  const positions = readPositions(window.location.hash, settings.charts);
  const showPanel = CONFIG.showCalendar || positions.length > 0;
  const plan = planGrid(settings, CONFIG.showQuotes, showPanel);
  const grid = document.getElementById('grid');
  grid.textContent = '';
  grid.style.setProperty('--columns', settings.columns);
  grid.style.setProperty('--rows', plan.rows);

  const mounts = settings.charts.map((chart) => {
    const cell = addCell(grid);
    addChartLabel(cell, chart);
    return () => mountChart(cell, chart);
  });
  if (showPanel) {
    const cell = addCell(grid);
    mounts.push(positions.length ? () => mountPortfolio(cell, positions) : () => mountCalendar(cell));
  }
  if (plan.withQuotes) {
    const cell = addCell(grid);
    cell.style.gridColumn = '-2 / -1';
    cell.style.gridRow = 'span ' + plan.quotesRowSpan + ' / -1';
    const symbols = new Set(settings.charts.map((chart) => chart.symbol).concat(CONFIG.quoteSymbols));
    mounts.push(() => mountQuotes(cell, Array.from(symbols)));
  }
  mounts.forEach((mount, i) => setTimeout(mount, i * CONFIG.staggerSeconds * 1000));
  return plan;
}

function main() {
  const plan = renderPage();
  if (plan.widgetCount > CONFIG.maxWidgets) {
    showNotice(plan.widgetCount + ' widgets configured: more than ' + CONFIG.maxWidgets
      + ' may run the TV browser out of memory.');
  }
  addFullscreenButton();
  window.addEventListener('resize', fitQuotes);
  if (CONFIG.pixelShiftPixels > 0) {
    const grid = document.getElementById('grid');
    setInterval(() => shiftGrid(grid, CONFIG.pixelShiftPixels), CONFIG.pixelShiftEveryMinutes * 60 * 1000);
  }
}

main();
