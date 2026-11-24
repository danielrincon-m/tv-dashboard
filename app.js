'use strict';

const CONFIG = {
  columns: 3,
  rows: 3,
  // interval: TradingView codes ('1', '15', '60', '240', 'D', 'W', 'M') or hours such as '4h'.
  // range (optional): how much history to show: '1d', '5d', '1m', '3m', '6m', '12m', '60m' or 'all'.
  charts: [
    { symbol: 'NASDAQ:QQQ', interval: '30' },
    { symbol: 'NASDAQ:VXUS', interval: '30' },
    { symbol: 'AMEX:VOO', interval: '30' },
    { symbol: 'NASDAQ:NVDA', interval: '30' },
    { symbol: 'NASDAQ:SPCX', interval: '30' },
    { symbol: 'NASDAQ:ANT', interval: '30' },
    { symbol: 'BINANCE:BTCUSDT', interval: '60' },
  ],
  chartFontSize: 18,
  // Simple moving average over this many candles of each chart. 0 hides it.
  movingAverage: 20,
  // Shows price and daily change of every chart symbol in the last column, over the free cells.
  showQuotes: true,
  locale: 'es',
  // Widgets start one after another so the TV doesn't boot them all at once.
  staggerSeconds: 1,
  reloadEveryHours: 6,
  retryAfterMinutes: 5,
  loadTimeoutSeconds: 30,
  // The TV browser has little memory; more widgets than this shows a warning.
  maxWidgets: 8,
  // Moves the whole grid up to this many pixels now and then, so lines and labels don't sit on the
  // same pixels all day and leave a ghost image on the screen. 0 turns it off.
  pixelShiftPixels: 4,
  pixelShiftEveryMinutes: 5,
};

const EMBED_URL = 'https://s3.tradingview.com/external-embedding/';
const CHART_SCRIPT_URL = EMBED_URL + 'embed-widget-symbol-overview.js';
const QUOTES_SCRIPT_URL = EMBED_URL + 'embed-widget-market-overview.js';
// Measured size of the Market Overview list, used to zoom it until every row fills the cell.
const QUOTES_ROW_PX = 60;
const QUOTES_HEADER_PX = 24;
const QUOTES_MAX_ZOOM = 2;
// The only ranges Symbol Overview accepts; any other value leaves the chart loading forever.
const RANGES = new Set(['1d', '5d', '1m', '3m', '6m', '12m', '60m', 'all']);
const UP_COLOR = '#089981';
const DOWN_COLOR = '#f23645';
const MA_COLOR = '#f7c948';

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
      };
    }),
  };
}

/**
 * Adds rows when the charts don't fit. The quotes cell is added only when the layout has free cells,
 * and stretches down the last column over as many of them as it can (`quotesRowSpan`).
 */
function planGrid(settings, showQuotes) {
  const freeCells = settings.columns * settings.rows - settings.charts.length;
  const withQuotes = showQuotes && freeCells > 0;
  const widgetCount = settings.charts.length + (withQuotes ? 1 : 0);
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

function mountChart(cell, chart) {
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
    showMA: CONFIG.movingAverage > 0,
    maLength: CONFIG.movingAverage,
    maLineColor: MA_COLOR,
    maLineWidth: 2,
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

function quotesZoom(cell, rowCount) {
  return Math.min(QUOTES_MAX_ZOOM, cell.clientHeight / (rowCount * QUOTES_ROW_PX + QUOTES_HEADER_PX));
}

function fitQuotes() {
  const zoom = document.querySelector('.zoomed');
  if (zoom) {
    zoom.style.setProperty('--zoom', quotesZoom(zoom.parentElement, Number(zoom.dataset.rows)));
  }
}

function mountQuotes(cell, charts) {
  const zoom = element('div', 'zoomed');
  zoom.dataset.rows = charts.length;
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
      symbols: charts.map((chart) => ({ s: chart.symbol })),
    }],
  }, 'Quotes');
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
  const plan = planGrid(settings, CONFIG.showQuotes);
  const grid = document.getElementById('grid');
  grid.textContent = '';
  grid.style.setProperty('--columns', settings.columns);
  grid.style.setProperty('--rows', plan.rows);

  const mounts = settings.charts.map((chart) => {
    const cell = addCell(grid);
    addChartLabel(cell, chart);
    return () => mountChart(cell, chart);
  });
  if (plan.withQuotes) {
    const cell = addCell(grid);
    cell.style.gridColumn = '-2 / -1';
    cell.style.gridRow = 'span ' + plan.quotesRowSpan + ' / -1';
    mounts.push(() => mountQuotes(cell, settings.charts));
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
  setInterval(refresh, CONFIG.reloadEveryHours * 3600 * 1000);
  if (CONFIG.pixelShiftPixels > 0) {
    const grid = document.getElementById('grid');
    setInterval(() => shiftGrid(grid, CONFIG.pixelShiftPixels), CONFIG.pixelShiftEveryMinutes * 60 * 1000);
  }
}

main();
