(function () {
  "use strict";

  const API_BASE = "https://elevatorsbackend.onrender.com";
  const VERIFY_URL = API_BASE + "/stats/auth/verify";
  const DATA_URL = API_BASE + "/stats/data";
  const TOKEN_KEY = "axl_stats_token";
  const EXPIRES_KEY = "axl_stats_token_expires";
  const LOGIN_PAGE = "slogin.html";
  // Allow a Render cold start without waiting indefinitely. No background pings.
  const REQUEST_TIMEOUT_MS = 90000;

  const GENERATOR_GROUPS = [
    {
      category: "drawing",
      label: "Electrical Drawings",
      items: [
        ["traction_en8120", "Traction EN81.20"],
        ["traction_en811_geared", "Traction EN81.1 Geared"],
        ["traction_en811_gearless", "Traction EN81.1 Gearless"],
        ["hydraulic_en8120", "Hydraulic EN81.20"],
        ["hydraulic_en812", "Hydraulic EN81.2"]
      ]
    },
    {
      category: "display",
      label: "Display Configurations",
      items: [
        ["l2_simple", "L2 Simple"],
        ["l2_complex", "L2 Complex"],
        ["l2_client", "L2 Client"]
      ]
    },
    {
      category: "voice",
      label: "Voice Configurations",
      items: [["w2", "W2 Voice"]]
    }
  ];

  const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
  const TRACKING_START = "2026-11-09";
  const TRACKING_MONTH = TRACKING_START.slice(0, 7);
  const numberFormat = new Intl.NumberFormat("en-GB");
  const compactFormat = new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 });
  const localDateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const localTimeFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const fullDateFormat = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC"
  });
  const monthFormat = new Intl.DateTimeFormat("en-GB", {
    month: "short", year: "numeric", timeZone: "UTC"
  });
  const shortMonthFormat = new Intl.DateTimeFormat("en-GB", {
    month: "short", timeZone: "UTC"
  });
  const chartHost = document.getElementById("activity-chart");
  const trendHost = document.getElementById("trend-chart");
  const refreshButton = document.getElementById("refresh-statistics");
  const dashboard = document.getElementById("dashboard");
  const connectionGate = document.getElementById("connection-gate");
  const retryButton = document.getElementById("retry-connection");
  const logoutButton = document.getElementById("stats-logout");
  const periodButtons = Array.from(document.querySelectorAll("[data-period]"));
  let dashboardData;
  let asOfDate;
  let activePeriod = "daily";
  let resizeFrame = 0;
  let feedbackTimer = 0;
  let verifiedToken = null;
  let requestInFlight = false;
  let sessionEnded = false;
  let activeController = null;
  let operationId = 0;

  class StatisticsError extends Error {
    constructor(code) {
      super(code);
      this.code = code;
    }
  }

  function count(value) {
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  function dateFromKey(key, monthly = false) {
    return new Date(monthly ? `${key}-01T00:00:00Z` : `${key}T00:00:00Z`);
  }

  function utcKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function shiftDays(date, days) {
    const shifted = new Date(date);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted;
  }

  function monthStart(offset = 0) {
    const date = dateFromKey(utcKey(asOfDate).slice(0, 7), true);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date;
  }

  function monthlyWindow() {
    const values = new Map(dashboardData.monthly.map((row) => [row.key, row.count]));
    return Array.from({ length: 6 }, (_, index) => {
      const key = utcKey(monthStart(index - 5)).slice(0, 7);
      return {
        key,
        count: key < TRACKING_MONTH ? null : values.get(key) || 0,
        partial: key === TRACKING_MONTH || index === 5
      };
    });
  }

  function validDateKey(key, monthly) {
    const pattern = monthly ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/;
    if (typeof key !== "string" || !pattern.test(key)) return false;
    const date = dateFromKey(key, monthly);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, key.length) === key;
  }

  function normalizeSeries(rows, key, monthly) {
    if (!Array.isArray(rows)) return [];
    const values = new Map();
    const first = monthly ? TRACKING_MONTH : TRACKING_START;
    const latest = utcKey(asOfDate).slice(0, monthly ? 7 : 10);
    rows.forEach((row) => {
      if (row && validDateKey(row[key], monthly) && row[key] >= first && row[key] <= latest) {
        values.set(row[key], (values.get(row[key]) || 0) + count(row.count));
      }
    });
    return Array.from(values, ([period, value]) => ({ key: period, count: value }))
      .sort((firstRow, secondRow) => firstRow.key.localeCompare(secondRow.key));
  }

  function normalizeData(source) {
    const input = source && typeof source === "object" ? source : {};
    const categories = input.by_category || {};
    const subtypes = input.by_subtype || {};
    return {
      total_generations: count(input.total_generations),
      by_category: Object.fromEntries(GENERATOR_GROUPS.map((group) => [
        group.category, count(categories[group.category])
      ])),
      // Preserve additional backend subtypes without changing the known breakdown.
      // Overview/category totals always come from the API, never from this list.
      by_subtype: {
        ...Object.fromEntries(Object.entries(subtypes).map(([identifier, value]) => [identifier, count(value)])),
        ...Object.fromEntries(GENERATOR_GROUPS.flatMap((group) => (
          group.items.map(([identifier]) => [identifier, count(subtypes[identifier])])
        )))
      },
      daily: normalizeSeries(input.daily, "date", false),
      monthly: normalizeSeries(input.monthly, "month", true),
      timezone: "UTC"
    };
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function svgElement(tag, attributes, text) {
    const node = document.createElementNS(SVG_NAMESPACE, tag);
    Object.entries(attributes || {}).forEach(([key, value]) => node.setAttribute(key, value));
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function renderOverview() {
    document.getElementById("total-generations").textContent = numberFormat.format(dashboardData.total_generations);
    GENERATOR_GROUPS.forEach(({ category }) => {
      const value = dashboardData.by_category[category];
      document.getElementById(`${category}-total`).textContent = numberFormat.format(value);
      const share = dashboardData.total_generations > 0
        ? (100 * value / dashboardData.total_generations).toFixed(1)
        : "0.0";
      document.getElementById(`${category}-share`).textContent = `${share}% of all generations`;
    });
    document.getElementById("timezone-label").textContent = dashboardData.timezone;
  }

  function renderBreakdown() {
    const container = document.getElementById("generator-breakdown");
    container.replaceChildren();
    GENERATOR_GROUPS.forEach((group) => {
      const total = dashboardData.by_category[group.category];
      const card = element("article", `breakdown-card breakdown-card-${group.category}`);
      card.setAttribute("aria-labelledby", `category-${group.category}`);
      const header = element("div", "breakdown-card-header");
      const heading = element("div");
      const title = element("h3", "", group.label);
      title.id = `category-${group.category}`;
      heading.append(title, element("p", "category-description", `${group.items.length} supported ${group.items.length === 1 ? "subtype" : "subtypes"}`));
      header.append(heading, element("span", "category-count", numberFormat.format(total)));
      const list = element("ul", "breakdown-list");

      group.items.forEach(([identifier, label]) => {
        const value = dashboardData.by_subtype[identifier];
        const row = element("li", "breakdown-row");
        row.dataset.subtype = identifier;
        const rowHeading = element("div", "breakdown-row-heading");
        rowHeading.append(element("span", "subtype-label", label), element("span", "subtype-count", numberFormat.format(value)));
        const meter = element("meter", "subtype-meter");
        meter.min = 0;
        meter.max = Math.max(1, total, value);
        meter.value = value;
        meter.setAttribute("aria-label", `${label}: ${numberFormat.format(value)} generations`);
        row.append(rowHeading, meter);
        list.append(row);
      });
      card.append(header, list);
      container.append(card);
    });
  }

  function activitySeries() {
    if (activePeriod === "monthly") return monthlyWindow();
    if (activePeriod === "annual") {
      const years = new Map();
      dashboardData.monthly.forEach((row) => {
        const key = row.key.slice(0, 4);
        years.set(key, (years.get(key) || 0) + row.count);
      });
      return Array.from(years, ([key, value]) => ({
        key, count: value,
        partial: key === TRACKING_START.slice(0, 4) || key === String(asOfDate.getUTCFullYear())
      })).sort((first, second) => first.key.localeCompare(second.key));
    }
    const today = dateFromKey(utcKey(asOfDate));
    const values = new Map(dashboardData.daily.map((row) => [row.key, row.count]));
    return Array.from({ length: 7 }, (_, index) => {
      const key = utcKey(shiftDays(today, index - 6));
      return { key, count: key < TRACKING_START ? null : values.get(key) || 0, partial: index === 6 };
    });
  }

  function periodLabel(row) {
    if (activePeriod === "annual") return row.key;
    return activePeriod === "daily"
      ? fullDateFormat.format(dateFromKey(row.key))
      : monthFormat.format(dateFromKey(row.key, true));
  }

  function periodNote(row, period = activePeriod) {
    if (row.count === null) return "Not tracked";
    if (!row.partial) return "";
    if (period === "daily") return "Today · in progress";
    if (period === "monthly") {
      return row.key === TRACKING_MONTH ? "Partial tracking · since 9 Nov 2026" : "Current month · in progress";
    }
    return row.key === TRACKING_START.slice(0, 4) ? "Partially tracked year" : "Current year · in progress";
  }

  function rowDescription(row) {
    return `${periodLabel(row)}: ${row.count === null ? "not tracked" : `${row.count} generations`}${row.partial && row.count !== null ? ` (${periodNote(row)})` : ""}`;
  }

  function systemUptime(todayKey) {
    // Count the start date and today, using local calendar dates rather than
    // elapsed hours. UTC arithmetic avoids daylight-saving changes in day length.
    const start = dateFromKey(TRACKING_START);
    const end = shiftDays(dateFromKey(todayKey), 1);
    if (end <= start) return "0 days";

    let months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12
      + end.getUTCMonth() - start.getUTCMonth();
    let anniversary = new Date(start);
    anniversary.setUTCMonth(start.getUTCMonth() + months);
    if (anniversary > end) {
      months -= 1;
      anniversary = new Date(start);
      anniversary.setUTCMonth(start.getUTCMonth() + months);
    }
    const days = Math.round((end - anniversary) / 86400000);
    return [[Math.floor(months / 12), "year"], [months % 12, "month"], [days, "day"]]
      .filter(([value]) => value > 0)
      .map(([value, unit]) => `${value} ${unit}${value === 1 ? "" : "s"}`)
      .join(" ");
  }

  function renderDates() {
    const today = document.getElementById("today-local");
    today.textContent = localDateFormat.format(asOfDate);
    today.dateTime = `${asOfDate.getFullYear()}-${String(asOfDate.getMonth() + 1).padStart(2, "0")}-${String(asOfDate.getDate()).padStart(2, "0")}`;
    document.getElementById("system-uptime").textContent = systemUptime(today.dateTime);
    const refreshed = document.getElementById("last-refreshed");
    refreshed.textContent = localTimeFormat.format(asOfDate);
    refreshed.dateTime = asOfDate.toISOString();
    const last = dashboardData.daily.filter((row) => row.count > 0).at(-1);
    const lastRecorded = document.getElementById("last-recorded-generation");
    lastRecorded.textContent = last ? `${fullDateFormat.format(dateFromKey(last.key))} · UTC` : "No recorded generations yet";
    if (last) lastRecorded.dateTime = last.key;
    else lastRecorded.removeAttribute("datetime");
  }

  function renderActivity() {
    const series = activitySeries();
    const daily = activePeriod === "daily";
    const total = series.reduce((sum, row) => sum + (row.count || 0), 0);
    const title = activePeriod[0].toUpperCase() + activePeriod.slice(1);
    periodButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === activePeriod)));
    document.getElementById("activity-window").textContent = daily
      ? "Latest 7 UTC calendar days"
      : activePeriod === "monthly" ? "Latest 6 UTC calendar months" : "All available recorded years";
    document.getElementById("activity-range").textContent = series.length
      ? `${periodLabel(series[0])} – ${periodLabel(series[series.length - 1])} · UTC`
      : "No yearly records available · UTC";
    document.getElementById("period-total").textContent = numberFormat.format(total);
    document.getElementById("chart-note").textContent = daily
      ? "Includes today (partial). — = before tracking began."
      : activePeriod === "monthly" ? "— = not tracked. * = partial tracking or current month."
        : "Derived from monthly records. * = partially tracked or current year.";
    document.getElementById("activity-announcement").textContent = `${title} view. ${numberFormat.format(total)} tracked generations in this view. Untracked periods are not zeroes.`;
    document.getElementById("data-caption").textContent = `${title} generation counts · UTC`;
    document.getElementById("period-column").textContent = daily ? "Date" : activePeriod === "monthly" ? "Month" : "Year";
    const tableBody = document.getElementById("activity-table-body");
    tableBody.replaceChildren();
    series.forEach((row) => {
      const tr = element("tr");
      const label = element("th", "", periodLabel(row));
      label.scope = "row";
      const note = periodNote(row);
      if (note) label.append(element("small", "table-period-note", note));
      const value = row.count === null ? "—" : `${numberFormat.format(row.count)}${row.partial ? "*" : ""}`;
      tr.append(label, element("td", "", value));
      tableBody.append(tr);
    });
    renderChart();
  }

  function periodCounts(rows, start, end, monthly) {
    const startKey = utcKey(start).slice(0, monthly ? 7 : 10);
    const endKey = utcKey(end).slice(0, monthly ? 7 : 10);
    const trackingStart = dateFromKey(TRACKING_START);
    const value = rows.filter((row) => row.key >= startKey && row.key < endKey)
      .reduce((sum, row) => sum + row.count, 0);
    return { start, end, complete: start >= trackingStart, count: end <= trackingStart ? null : value };
  }

  function growthComparison(definition) {
    const previous = periodCounts(definition.rows, definition.previous, definition.current, definition.monthly);
    const current = periodCounts(definition.rows, definition.current, definition.end, definition.monthly);
    if (!previous.complete || !current.complete) {
      return { previous, current, change: null, reason: "Incomplete comparison history. Tracking began 9 Nov 2026; * marks a recorded portion only." };
    }
    if (previous.count === 0) {
      return { previous, current, change: null, reason: "The previous period recorded zero generations, so a percentage cannot be calculated." };
    }
    return { previous, current, change: ((current.count - previous.count) / previous.count) * 100, reason: "Compared using fully completed, tracked UTC periods." };
  }

  function comparisonRange(period) {
    return `${fullDateFormat.format(period.start)} – ${fullDateFormat.format(shiftDays(period.end, -1))}`;
  }

  function renderGrowth() {
    const today = dateFromKey(utcKey(asOfDate));
    const year = asOfDate.getUTCFullYear();
    const definitions = [
      { key: "weekly", title: "Weekly Growth", label: "Last 7 completed days vs the preceding 7", rows: dashboardData.daily,
        previous: shiftDays(today, -14), current: shiftDays(today, -7), end: today, monthly: false },
      { key: "monthly", title: "Monthly Growth", label: "Last completed month vs the month before", rows: dashboardData.monthly,
        previous: monthStart(-2), current: monthStart(-1), end: monthStart(), monthly: true },
      { key: "annual", title: "Annual Growth", label: "Last completed year vs the year before", rows: dashboardData.monthly,
        previous: new Date(Date.UTC(year - 2, 0, 1)), current: new Date(Date.UTC(year - 1, 0, 1)), end: new Date(Date.UTC(year, 0, 1)), monthly: true }
    ];
    const container = document.getElementById("production-growth");
    container.replaceChildren();
    definitions.forEach((definition) => {
      const result = growthComparison(definition);
      const change = result.change;
      const direction = change === null ? "unavailable" : change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
      const card = element("article", `growth-card growth-${direction}`);
      card.dataset.growth = definition.key;
      const heading = element("h3", "", definition.title);
      heading.id = `growth-${definition.key}-title`;
      card.setAttribute("aria-labelledby", heading.id);
      const percentage = change === null ? "N/A" : `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change).toFixed(1)}%`;
      const arrow = element("span", "growth-arrow", change === null ? "—" : change > 0 ? "↗" : change < 0 ? "↘" : "→");
      arrow.setAttribute("aria-hidden", "true");
      const value = element("p", "growth-value");
      value.append(arrow, element("span", "growth-percentage", percentage));
      const counts = element("dl", "growth-counts");
      [["Previous period", result.previous], ["Current period", result.current]].forEach(([label, period]) => {
        const group = element("div");
        const valueText = period.count === null ? "—" : `${numberFormat.format(period.count)}${period.complete ? "" : "*"}`;
        const dd = element("dd", "", valueText);
        dd.append(element("span", "growth-range", comparisonRange(period)));
        group.append(element("dt", "", label), dd);
        counts.append(group);
      });
      card.append(heading, element("p", "growth-comparison", definition.label), value, counts, element("p", "growth-explanation", result.reason));
      container.append(card);
    });
  }

  function cumulativeSeries() {
    const window = monthlyWindow();
    const firstKey = window[0].key;
    let running = dashboardData.monthly.filter((row) => row.key < firstKey)
      .reduce((sum, row) => sum + row.count, 0);
    return window.map((row) => {
      if (row.count === null) return { ...row, cumulative: null };
      running += row.count;
      return { ...row, cumulative: running };
    });
  }

  function renderTrend() {
    const series = cumulativeSeries();
    const first = monthFormat.format(dateFromKey(series[0].key, true));
    const last = monthFormat.format(dateFromKey(series[series.length - 1].key, true));
    document.getElementById("trend-range").textContent = `${first} – ${last} · UTC`;
    const total = series.at(-1).cumulative;
    document.getElementById("trend-total").textContent = total === null ? "—" : numberFormat.format(total);
    const recordedMonths = series.filter((row) => row.cumulative !== null).length;
    document.getElementById("trend-note").textContent = recordedMonths === 1
      ? "One tracked month: shown as a point, not an invented historical line."
      : "Cumulative since 9 Nov 2026, including recorded months before this window. — = not tracked.";
    const body = document.getElementById("trend-table-body");
    body.replaceChildren();
    series.forEach((row) => {
      const tr = element("tr");
      const label = element("th", "", monthFormat.format(dateFromKey(row.key, true)));
      label.scope = "row";
      const note = periodNote(row, "monthly");
      if (note) label.append(element("small", "table-period-note", note));
      const totalCell = element("td", "", row.cumulative === null ? "—" : numberFormat.format(row.cumulative));
      if (row.count !== null) totalCell.append(element("small", "table-period-note", `${numberFormat.format(row.count)} this month`));
      tr.append(label, totalCell);
      body.append(tr);
    });
    renderTrendChart();
  }

  function chartGeometry(host, values) {
    const width = Math.max(200, Math.round(host.getBoundingClientRect().width));
    const height = width < 500 ? 240 : 260;
    const maximum = Math.max(...values.map((value) => value || 0), 1);
    const magnitude = 10 ** Math.floor(Math.log10(maximum));
    const step = Math.max(1, Math.ceil(maximum / magnitude / 4) * magnitude);
    const ceiling = Math.ceil(maximum / step) * step;
    const left = Math.max(30, String(compactFormat.format(ceiling)).length * 7 + 12);
    return { width, height, left, top: 26, bottom: height - 30, plotWidth: width - left - 6, plotHeight: height - 56, step, ceiling };
  }

  function drawGrid(chart, geometry) {
    const { width, left, bottom, plotHeight, step, ceiling } = geometry;
    for (let value = 0; value <= ceiling; value += step) {
      const y = bottom - (value / ceiling) * plotHeight;
      chart.append(
        svgElement("line", { x1: left, x2: width - 6, y1: y, y2: y, class: value === 0 ? "chart-baseline" : "chart-grid-line" }),
        svgElement("text", { x: left - 9, y: y + 4, "text-anchor": "end", class: "chart-axis-label" }, compactFormat.format(value))
      );
    }
  }

  function renderTrendChart() {
    if (!dashboardData) return;
    const series = cumulativeSeries();
    trendHost.replaceChildren();
    const geometry = chartGeometry(trendHost, series.map((row) => row.cumulative));
    const { width, height, left, bottom, plotWidth, plotHeight, ceiling } = geometry;
    const slot = plotWidth / series.length;
    const points = series.filter((row) => row.cumulative !== null).map((row) => {
      const index = series.indexOf(row);
      return { row, x: left + slot * (index + .5), y: bottom - (row.cumulative / ceiling) * plotHeight };
    });
    const chart = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", "aria-labelledby": "trend-svg-title trend-svg-description" });
    chart.append(svgElement("title", { id: "trend-svg-title" }, "Cumulative tracked production, monthly"),
      svgElement("desc", { id: "trend-svg-description" }, series.map((row) => `${monthFormat.format(dateFromKey(row.key, true))}: ${row.cumulative === null ? "not tracked" : `${row.cumulative} cumulative generations, ${row.count} this month`}`).join("; ")));
    const definitions = svgElement("defs");
    const fill = svgElement("linearGradient", { id: "trend-area-fill", x1: "0", y1: "0", x2: "0", y2: "1" });
    fill.append(svgElement("stop", { offset: "0%", "stop-color": "#1da7ff", "stop-opacity": ".22" }),
      svgElement("stop", { offset: "100%", "stop-color": "#1da7ff", "stop-opacity": ".01" }));
    definitions.append(fill);
    chart.append(definitions);
    drawGrid(chart, geometry);
    if (points.length > 1) {
      const line = points.map((point) => `${point.x},${point.y}`).join(" ");
      chart.append(svgElement("polygon", { points: `${points[0].x},${bottom} ${line} ${points.at(-1).x},${bottom}`, fill: "url(#trend-area-fill)" }),
        svgElement("polyline", { points: line, class: "trend-line" }));
    }
    const valueInterval = Math.max(1, Math.ceil(55 / slot));
    points.forEach(({ row, x, y }, index) => {
      const marker = svgElement("circle", { cx: x, cy: y, r: 4, class: "trend-marker" });
      marker.append(svgElement("title", {}, `${monthFormat.format(dateFromKey(row.key, true))}: ${numberFormat.format(row.cumulative)} cumulative; ${row.count} this month`));
      chart.append(marker);
      if (index === points.length - 1 || (index % valueInterval === 0 && points.length - 1 - index >= valueInterval)) {
        chart.append(svgElement("text", { x, y: y - 12, "text-anchor": "middle", class: "chart-value chart-value-latest" }, compactFormat.format(row.cumulative)));
      }
    });
    const labelInterval = Math.max(1, Math.ceil(38 / slot));
    series.forEach((row, index) => {
      const x = left + slot * (index + .5);
      const latest = index === series.length - 1;
      if (row.cumulative === null) chart.append(svgElement("text", { x, y: bottom - 9, "text-anchor": "middle", class: "chart-untracked" }, "—"));
      if (latest || (index % labelInterval === 0 && series.length - 1 - index >= labelInterval)) {
        chart.append(svgElement("text", { x, y: height - 8, "text-anchor": "middle", class: "chart-axis-label" }, shortMonthFormat.format(dateFromKey(row.key, true))));
      }
    });
    trendHost.append(chart);
  }

  function renderChart() {
    if (!dashboardData) return;
    const series = activitySeries();
    chartHost.replaceChildren();
    if (!series.length) {
      chartHost.append(element("p", "chart-empty", "No activity to display yet."));
      return;
    }

    const geometry = chartGeometry(chartHost, series.map((row) => row.count));
    const { width, height, left, bottom, plotWidth, plotHeight, ceiling } = geometry;
    const slotWidth = plotWidth / series.length;
    const barWidth = Math.min(activePeriod === "daily" ? 76 : 104, slotWidth * .52);
    const labelInterval = Math.max(1, Math.ceil((activePeriod === "annual" ? 48 : 38) / slotWidth));
    const valueInterval = Math.max(1, Math.ceil(52 / slotWidth));
    const chart = svgElement("svg", {
      viewBox: `0 0 ${width} ${height}`,
      role: "img",
      "aria-labelledby": "activity-svg-title activity-svg-description"
    });
    chart.append(
      svgElement("title", { id: "activity-svg-title" }, `${activePeriod[0].toUpperCase() + activePeriod.slice(1)} generation activity`),
      svgElement("desc", { id: "activity-svg-description" }, series.map(rowDescription).join("; "))
    );
    const definitions = svgElement("defs");
    [["activity-bar-fill", "#258fd6", "#15466c"], ["activity-latest-fill", "#a7e1ff", "#1da7ff"]].forEach(([id, start, end]) => {
      const gradient = svgElement("linearGradient", { id, x1: "0", y1: "0", x2: "0", y2: "1" });
      gradient.append(svgElement("stop", { offset: "0%", "stop-color": start }), svgElement("stop", { offset: "100%", "stop-color": end }));
      definitions.append(gradient);
    });
    chart.append(definitions);

    drawGrid(chart, geometry);
    series.forEach((row, index) => {
      const center = left + slotWidth * (index + .5);
      const latest = index === series.length - 1;
      if (row.count === null) {
        chart.append(svgElement("text", { x: center, y: bottom - 9, "text-anchor": "middle", class: "chart-untracked" }, "—"));
      } else {
        const barHeight = (row.count / ceiling) * plotHeight;
        const bar = svgElement("rect", {
          x: center - barWidth / 2, y: bottom - barHeight,
          width: barWidth, height: barHeight, rx: Math.min(5, barHeight / 2),
          fill: `url(#${latest ? "activity-latest-fill" : "activity-bar-fill"})`, class: "chart-bar"
        });
        bar.append(svgElement("title", {}, rowDescription(row)));
        chart.append(bar);
        if (latest || (index % valueInterval === 0 && series.length - 1 - index >= valueInterval)) {
          chart.append(svgElement("text", {
            x: center, y: bottom - barHeight - 9, "text-anchor": "middle",
            class: `chart-value${latest ? " chart-value-latest" : ""}`
          }, `${compactFormat.format(row.count)}${row.partial ? "*" : ""}`));
        }
      }

      const regularLabel = index % labelInterval === 0;
      const spaceBeforeLatest = series.length - 1 - index >= labelInterval;
      if (latest || (regularLabel && spaceBeforeLatest)) {
        const label = activePeriod === "daily" ? row.key.slice(-2)
          : activePeriod === "annual" ? row.key : shortMonthFormat.format(dateFromKey(row.key, true));
        chart.append(svgElement("text", { x: center, y: height - 8, "text-anchor": "middle", class: "chart-axis-label" }, label));
      }
    });
    chartHost.append(chart);
  }

  function renderDashboard(source) {
    asOfDate = new Date();
    dashboardData = normalizeData(source);
    renderOverview();
    renderBreakdown();
    renderDates();
    renderActivity();
    renderGrowth();
    renderTrend();
  }

  function protectDashboard() {
    dashboard.hidden = true;
    dashboard.setAttribute("inert", "");
  }

  function endStatisticsSession() {
    sessionEnded = true;
    operationId += 1;
    verifiedToken = null;
    dashboardData = undefined;
    protectDashboard();
    logoutButton.hidden = true;
    if (activeController) activeController.abort();
    // These are the only browser storage keys this dashboard ever accesses.
    [TOKEN_KEY, EXPIRES_KEY].forEach((key) => {
      try { sessionStorage.removeItem(key); } catch (error) { /* Storage may be disabled. */ }
    });
    window.location.replace(LOGIN_PAGE);
  }

  function readStatisticsToken() {
    let token;
    let expires;
    try {
      token = sessionStorage.getItem(TOKEN_KEY);
      expires = sessionStorage.getItem(EXPIRES_KEY);
    } catch (error) {
      throw new StatisticsError("storage");
    }
    const expiry = expires === null ? null : Number(expires);
    if (!token || !token.trim() || (expiry !== null && (!Number.isFinite(expiry) || expiry <= Date.now()))) {
      endStatisticsSession();
      throw new StatisticsError("unauthorized");
    }
    return token;
  }

  function requireCurrentToken(token) {
    if (readStatisticsToken() !== token) throw new StatisticsError("session-changed");
  }

  async function requestJSON(url, token) {
    const controller = new AbortController();
    activeController = controller;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        signal: controller.signal
      });
      if (sessionEnded || controller.signal.aborted) throw new StatisticsError("cancelled");
      if (response.status === 401) {
        endStatisticsSession();
        throw new StatisticsError("unauthorized");
      }
      if (response.status === 503) throw new StatisticsError("unavailable");
      if (!response.ok) throw new StatisticsError("service");
      try {
        return await response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        throw new StatisticsError("invalid-response");
      }
    } catch (error) {
      if (timedOut) throw new StatisticsError("timeout");
      if (sessionEnded || controller.signal.aborted) throw new StatisticsError("cancelled");
      if (error instanceof StatisticsError) throw error;
      // Never display raw exceptions or response bodies, which may contain secrets.
      throw new StatisticsError("network");
    } finally {
      window.clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  }

  function validateStatisticsResponse(data) {
    const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
    const validCount = (value) => Number.isSafeInteger(value) && value >= 0;
    const validCounts = (value) => object(value) && Object.values(value).every(validCount);
    const validSeries = (rows, key, monthly) => Array.isArray(rows) && rows.every((row) => (
      object(row) && validDateKey(row[key], monthly) && validCount(row.count)
    ));
    if (!object(data) || !validCount(data.total_generations)
      || !validCounts(data.by_category) || !validCounts(data.by_subtype)
      || !validSeries(data.daily, "date", false) || !validSeries(data.monthly, "month", true)
      || data.timezone !== "UTC") {
      // An invalid/error response is not an empty statistics dataset.
      throw new StatisticsError("invalid-response");
    }
  }

  function connectionState(state, label, message = "") {
    document.getElementById("connection-badge").dataset.state = state;
    document.getElementById("connection-label").textContent = label;
    const feedback = document.getElementById("refresh-status");
    feedback.dataset.state = state;
    feedback.textContent = message;
  }

  function setRequestBusy(busy) {
    refreshButton.disabled = busy;
    retryButton.disabled = busy;
    refreshButton.classList.toggle("is-refreshing", busy);
    if (busy) refreshButton.setAttribute("aria-busy", "true");
    else refreshButton.removeAttribute("aria-busy");
    dashboard.setAttribute("aria-busy", String(busy));
    connectionGate.setAttribute("aria-busy", String(busy));
  }

  function connectionErrorMessage(error) {
    switch (error.code) {
      case "unavailable": return "Statistics are temporarily unavailable. Please retry shortly.";
      case "timeout": return "The server took too long to respond. It may still be waking up. Please retry.";
      case "network": return "Unable to reach the server. Check your connection and retry; the server may be waking up.";
      case "invalid-response": return "The server returned an unexpected Statistics response. Please retry.";
      case "storage": return "Browser session storage is unavailable. Allow session storage, then retry or sign in again.";
      case "session-changed": return "Your Statistics session changed. Retry to verify the current session.";
      default: return "Statistics could not be loaded. Please retry shortly.";
    }
  }

  async function refreshStatistics() {
    if (requestInFlight || sessionEnded) return;
    requestInFlight = true;
    const operation = ++operationId;
    setRequestBusy(true);
    connectionState("busy", dashboardData ? "Refreshing" : "Connecting", dashboardData ? "Retrieving the latest Statistics…" : "");
    retryButton.hidden = true;
    document.getElementById("connection-title").textContent = "Connecting to Statistics";
    document.getElementById("connection-message").textContent = "Checking your Statistics session. The server may take a minute to wake up.";
    try {
      const token = readStatisticsToken();
      logoutButton.hidden = false;
      if (verifiedToken !== token) {
        const result = await requestJSON(VERIFY_URL, token);
        if (operation !== operationId || sessionEnded) return;
        if (!result || result.ok !== true) throw new StatisticsError("invalid-response");
        verifiedToken = token;
      }
      requireCurrentToken(token);
      document.getElementById("connection-message").textContent = "Access verified. Loading Statistics…";
      const data = await requestJSON(DATA_URL, token);
      if (operation !== operationId || sessionEnded) return;
      requireCurrentToken(token);
      validateStatisticsResponse(data);
      const firstReveal = dashboard.hidden;
      renderDashboard(data);
      dashboard.hidden = false;
      dashboard.removeAttribute("inert");
      connectionGate.hidden = true;
      if (firstReveal) dashboard.focus({ preventScroll: true });
      connectionState("ready", "Connected", "Statistics updated successfully.");
      scheduleResize();
      refreshButton.classList.add("is-refreshed");
      window.clearTimeout(feedbackTimer);
      feedbackTimer = window.setTimeout(() => refreshButton.classList.remove("is-refreshed"), 1100);
    } catch (error) {
      if (operation !== operationId || sessionEnded) return;
      if (error.code === "session-changed") {
        verifiedToken = null;
        dashboardData = undefined;
        protectDashboard();
      }
      const message = connectionErrorMessage(error);
      if (dashboardData) {
        connectionState("error", "Refresh Failed", `${message} Showing data from the last successful refresh.`);
      } else {
        protectDashboard();
        connectionGate.hidden = false;
        document.getElementById("connection-title").textContent = "Statistics unavailable";
        document.getElementById("connection-message").textContent = message;
        retryButton.hidden = false;
        connectionState("error", "Unavailable");
      }
    } finally {
      if (operation === operationId) {
        requestInFlight = false;
        setRequestBusy(false);
      }
    }
  }
  refreshButton.addEventListener("click", refreshStatistics);
  retryButton.addEventListener("click", refreshStatistics);
  logoutButton.addEventListener("click", endStatisticsSession);

  periodButtons.forEach((button) => button.addEventListener("click", () => {
    if (!dashboardData || sessionEnded || dashboard.hidden) return;
    activePeriod = button.dataset.period;
    renderActivity();
  }));
  document.querySelector(".period-switch").addEventListener("keydown", (event) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const current = Math.max(0, periodButtons.indexOf(document.activeElement));
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? periodButtons.length - 1
      : (current + direction + periodButtons.length) % periodButtons.length;
    periodButtons[index].focus();
    periodButtons[index].click();
  });

  function scheduleResize() {
    window.cancelAnimationFrame(resizeFrame);
    resizeFrame = window.requestAnimationFrame(() => {
      renderChart();
      renderTrendChart();
    });
  }
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(chartHost);
    observer.observe(trendHost);
  } else {
    window.addEventListener("resize", scheduleResize);
  }

  document.getElementById("year").textContent = new Date().getFullYear();
  // A back/forward-cache restore must reauthorize before revealing old content.
  window.addEventListener("pagehide", () => {
    operationId += 1;
    protectDashboard();
    verifiedToken = null;
    if (activeController) activeController.abort();
  });
  window.addEventListener("pageshow", (event) => {
    if (!event.persisted) return;
    sessionEnded = false;
    requestInFlight = false;
    dashboardData = undefined;
    connectionGate.hidden = false;
    refreshStatistics();
  });
  window.AXLStats = Object.freeze({ refresh: refreshStatistics });
  refreshStatistics();
})();
