'use strict';

const CONFIG = {
  columns: 4,
  rows: 2,
  // interval: TradingView codes ('1', '15', '60', '240', 'D', 'W', 'M') or hours such as '4h'.
  charts: [
    { symbol: 'NASDAQ:QQQ', interval: 'D' },
    { symbol: 'NASDAQ:VXUS', interval: 'D' },
    { symbol: 'AMEX:VOO', interval: 'D' },
    { symbol: 'NASDAQ:NVDA', interval: 'D' },
    { symbol: 'NASDAQ:SPCX', interval: 'D' },
    // Anthropic listed on 2026-11-19, so a daily chart has only a few candles.
    // Switch to 'D' once it has a few weeks of history.
    { symbol: 'NASDAQ:ANT', interval: '60' },
    { symbol: 'BINANCE:BTCUSDT', interval: '240' },
  ],
  // Fills the first free cell with price and daily change of every chart symbol.
  showQuotes: true,
  locale: 'es',
  reloadEveryHours: 6,
  retryAfterMinutes: 5,
  loadTimeoutSeconds: 30,
  // The TV browser has little memory; more widgets than this shows a warning.
  maxWidgets: 8,
};

const TV_SCRIPT_URL = 'https://s3.tradingview.com/tv.js';
const QUOTES_SCRIPT_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js';
// Measured size of the Market Overview list, used to zoom it until every row fills the cell.
const QUOTES_ROW_PX = 60;
const QUOTES_HEADER_PX = 24;
const QUOTES_MAX_ZOOM = 2;

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

/** Merges CONFIG with the URL parameters `s` (symbols), `tf` (intervals) and `layout` (columns x rows). */
function readSettings(config, query) {
  const params = new URLSearchParams(query);
  const symbols = splitList(params.get('s'));
  const intervals = splitList(params.get('tf'));
  const layout = /^(\d+)x(\d+)$/i.exec(params.get('layout') || '');
  const baseCharts = symbols.length ? symbols.map((symbol) => ({ symbol: symbol })) : config.charts;
  const lastInterval = intervals[intervals.length - 1] || 'D';
  return {
    columns: Math.max(1, layout ? Number(layout[1]) : config.columns),
    rows: Math.max(1, layout ? Number(layout[2]) : config.rows),
    charts: baseCharts.map((chart, i) => ({
      symbol: chart.symbol.toUpperCase(),
      interval: toTradingViewInterval(intervals[i] || chart.interval || lastInterval),
    })),
  };
}

/** Adds the quotes cell only when the layout has a free cell, and adds rows when the charts don't fit. */
function planGrid(settings, showQuotes) {
  const withQuotes = showQuotes && settings.charts.length < settings.columns * settings.rows;
  const cellCount = settings.charts.length + (withQuotes ? 1 : 0);
  return {
    withQuotes: withQuotes,
    cellCount: cellCount,
    rows: Math.max(settings.rows, Math.ceil(cellCount / settings.columns)),
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

function scheduleReload(seconds) {
  setTimeout(() => window.location.reload(), seconds * 1000);
}

function showFailure(cell, message) {
  if (cell.querySelector('.status')) {
    return;
  }
  cell.appendChild(element('div', 'status', message + ' Retrying in ' + CONFIG.retryAfterMinutes + ' min.'));
  scheduleReload(CONFIG.retryAfterMinutes * 60);
}

function showNotice(message) {
  const notice = element('div', 'notice', message);
  document.body.appendChild(notice);
  setTimeout(() => notice.remove(), 30000);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function addChartCell(grid, chart) {
  const cell = element('section', 'cell');
  const label = element('div', 'label');
  label.appendChild(element('span', 'label__symbol', tickerOf(chart.symbol)));
  label.appendChild(element('span', 'label__interval', intervalLabel(chart.interval)));
  cell.appendChild(label);
  grid.appendChild(cell);
  return cell;
}

function mountChart(cell, chart, index) {
  const target = element('div', 'widget');
  target.id = 'chart-' + index;
  cell.appendChild(target);
  const timeout = setTimeout(
    () => showFailure(cell, chart.symbol + ' did not load.'),
    CONFIG.loadTimeoutSeconds * 1000
  );
  const widget = new TradingView.widget({
    container_id: target.id,
    autosize: true,
    symbol: chart.symbol,
    interval: chart.interval,
    theme: 'dark',
    style: '1',
    locale: CONFIG.locale,
    hide_top_toolbar: true,
    hide_side_toolbar: true,
    hide_legend: true,
    allow_symbol_change: false,
    save_image: false,
    details: false,
    hotlist: false,
    calendar: false,
  });
  widget.ready(() => clearTimeout(timeout));
}

function quotesZoom(cell, rowCount) {
  return Math.min(QUOTES_MAX_ZOOM, cell.clientHeight / (rowCount * QUOTES_ROW_PX + QUOTES_HEADER_PX));
}

function mountQuotes(grid, charts) {
  const cell = element('section', 'cell');
  grid.appendChild(cell);
  const zoom = element('div', 'quotes');
  zoom.style.setProperty('--zoom', quotesZoom(cell, charts.length));
  const container = element('div', 'tradingview-widget-container');
  const script = document.createElement('script');
  script.src = QUOTES_SCRIPT_URL;
  script.async = true;
  script.text = JSON.stringify({
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
  });
  script.onerror = () => showFailure(cell, 'Quotes did not load.');
  container.appendChild(element('div', 'tradingview-widget-container__widget'));
  container.appendChild(script);
  zoom.appendChild(container);
  cell.appendChild(zoom);
  setTimeout(() => {
    if (!cell.querySelector('iframe')) {
      showFailure(cell, 'Quotes did not load.');
    }
  }, CONFIG.loadTimeoutSeconds * 1000);
}

function main() {
  const settings = readSettings(CONFIG, window.location.search);
  const plan = planGrid(settings, CONFIG.showQuotes);
  const grid = document.getElementById('grid');
  grid.style.setProperty('--columns', settings.columns);
  grid.style.setProperty('--rows', plan.rows);

  if (plan.cellCount > CONFIG.maxWidgets) {
    showNotice(plan.cellCount + ' widgets configured: more than ' + CONFIG.maxWidgets
      + ' may run the TV browser out of memory.');
  }

  const chartCells = settings.charts.map((chart) => addChartCell(grid, chart));
  if (plan.withQuotes) {
    mountQuotes(grid, settings.charts);
  }

  loadScript(TV_SCRIPT_URL).then(
    () => chartCells.forEach((cell, i) => mountChart(cell, settings.charts[i], i)),
    () => chartCells.forEach((cell) => showFailure(cell, 'Could not reach TradingView. Check the internet connection.'))
  );
  scheduleReload(CONFIG.reloadEveryHours * 3600);
}

main();
