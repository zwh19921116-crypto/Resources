const CONFIG = window.EDG_CONFIG;
const DRAFT_KEY = 'edg-admin-draft';
const ADS_DRAFT_KEY = 'edg-admin-ads-draft';
const LOG_KEY = 'edg-admin-log';
let items = JSON.parse(JSON.stringify(window.EDG_RESOURCES || []));
const sourceSignature = JSON.stringify(window.EDG_RESOURCES || []);
const adsSourceSignature = JSON.stringify({
  ads: window.EDG_ADS || [],
  enabled: window.EDG_ADS_ENABLED !== false
});
let editingIndex = -1;
let selectedResourceIds = new Set();
let relatedResourceId = '';
let relatedSelection = new Set();
let relatedSearchTimer = null;
let fileHandle = null;
let projectHandle = null;
let folderPickerActive = false;
const PICKER_LOCK_KEY = 'edgeducate-admin-folder-picker-active';
const PICKER_LOCK_MAX_AGE_MS = 30 * 1000;

function acquirePickerLock() {
  try {
    const existing = JSON.parse(localStorage.getItem(PICKER_LOCK_KEY) || 'null');
    if (existing && Date.now() - existing.startedAt < PICKER_LOCK_MAX_AGE_MS) return false;
    localStorage.setItem(PICKER_LOCK_KEY, JSON.stringify({ startedAt: Date.now() }));
  } catch (e) {
    return false;
  }
  return true;
}

function releasePickerLock() {
  try { localStorage.removeItem(PICKER_LOCK_KEY); } catch (e) { /* ignore */ }
}
let dragIndex = -1;

let ads = JSON.parse(JSON.stringify(window.EDG_ADS || []));
let adsEnabled = window.EDG_ADS_ENABLED !== false;
let editingAdIndex = -1;
let adsFileHandle = null;
let adsDragIndex = -1;
let adsCalendarAnchor = (() => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
})();
let adsCalendarDragIndex = -1;
let adsCalendarSelectedIndex = 0;
let adsCalendarView = 'day';
let adsCalendarSearch = '';
let adsCalendarSearchOpen = false;
let adImageValue = '';

let clubDeals = JSON.parse(JSON.stringify(window.EDG_CLUB_DEALS || []));
let editingClubIndex = -1;
let clubFileHandle = null;
let packages = JSON.parse(JSON.stringify(window.EDG_PACKAGES || []));
let editingPackageIndex = -1;
let packagesFileHandle = null;

const $ = (id) => document.getElementById(id);
const dlg = $('dlg');
const adsDlg = $('ads-dlg');
const clubDlg = $('club-dlg');

function syncModalPageLock() {
  const anyOpen = Array.from(document.querySelectorAll('dialog')).some((node) => node.open);
  document.body.classList.toggle('modal-open', anyOpen);
}

const dialogLockObserver = new MutationObserver(syncModalPageLock);
document.querySelectorAll('dialog').forEach((node) => {
  dialogLockObserver.observe(node, { attributes: true, attributeFilter: ['open'] });
});
syncModalPageLock();

/* ---------- section navigation ---------- */
function showPanel(panelKey) {
  document.querySelectorAll('.side-nav-btn[data-panel]').forEach((item) => item.classList.toggle('is-active', item.dataset.panel === panelKey));
  document.querySelectorAll('.admin-panel').forEach((panel) => {
    panel.hidden = panel.id !== `panel-${panelKey}`;
  });
  if (panelKey === 'dashboard') renderDashboard();
}

document.querySelectorAll('.side-nav-btn[data-panel]').forEach((btn) => btn.addEventListener('click', () => {
  showPanel(btn.dataset.panel);
}));

document.querySelectorAll('[data-dash-panel]').forEach((btn) => btn.addEventListener('click', () => {
  showPanel(btn.dataset.dashPanel);
}));

function formatMoney(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}`;
}

function formatMoneyShort(value) {
  const amount = Math.round(Number(value) || 0);
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `$${amount}`;
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function monthLabel(monthKey) {
  const [yearText, monthText] = String(monthKey || '').split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!year || !month) return monthKey;
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'short' });
}

function monthKeyFromDateValue(value) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return '';
  return String(value).slice(0, 7);
}

function monthKeysWindow(count) {
  const keys = [];
  const now = new Date();
  const anchor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let i = count - 1; i >= 0; i -= 1) {
    const point = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    keys.push(`${point.getFullYear()}-${String(point.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function buildRevenueSeries(monthCount = 6) {
  const months = monthKeysWindow(monthCount);
  const fallbackMonth = months[months.length - 1];
  const base = months.map((month) => ({ month, ads: 0, club: 0, total: 0 }));
  const lookup = new Map(base.map((entry) => [entry.month, entry]));
  const collectMonth = (entry, first, second) => monthKeyFromDateValue(entry[first]) || monthKeyFromDateValue(entry[second]) || fallbackMonth;

  ads.filter((ad) => (ad.status || 'published') !== 'draft').forEach((ad) => {
    const month = collectMonth(ad, 'startDate', 'endDate');
    const slot = lookup.get(month);
    if (!slot) return;
    const value = Number(ad.revenue) || 0;
    slot.ads += value;
    slot.total += value;
  });

  clubDeals.filter((deal) => (deal.status || 'published') !== 'draft').forEach((deal) => {
    const month = collectMonth(deal, 'starts', 'expires');
    const slot = lookup.get(month);
    if (!slot) return;
    const value = Number(deal.revenue) || 0;
    slot.club += value;
    slot.total += value;
  });

  return base;
}

function smoothSvgPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const c = 0.2;
  let path = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) * c;
    const cp1y = p1.y + (p2.y - p0.y) * c;
    const cp2x = p2.x - (p3.x - p1.x) * c;
    const cp2y = p2.y - (p3.y - p1.y) * c;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

function renderTrendChart(series) {
  const host = $('dash-trend-chart');
  if (!host) return;
  if (!series.length) {
    host.innerHTML = '<div class="dash-trend-empty">No data available yet.</div>';
    return;
  }

  const width = 760;
  const height = 248;
  const padLeft = 56;
  const padRight = 18;
  const padTop = 14;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;
  const rawMax = Math.max(1, ...series.map((entry) => entry.total), ...series.map((entry) => entry.ads), ...series.map((entry) => entry.club));
  const topCap = Math.ceil(rawMax / 100) * 100;

  const xAt = (index) => (series.length === 1 ? padLeft + plotWidth / 2 : padLeft + (index / (series.length - 1)) * plotWidth);
  const yAt = (value) => padTop + (1 - (value / topCap)) * plotHeight;
  const pointsFor = (key) => series.map((entry, index) => ({ x: xAt(index), y: yAt(entry[key]), v: entry[key] }));
  const totalPts = pointsFor('total');
  const adsPts = pointsFor('ads');
  const clubPts = pointsFor('club');
  const totalPath = smoothSvgPath(totalPts);
  const adsPath = smoothSvgPath(adsPts);
  const clubPath = smoothSvgPath(clubPts);

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((step) => {
    const value = Math.round(topCap * (1 - step));
    const y = padTop + step * plotHeight;
    return { y, value };
  });

  const grid = yTicks.map((tick) => {
    const y = tick.y;
    return `<line class="dash-trend-grid" x1="${padLeft}" y1="${y.toFixed(2)}" x2="${(padLeft + plotWidth).toFixed(2)}" y2="${y.toFixed(2)}"></line>`;
  }).join('');
  const yLabels = yTicks.map((tick) => `<text class="dash-trend-axis y" x="${(padLeft - 8).toFixed(2)}" y="${(tick.y + 3).toFixed(2)}" text-anchor="end">${escapeHtml(formatMoneyShort(tick.value))}</text>`).join('');
  const labels = series.map((entry, index) => `<text class="dash-trend-axis" x="${xAt(index).toFixed(2)}" y="${height - 8}" text-anchor="middle">${escapeHtml(monthLabel(entry.month))}</text>`).join('');
  const totalDots = totalPts.map((pt) => `<circle class="dash-trend-dot total" cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="3.2"></circle>`).join('');
  const adsDots = adsPts.map((pt) => `<circle class="dash-trend-dot ads" cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="2.8"></circle>`).join('');
  const clubDots = clubPts.map((pt) => `<circle class="dash-trend-dot club" cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="2.8"></circle>`).join('');
  const areaPath = `${totalPath} L ${(padLeft + plotWidth).toFixed(2)} ${(padTop + plotHeight).toFixed(2)} L ${padLeft.toFixed(2)} ${(padTop + plotHeight).toFixed(2)} Z`;

  const lastTotal = series[series.length - 1]?.total || 0;
  const prevTotal = series[series.length - 2]?.total || 0;
  const mom = prevTotal > 0 ? ((lastTotal - prevTotal) / prevTotal) * 100 : 0;
  const momTone = mom >= 0 ? 'up' : 'down';

  host.innerHTML = `
    <div class="dash-trend-head">
      <span class="dash-trend-kpi">${formatMoney(lastTotal)}</span>
      <span class="dash-trend-mom ${momTone}">${mom >= 0 ? '+' : ''}${mom.toFixed(1)}% vs last month</span>
    </div>
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Revenue trend line chart">
      <defs>
        <linearGradient id="dash-total-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(167,139,250,.32)"></stop>
          <stop offset="100%" stop-color="rgba(167,139,250,0)"></stop>
        </linearGradient>
      </defs>
      ${grid}
      ${yLabels}
      <path class="dash-trend-area-total" d="${areaPath}"></path>
      <path class="dash-trend-line-total" d="${totalPath}"></path>
      <path class="dash-trend-line-ads" d="${adsPath}"></path>
      <path class="dash-trend-line-club" d="${clubPath}"></path>
      ${totalDots}${adsDots}${clubDots}
      ${labels}
    </svg>`;
}

function renderRevenueSplit(adsRevenue, clubRevenue) {
  const host = $('dash-split-chart');
  if (!host) return;
  const total = adsRevenue + clubRevenue;
  const adsShare = total > 0 ? (adsRevenue / total) * 100 : 0;
  const clubShare = total > 0 ? (clubRevenue / total) * 100 : 0;

  const r = 44;
  const c = 2 * Math.PI * r;
  const adsArc = c * (adsShare / 100);
  const clubArc = c * (clubShare / 100);

  host.innerHTML = `
    <div class="dash-split-visual">
      <svg viewBox="0 0 140 140" role="img" aria-label="Revenue split chart">
        <circle class="dash-donut-bg" cx="70" cy="70" r="${r}"></circle>
        <circle class="dash-donut-seg ads" cx="70" cy="70" r="${r}" stroke-dasharray="${adsArc} ${c - adsArc}" stroke-dashoffset="0"></circle>
        <circle class="dash-donut-seg club" cx="70" cy="70" r="${r}" stroke-dasharray="${clubArc} ${c - clubArc}" stroke-dashoffset="${-adsArc}"></circle>
      </svg>
      <div class="dash-donut-center"><strong>${formatMoney(total)}</strong><span>Total</span></div>
    </div>
    <div class="dash-split-list">
      <div class="dash-split-row">
        <div class="dash-split-head"><span><i class="dash-key ads"></i>Ads</span><strong>${formatMoney(adsRevenue)} · ${adsShare.toFixed(1)}%</strong></div>
        <div class="dash-split-track"><div class="dash-split-fill ads" style="width:${adsShare.toFixed(2)}%"></div></div>
      </div>
      <div class="dash-split-row">
        <div class="dash-split-head"><span><i class="dash-key club"></i>Club offers</span><strong>${formatMoney(clubRevenue)} · ${clubShare.toFixed(1)}%</strong></div>
        <div class="dash-split-track"><div class="dash-split-fill club" style="width:${clubShare.toFixed(2)}%"></div></div>
      </div>
    </div>`;
}

function renderMonthlyRevenueBars(series) {
  const host = $('dash-monthly-bars');
  if (!host) return;
  if (!series.length) {
    host.innerHTML = '<div class="dash-empty">No monthly revenue data yet.</div>';
    return;
  }
  const maxTotal = Math.max(1, ...series.map((row) => row.total));
  host.innerHTML = series.map((row) => {
    const adsWidth = Math.max(0, Math.min(100, (row.ads / maxTotal) * 100));
    const clubWidth = Math.max(0, Math.min(100 - adsWidth, (row.club / maxTotal) * 100));
    return `<div class="dash-bars-row"><span class="m">${escapeHtml(monthLabel(row.month))}</span><div class="dash-bars-track"><i class="dash-bars-seg ads" style="width:${adsWidth.toFixed(2)}%"></i><i class="dash-bars-seg club" style="width:${clubWidth.toFixed(2)}%"></i></div><strong>${escapeHtml(formatMoney(row.total))}</strong></div>`;
  }).join('');
}

function renderExpiringOffersTimeline() {
  const host = $('dash-expiry-list');
  if (!host) return;
  const today = adsTimezoneParts(new Date()).ymd;
  const entries = clubDeals
    .filter((deal) => (deal.status || 'published') !== 'draft' && deal.expires)
    .map((deal) => {
      const days = Math.round((localDateFromYmd(deal.expires) - localDateFromYmd(today)) / 86400000);
      return { deal, days };
    })
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);

  if (!entries.length) {
    host.innerHTML = '<div class="dash-empty">No dated published offers.</div>';
    return;
  }

  host.innerHTML = entries.map(({ deal, days }) => {
    const when = days < 0 ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`;
    const tagClass = days < 0 || days <= 7 ? 'tag warn' : 'tag';
    const value = Number(deal.revenue) || 0;
    return `<div class="dash-time-item"><div><strong>${escapeHtml(deal.title || 'Untitled offer')}</strong><span>Revenue ${escapeHtml(formatMoney(value))} · Expires ${escapeHtml(deal.expires)}</span></div><span class="${tagClass}">${escapeHtml(when)}</span></div>`;
  }).join('');
}

function renderTopRevenueContributors(adsRevenue, clubRevenue) {
  const host = $('dash-top-revenue');
  if (!host) return;
  const rows = [];
  ads.filter((ad) => (ad.status || 'published') !== 'draft').forEach((ad) => {
    rows.push({
      name: ad.title || 'Untitled ad',
      source: 'Ads',
      revenue: Number(ad.revenue) || 0
    });
  });
  clubDeals.filter((deal) => (deal.status || 'published') !== 'draft').forEach((deal) => {
    rows.push({
      name: deal.title || 'Untitled offer',
      source: 'Club',
      revenue: Number(deal.revenue) || 0
    });
  });

  const ranked = rows.filter((row) => row.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  if (!ranked.length) {
    host.innerHTML = '<div class="dash-empty">No contributors with revenue yet.</div>';
    return;
  }
  const total = Math.max(1, adsRevenue + clubRevenue);
  host.innerHTML = `<div class="dash-mini-head"><span>Name</span><span>Source</span><span>Share</span><span>Revenue</span></div>${ranked.map((row) => {
    const share = (row.revenue / total) * 100;
    return `<div class="dash-mini-row"><span>${escapeHtml(row.name)}</span><span class="src">${escapeHtml(row.source)}</span><span>${share.toFixed(1)}%</span><span class="val">${escapeHtml(formatMoney(row.revenue))}<span class="dash-mini-bar"><i style="width:${share.toFixed(2)}%"></i></span></span></div>`;
  }).join('')}`;
}

function renderSyncSummary(resourcesCreatedMonth, resourcesCreated30) {
  const host = $('dash-sync-list');
  if (!host) return;
  const latestPush = $('last-push-time')?.textContent?.trim() || 'Never';
  const latestPull = $('last-pull-time')?.textContent?.trim() || 'Never';
  const pushCount = logLines.filter((line) => /synced to github|pushed .*github/i.test(String(line.msg || ''))).length;
  const pullCount = logLines.filter((line) => /pulled latest from github/i.test(String(line.msg || ''))).length;
  const maxCount = Math.max(1, pushCount, pullCount, resourcesCreatedMonth, resourcesCreated30);
  const meter = (value, tone) => `<span class="dash-sync-meter ${tone}"><i style="width:${clampPercent((value / maxCount) * 100).toFixed(2)}%"></i></span>`;
  host.innerHTML = `
    <div class="dash-sync-row"><span>Last push</span><strong>${escapeHtml(latestPush)}</strong></div>
    <div class="dash-sync-row"><span>Last pull</span><strong>${escapeHtml(latestPull)}</strong></div>
    <div class="dash-sync-row"><span>Total pushes logged</span><div class="dash-sync-num"><strong>${pushCount}</strong>${meter(pushCount, 'push')}</div></div>
    <div class="dash-sync-row"><span>Total pulls logged</span><div class="dash-sync-num"><strong>${pullCount}</strong>${meter(pullCount, 'pull')}</div></div>
    <div class="dash-sync-row"><span>Resources created this month</span><div class="dash-sync-num"><strong>${resourcesCreatedMonth}</strong>${meter(resourcesCreatedMonth, 'create')}</div></div>
    <div class="dash-sync-row"><span>Resources created last 30 days</span><div class="dash-sync-num"><strong>${resourcesCreated30}</strong>${meter(resourcesCreated30, 'create')}</div></div>`;
}

function renderActivitySparkline() {
  const host = $('dash-activity-spark');
  if (!host) return;
  const days = 7;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const slots = Array.from({ length: days }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (days - 1 - i));
    return {
      key: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      value: 0
    };
  });
  const map = new Map(slots.map((slot) => [slot.key, slot]));
  logLines.forEach((line) => {
    if (!line || !line.d) return;
    const key = String(line.d).slice(0, 10);
    const slot = map.get(key);
    if (slot) slot.value += 1;
  });

  const width = 420;
  const height = 74;
  const left = 8;
  const right = 8;
  const top = 8;
  const bottom = 18;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const maxValue = Math.max(1, ...slots.map((slot) => slot.value));
  const points = slots.map((slot, index) => ({
    x: slots.length === 1 ? left + (plotW / 2) : left + (index / (slots.length - 1)) * plotW,
    y: top + (1 - (slot.value / maxValue)) * plotH,
    label: slot.label,
    value: slot.value
  }));
  const line = smoothSvgPath(points);
  const area = `${line} L ${(left + plotW).toFixed(2)} ${(top + plotH).toFixed(2)} L ${left.toFixed(2)} ${(top + plotH).toFixed(2)} Z`;
  const dots = points.map((point) => `<circle cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="2.6"></circle>`).join('');
  const labels = points.map((point) => `<text x="${point.x.toFixed(2)}" y="${height - 4}" text-anchor="middle">${escapeHtml(point.label)}</text>`).join('');

  host.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Activity trend last 7 days">
      <defs>
        <linearGradient id="dash-activity-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(125,211,252,.38)"></stop>
          <stop offset="100%" stop-color="rgba(125,211,252,0)"></stop>
        </linearGradient>
      </defs>
      <path class="dash-activity-area" d="${area}"></path>
      <path class="dash-activity-line" d="${line}"></path>
      <g class="dash-activity-dots">${dots}</g>
      <g class="dash-activity-labels">${labels}</g>
    </svg>`;
}

function renderDashboard() {
  const resourcesPublished = items.filter((item) => (item.status || 'published') !== 'draft').length;
  const resourcesDraft = items.length - resourcesPublished;
  const clubPublished = clubDeals.filter((deal) => (deal.status || 'published') !== 'draft').length;
  const clubWarnings = clubDeals.filter((deal) => {
    if ((deal.status || 'published') === 'draft') return false;
    return (deal.expires && deal.expires < adsTimezoneParts(new Date()).ymd)
      || (deal.actionEnabled !== false && !hasClubActionTarget(deal))
      || isLikelySampleClubDeal(deal);
  }).length;
  const packagePublished = packages.filter((entry) => (entry.status || 'published') !== 'draft').length;
  const packageDraft = packages.length - packagePublished;
  const now = new Date();
  const liveAds = ads.filter((ad) => ad.status !== 'draft' && adIsEligibleNow(ad, now)).length;
  const inWindowAds = ads.filter((ad) => ad.status !== 'draft' && adIsEligibleAroundNow(ad, now, 8, 30)).length;
  const publishedAds = ads.filter((ad) => (ad.status || 'published') !== 'draft').length;
  const adsRevenue = ads.filter((ad) => (ad.status || 'published') !== 'draft').reduce((sum, ad) => sum + (Number(ad.revenue) || 0), 0);
  const clubRevenue = clubDeals.filter((deal) => (deal.status || 'published') !== 'draft').reduce((sum, deal) => sum + (Number(deal.revenue) || 0), 0);
  const totalRevenue = adsRevenue + clubRevenue;
  const revenueSeries = buildRevenueSeries(6);
  const currentMonthRevenue = revenueSeries[revenueSeries.length - 1]?.total || 0;
  const latestPush = $('last-push-time')?.textContent?.trim() || 'Never';
  const nowDate = new Date();
  const monthKey = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;
  const thirtyDaysAgo = new Date(nowDate.getTime() - (30 * 24 * 60 * 60 * 1000));
  const resourcesCreatedMonth = items.filter((item) => String(item.added || '').slice(0, 7) === monthKey).length;
  const resourcesCreated30 = items.filter((item) => {
    if (!item.added) return false;
    const created = new Date(item.added);
    return !Number.isNaN(created.getTime()) && created >= thirtyDaysAgo;
  }).length;

  const healthRows = [
    {
      name: 'Resources',
      detail: `${resourcesPublished} published${resourcesDraft ? ` · ${resourcesDraft} draft` : ''}`,
      stateClass: resourcesDraft ? 'state-warn' : 'state-ok',
      stateText: resourcesDraft ? 'Review' : 'Good',
      meterClass: 'resources',
      meterValue: items.length ? (resourcesPublished / items.length) * 100 : 0
    },
    {
      name: 'Club offers',
      detail: `${clubPublished} published${clubWarnings ? ` · ${clubWarnings} warning${clubWarnings === 1 ? '' : 's'}` : ''}`,
      stateClass: clubWarnings ? 'state-warn' : 'state-ok',
      stateText: clubWarnings ? 'Attention' : 'Good',
      meterClass: 'club',
      meterValue: clubDeals.length ? (clubPublished / clubDeals.length) * 100 : 0
    },
    {
      name: 'Advertising',
      detail: adsEnabled ? `${inWindowAds} in window · ${liveAds} live now` : 'Ads are currently off',
      stateClass: adsEnabled ? 'state-ok' : 'state-off',
      stateText: adsEnabled ? 'Active' : 'Off',
      meterClass: 'ads',
      meterValue: ads.length ? (publishedAds / ads.length) * 100 : 0
    },
    {
      name: 'Packages',
      detail: `${packagePublished} published${packageDraft ? ` · ${packageDraft} draft` : ''}`,
      stateClass: packageDraft ? 'state-warn' : 'state-ok',
      stateText: packageDraft ? 'Review' : 'Good',
      meterClass: 'packages',
      meterValue: packages.length ? (packagePublished / packages.length) * 100 : 0
    }
  ];

  const recent = logLines.slice(-6).reverse();

  if ($('dash-revenue-total')) $('dash-revenue-total').textContent = formatMoney(totalRevenue);
  if ($('dash-revenue-meta')) $('dash-revenue-meta').textContent = `This month: ${formatMoney(currentMonthRevenue)}`;
  if ($('dash-revenue-ads')) $('dash-revenue-ads').textContent = formatMoney(adsRevenue);
  if ($('dash-revenue-ads-meta')) $('dash-revenue-ads-meta').textContent = `${inWindowAds} active ad campaign${inWindowAds === 1 ? '' : 's'}`;
  if ($('dash-revenue-club')) $('dash-revenue-club').textContent = formatMoney(clubRevenue);
  if ($('dash-revenue-club-meta')) $('dash-revenue-club-meta').textContent = `${clubPublished} published offer${clubPublished === 1 ? '' : 's'}`;
  if ($('dash-created-month')) $('dash-created-month').textContent = String(resourcesCreatedMonth);
  if ($('dash-created-meta')) $('dash-created-meta').textContent = `Last 30 days: ${resourcesCreated30}`;
  if ($('dash-last-sync')) $('dash-last-sync').textContent = latestPush;
  renderTrendChart(revenueSeries);
  renderRevenueSplit(adsRevenue, clubRevenue);
  renderMonthlyRevenueBars(revenueSeries);
  renderExpiringOffersTimeline();
  renderTopRevenueContributors(adsRevenue, clubRevenue);
  renderSyncSummary(resourcesCreatedMonth, resourcesCreated30);
  renderActivitySparkline();
  if ($('dash-modules-list')) {
    $('dash-modules-list').innerHTML = healthRows.map((row) => `<div class="dash-item"><div class="dash-item-copy"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.detail)}</span><span class="dash-item-meter"><i class="${row.meterClass}" style="width:${clampPercent(row.meterValue).toFixed(2)}%"></i></span></div><span class="state ${row.stateClass}">${escapeHtml(row.stateText)}</span></div>`).join('');
  }
  if ($('dash-recent-list')) {
    $('dash-recent-list').innerHTML = recent.length
      ? recent.map((line) => {
        const tone = line.kind === 'bad' ? 'bad' : line.kind === 'warnl' ? 'warn' : 'ok';
        return `<div class="dash-recent-item ${tone}"><span class="dash-recent-dot"></span><strong>${escapeHtml(line.t)}</strong> · ${escapeHtml(line.msg)}</div>`;
      }).join('')
      : '<div class="dash-recent-item">No activity yet.</div>';
  }
}

/* ---------- activity log ---------- */
let logLines = [];
try {
  logLines = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
} catch (e) {
  logLines = [];
}

function log(msg, kind, ref) {
  const message = String(msg);
  const now = new Date();
  const line = { t: now.toLocaleTimeString(), d: now.toISOString(), msg: message, kind: kind || '', ref: ref || '' };
  logLines.push(line);
  if (logLines.length > 300) logLines = logLines.slice(-300);
  try { localStorage.setItem(LOG_KEY, JSON.stringify(logLines)); } catch (e) { /* ignore */ }
  if (window.desktop && window.desktop.writeLog) {
    const level = kind === 'bad' ? 'error' : kind === 'warnl' ? 'warn' : 'info';
    window.desktop.writeLog(message, level).catch(() => {});
  }
  paintLog();
}

let logFilter = '';

function paintLog() {
  const body = $('log-body');
  if (!body) return;
  const lines = logFilter ? logLines.filter((l) => l.ref === logFilter) : logLines;
  body.innerHTML = lines.length
    ? lines.map((l) => `<div><span class="t">${l.t}</span>  <span class="${l.kind}">${escapeHtml(l.msg)}</span></div>`).join('')
    : '<p class="log-empty">Nothing recorded yet.</p>';
  body.scrollTop = body.scrollHeight;
}

function openLog(ref, label) {
  logFilter = ref || '';
  $('log-title').textContent = ref ? `Activity: ${label}` : 'Activity log';
  $('log-all').hidden = !ref;
  paintLog();
  $('log-dlg').showModal();
}

window.addEventListener('error', (e) => log(`JS ERROR: ${e.message} (${e.filename}:${e.lineno})`, 'bad'));
window.addEventListener('unhandledrejection', (e) => log(`PROMISE ERROR: ${e.reason && e.reason.message ? e.reason.message : e.reason}`, 'bad'));

/** Unsaved edits live here so a refresh or crash never loses them. */
function keepDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ at: Date.now(), sourceSignature, items }));
  } catch (e) {
    /* storage full or blocked - the file save is still the real backup */
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  $('draft-bar').hidden = true;
}

function restoreDraft() {
  const raw = localStorage.getItem(DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft.sourceSignature !== sourceSignature) return clearDraft();
    if (JSON.stringify(draft.items) === JSON.stringify(items)) return clearDraft();
    items = draft.items;
    const when = new Date(draft.at).toLocaleString();
    $('draft-when').textContent = when;
    $('draft-bar').hidden = false;
  } catch (e) {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function keepAdsDraft() {
  try {
    localStorage.setItem(ADS_DRAFT_KEY, JSON.stringify({
      at: Date.now(),
      sourceSignature: adsSourceSignature,
      adsEnabled,
      ads
    }));
  } catch (e) {
    /* storage full or blocked */
  }
}

function clearAdsDraft() {
  localStorage.removeItem(ADS_DRAFT_KEY);
}

function restoreAdsDraft() {
  const raw = localStorage.getItem(ADS_DRAFT_KEY);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw);
    if (draft.sourceSignature !== adsSourceSignature) return clearAdsDraft();
    const draftAds = Array.isArray(draft.ads) ? draft.ads : [];
    const draftEnabled = draft.adsEnabled !== false;
    if (JSON.stringify(draftAds) === JSON.stringify(ads) && draftEnabled === adsEnabled) return clearAdsDraft();

    ads = draftAds;
    adsEnabled = draftEnabled;

    const toggle = $('ads-enabled-toggle');
    if (toggle) {
      toggle.classList.toggle('is-on', adsEnabled);
      toggle.setAttribute('aria-checked', String(adsEnabled));
    }

    log(`Restored unsaved advertising changes from ${new Date(draft.at).toLocaleString()}.`, 'warnl');
  } catch (e) {
    localStorage.removeItem(ADS_DRAFT_KEY);
  }
}

/* ---------- dropdowns ---------- */
function fillSelect(select, values, labels) {
  select.innerHTML = '';
  values.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = labels ? labels[i] : v;
    select.appendChild(o);
  });
}
const typeKeys = Object.keys(CONFIG.types);
const stageKeys = Object.keys(CONFIG.educationStages || {});
fillSelect($('f-type'), typeKeys, typeKeys.map((k) => CONFIG.types[k].label));
fillSelect($('f-art'), CONFIG.artStyles);
fillSelect($('f-stage'), stageKeys, stageKeys.map((k) => CONFIG.educationStages[k].label));
fillSelect($('f-subject'), CONFIG.subjects);
fillSelect($('f-year'), CONFIG.years);
fillSelect($('f-unit'), CONFIG.vceUnits || []);
fillSelect($('f-level'), CONFIG.levels);

function fillAssociatedResourceSelect(select, resourceType, emptyLabel) {
  const currentValue = select.value;
  select.innerHTML = `<option value="">${emptyLabel}</option>`;
  items.filter((item) => item.status !== 'draft' && item.type === resourceType)
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')))
    .forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title;
      select.appendChild(option);
    });
  select.value = currentValue;
}

function updateViewTypeFields() {
  const isQuestionPaper = $('f-view-type').value === 'question-paper';
  $('f-question-paper-fields').hidden = !isQuestionPaper;
  $('f-question-video-pairs-field').hidden = !isQuestionPaper;
  if (isQuestionPaper) {
    fillAssociatedResourceSelect($('f-question-resource'), 'practice-questions', 'Select a question resource');
    fillAssociatedResourceSelect($('f-video-resource'), 'video', 'Select an associated video');
  }
}

function questionVideoPairOptions(selectedQuestion = '', selectedVideo = '') {
  const questionOptions = ['<option value="">Select question resource</option>', ...items
    .filter((item) => item.status !== 'draft' && ['practice-questions', 'practice-exam', 'knowledge-sheet'].includes(item.type))
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')))
    .map((item) => `<option value="${escapeAttr(item.id)}"${item.id === selectedQuestion ? ' selected' : ''}>${escapeHtml(item.title)}</option>`)].join('');
  const videoOptions = ['<option value="">Select video</option>', ...items
    .filter((item) => item.status !== 'draft' && item.type === 'video')
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')))
    .map((item) => `<option value="${escapeAttr(item.id)}"${item.id === selectedVideo ? ' selected' : ''}>${escapeHtml(item.title)}</option>`)].join('');
  return { questionOptions, videoOptions };
}

function renderQuestionVideoPairs(pairs = []) {
  const host = $('f-question-video-pairs');
  if (!host) return;
  const rows = pairs.length ? pairs : [{ questionResourceId: '', videoResourceId: '', page: '', top: 0, bottom: 100 }];
  host.innerHTML = rows.map((pair, index) => {
    const options = questionVideoPairOptions(pair.questionResourceId, pair.videoResourceId);
    return `<div class="admin-question-video-row"><span class="admin-question-video-number">${index + 1}</span><select data-pair-question aria-label="Question resource ${index + 1}">${options.questionOptions}</select><input data-pair-page type="number" min="1" step="1" value="${escapeAttr(pair.page || '')}" placeholder="Page" aria-label="PDF page ${index + 1}"><input data-pair-top type="number" min="0" max="100" step="1" value="${escapeAttr(pair.top ?? 0)}" placeholder="Top %" aria-label="Top percent ${index + 1}"><input data-pair-bottom type="number" min="0" max="100" step="1" value="${escapeAttr(pair.bottom ?? 100)}" placeholder="Bottom %" aria-label="Bottom percent ${index + 1}"><select data-pair-video aria-label="Video ${index + 1}">${options.videoOptions}</select><button class="icon-btn" type="button" data-remove-question-video aria-label="Remove question link">×</button></div>`;
  }).join('');
  host.querySelectorAll('[data-remove-question-video]').forEach((button) => button.addEventListener('click', () => {
    const current = readQuestionVideoPairs(true);
    current.splice(Number(button.closest('[data-remove-question-video]')?.parentElement?.querySelector('.admin-question-video-number')?.textContent || 1) - 1, 1);
    renderQuestionVideoPairs(current);
  }));
  renderQuestionVideoPreview();
}

function renderQuestionVideoPreview() {
  const host = $('f-question-video-preview');
  if (!host) return;
  const pairs = readQuestionVideoPairs(true);
  host.innerHTML = pairs.map((pair, index) => {
    const top = Math.max(0, Math.min(99, Number(pair.top) || 0));
    const bottom = Math.max(top + 1, Math.min(100, Number(pair.bottom) || 100));
    const question = items.find((item) => item.id === pair.questionResourceId);
    const video = items.find((item) => item.id === pair.videoResourceId);
    return `<div class="admin-marker-preview-item"><div class="admin-marker-page"><span class="admin-marker-band" style="top:${top}%;height:${bottom - top}%"><b>Q${index + 1}</b></span><i class="admin-marker-line one"></i><i class="admin-marker-line two"></i><i class="admin-marker-line three"></i></div><div class="admin-marker-copy"><strong>Question ${index + 1}${pair.page ? ` · Page ${escapeHtml(pair.page)}` : ''}</strong><span>${escapeHtml(question?.title || 'Question not selected')}</span><span>${escapeHtml(video?.title || 'Video not selected')}</span><small>Marked from ${top}% to ${bottom}%</small></div></div>`;
  }).join('') || '<span class="hint">Add a question link to preview its marker.</span>';
}

function readQuestionVideoPairs(includeEmpty = false) {
  return [...document.querySelectorAll('#f-question-video-pairs .admin-question-video-row')].map((row) => ({
    questionResourceId: row.querySelector('[data-pair-question]')?.value || '',
    videoResourceId: row.querySelector('[data-pair-video]')?.value || '',
    page: row.querySelector('[data-pair-page]')?.value || '',
    top: row.querySelector('[data-pair-top]')?.value || '0',
    bottom: row.querySelector('[data-pair-bottom]')?.value || '100'
  })).filter((pair) => includeEmpty || pair.questionResourceId || pair.videoResourceId);
}

$('f-add-question-video').addEventListener('click', () => {
  renderQuestionVideoPairs([...readQuestionVideoPairs(true), { questionResourceId: '', videoResourceId: '', page: '', top: 0, bottom: 100 }]);
});

document.addEventListener('input', (event) => {
  if (event.target.closest('#f-question-video-pairs')) renderQuestionVideoPreview();
});

/* ---------- table ---------- */
function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function stageFor(resource) {
  if (resource.stage && CONFIG.educationStages[resource.stage]) return resource.stage;
  return String(resource.year || '').startsWith('VCE') ? 'vce' : 'secondary';
}

function resourcePagePath(resource) {
  return encodeURIComponent(resource.id);
}

function relatedResourcesFor(resource) {
  const explicitIds = Array.isArray(resource.relatedIds) ? resource.relatedIds : [];
  const explicitlyLinked = items.filter((item) => item.id !== resource.id
    && item.status !== 'draft'
    && (explicitIds.includes(item.id) || (Array.isArray(item.relatedIds) && item.relatedIds.includes(resource.id))));
  if (Array.isArray(resource.relatedIds)) return explicitlyLinked.slice(0, 6);

  const tags = new Set((resource.tags || []).map((tag) => String(tag).toLowerCase()));
  return items
    .filter((item) => item.id !== resource.id && item.subject === resource.subject && item.status !== 'draft')
    .map((item) => {
      const sharedTags = (item.tags || []).filter((tag) => tags.has(String(tag).toLowerCase())).length;
      const score = (item.year === resource.year ? 12 : 0)
        + (item.type === resource.type ? 5 : 0)
        + (stageFor(item) === stageFor(resource) ? 3 : 0)
        + sharedTags * 4;
      return { item, score };
    })
    .sort((left, right) => right.score - left.score || String(right.item.added || '').localeCompare(String(left.item.added || '')))
    .slice(0, 6)
    .map(({ item }) => item);
}

function renderRelatedResourceOptions(resource) {
  const wrap = $('f-related');
  if (!wrap) return;
  const selected = relatedSelection;
  const query = ($('f-related-search')?.value || '').trim().toLowerCase();
  const options = items
    .filter((item) => item.id !== resource.id)
    .sort((left, right) => String(left.title || '').localeCompare(String(right.title || '')));
  const matches = query
    ? options.filter((item) => `${item.title} ${item.id} ${item.subject || ''} ${item.year || ''} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query)).slice(0, 50)
    : options.filter((item) => selected.has(item.id));
  wrap.innerHTML = matches.length ? matches.map((item) => `
    <label class="admin-related-option">
      <input type="checkbox" value="${escapeAttr(item.id)}"${selected.has(item.id) ? ' checked' : ''} />
      <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(`${typeLabel(item.type)} · ${item.subject || ''} · ${item.year || ''}`)}</small></span>
    </label>`).join('') : `<span class="hint">${query ? 'No matching resources.' : selected.size ? 'Selected resources will appear here.' : 'Type to search for a related resource.'}</span>`;
  wrap.querySelectorAll('input[type="checkbox"]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) relatedSelection.add(input.value);
    else relatedSelection.delete(input.value);
  }));
}

$('f-related-search').addEventListener('input', () => {
  clearTimeout(relatedSearchTimer);
  relatedSearchTimer = setTimeout(() => renderRelatedResourceOptions({ id: relatedResourceId }), 120);
});

function renderTable() {
  keepDraft();
  const q = $('search').value.trim().toLowerCase();
  const wrap = $('table-wrap');
  const visible = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => !q || `${item.title} ${item.subject} ${item.year} ${(item.tags || []).join(' ')}`.toLowerCase().includes(q));

  const resourceIds = new Set(items.map((item) => item.id));
  selectedResourceIds.forEach((id) => {
    if (!resourceIds.has(id)) selectedResourceIds.delete(id);
  });

  $('count').textContent = `${items.length} resource${items.length === 1 ? '' : 's'}`;
  updateResourceSelectionUi(visible.map(({ item }) => item.id));
  renderDashboard();

  if (!items.length) {
    wrap.innerHTML = '<div class="empty">No resources yet. Click <b>+ Add resource</b> to create the first one.</div>';
    return;
  }
  if (!visible.length) {
    wrap.innerHTML = '<div class="empty">Nothing matches that search.</div>';
    return;
  }

  const rows = visible.map(({ item, index }) => {
    const type = CONFIG.types[item.type] || { label: item.type, colour: 'blue' };
    return `
      <tr draggable="true" data-index="${index}">
        <td><input class="resource-checkbox" type="checkbox" data-resource-select="${escapeAttr(item.id)}" aria-label="Select ${escapeAttr(item.title)}"${selectedResourceIds.has(item.id) ? ' checked' : ''} /></td>
        <td class="grip" title="Drag to reorder">⠿</td>
        <td class="title">${escapeHtml(item.title)}</td>
        <td><span class="pill ${type.colour}">${escapeHtml(type.label)}</span></td>
        <td class="sub">${escapeHtml(item.subject || '')}<small>${escapeHtml(item.year || '')}</small></td>
        <td class="url"><a href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(shorten(item.url))}</a></td>
        <td><span class="status status-${item.status || 'published'}">${item.status === 'draft' ? 'Draft' : 'Published'}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-act="up" title="Move up">↑</button>
            <button class="icon-btn" data-act="down" title="Move down">↓</button>
            <button class="icon-btn" data-act="log" title="View this resource's history">◴</button>
            <button class="icon-btn" data-act="edit" title="Edit">✎</button>
            <button class="icon-btn" data-act="del" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="table-card">
      <table>
        <thead><tr><th><input class="resource-checkbox" type="checkbox" id="select-visible-resources" aria-label="Select visible resources" /></th><th></th><th>Title</th><th>Type</th><th>Subject</th><th>Link</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  const selectVisible = wrap.querySelector('#select-visible-resources');
  const visibleIds = visible.map(({ item }) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedResourceIds.has(id));
  selectVisible.checked = allVisibleSelected;
  selectVisible.indeterminate = !allVisibleSelected && visibleIds.some((id) => selectedResourceIds.has(id));
  selectVisible.addEventListener('change', () => {
    visibleIds.forEach((id) => {
      if (selectVisible.checked) selectedResourceIds.add(id);
      else selectedResourceIds.delete(id);
    });
    renderTable();
  });
  wrap.querySelectorAll('[data-resource-select]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    if (checkbox.checked) selectedResourceIds.add(checkbox.dataset.resourceSelect);
    else selectedResourceIds.delete(checkbox.dataset.resourceSelect);
    updateResourceSelectionUi(visibleIds);
  }));
  wrap.querySelectorAll('tbody tr').forEach(bindRow);
}

function updateResourceSelectionUi(visibleIds = []) {
  const count = selectedResourceIds.size;
  $('resource-selection-count').textContent = `${count} selected`;
  $('btn-delete-selected').disabled = count === 0;
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedResourceIds.has(id));
  $('btn-select-visible').textContent = allVisibleSelected ? 'Deselect visible' : 'Select visible';
}

function deleteSelectedResources() {
  const selected = items.filter((item) => selectedResourceIds.has(item.id));
  if (!selected.length) return;
  const confirmation = prompt(`Type DELETE to remove ${selected.length} selected resource${selected.length === 1 ? '' : 's'}.\n\nThis only removes the cards from the site. The files in your Drive are untouched.`);
  if (confirmation !== 'DELETE') return;
  selected.forEach((item) => log(`Deleted "${item.title}"`, 'warnl', item.id));
  items = items.filter((item) => !selectedResourceIds.has(item.id));
  selectedResourceIds.clear();
  renderTable();
  autoSave('bulk delete');
}

async function refreshDesktopResources() {
  // Disabled in desktop mode to avoid replacing freshly added in-memory rows.
}

function bindRow(tr) {
  const index = Number(tr.dataset.index);

  tr.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      if (act === 'edit') return openForm(index);
      if (act === 'log') return openLog(items[index].id, items[index].title);
      if (act === 'del') {
        if (confirm(`Delete "${items[index].title}"?\n\nThis only removes the card from the site. The file in your Drive is untouched.`)) {
          log(`Deleted "${items[index].title}"`, 'warnl', items[index].id);
          selectedResourceIds.delete(items[index].id);
          items.splice(index, 1);
          renderTable();
          autoSave('delete');
        }
        return;
      }
      const to = act === 'up' ? index - 1 : index + 1;
      if (to < 0 || to >= items.length) return;
      [items[index], items[to]] = [items[to], items[index]];
      renderTable();
      autoSave('reorder');
    });
  });

  tr.addEventListener('dragstart', () => { dragIndex = index; });
  tr.addEventListener('dragover', (e) => { e.preventDefault(); tr.classList.add('drag-over'); });
  tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
  tr.addEventListener('drop', (e) => {
    e.preventDefault();
    tr.classList.remove('drag-over');
    if (dragIndex < 0 || dragIndex === index) return;
    const [moved] = items.splice(dragIndex, 1);
    items.splice(index, 0, moved);
    dragIndex = -1;
    renderTable();
    autoSave('reorder');
  });
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = escapeHtml;
const shorten = (u) => (String(u).length > 60 ? String(u).slice(0, 60) + '…' : String(u));

const ADS_TIMEZONE = 'Australia/Melbourne';
const adsTimezoneFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: ADS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function adsTimezoneParts(date) {
  const pieces = adsTimezoneFormatter.formatToParts(date);
  const out = {};
  pieces.forEach((piece) => {
    if (piece.type !== 'literal') out[piece.type] = piece.value;
  });
  return {
    ymd: `${out.year}-${out.month}-${out.day}`,
    minutes: (Number(out.hour) * 60) + Number(out.minute)
  };
}

/* ---------- advertising ---------- */
function adScheduleSummary(ad) {
  const parts = [];
  if (ad.startDate || ad.endDate) parts.push(`${ad.startDate || 'any date'} \u2192 ${ad.endDate || 'ongoing'}`);
  if (ad.startTime || ad.endTime) parts.push(`${ad.startTime || '00:00'}\u2013${ad.endTime || '23:59'} daily`);
  return parts.length ? parts.join(' · ') : 'Always eligible';
}

const adsMomentFormatter = new Intl.DateTimeFormat('en-AU', {
  timeZone: ADS_TIMEZONE,
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false
});

function adsFormatMoment(date) {
  return adsMomentFormatter.format(date).replace(',', '');
}

function adDraftFromForm() {
  return {
    id: $('ad-id')?.value?.trim() || '',
    title: $('ad-title')?.value?.trim() || 'Untitled ad',
    startDate: $('ad-start-date')?.value || '',
    endDate: $('ad-end-date')?.value || '',
    startTime: $('ad-start-time')?.value || '',
    endTime: $('ad-end-time')?.value || '',
    status: $('ad-status')?.value || 'published',
    duration: Math.min(30, Math.max(2, Number($('ad-duration')?.value) || 4))
  };
}

function adNextEligibleMoment(ad, now, maxDays = 14, stepMinutes = 15) {
  const step = Math.max(5, Number(stepMinutes) || 15);
  const stepMs = step * 60000;
  const days = Math.max(1, Number(maxDays) || 14);
  const steps = Math.max(24, Math.round((days * 24 * 60) / step));
  let wasEligible = adIsEligibleNow(ad, now);

  for (let i = 1; i <= steps; i += 1) {
    const probe = new Date(now.getTime() + (i * stepMs));
    const eligible = adIsEligibleNow(ad, probe);
    if (eligible && !wasEligible) return probe;
    wasEligible = eligible;
  }
  return null;
}

function renderAdEditorSchedulePanel() {
  const nowWrap = $('ad-now-list');
  const upcomingWrap = $('ad-upcoming-list');
  const note = $('ad-side-note');
  if (!nowWrap || !upcomingWrap || !note) return;

  const now = new Date();
  const draft = adDraftFromForm();
  const candidateAds = ads.map((ad, index) => (index === editingAdIndex ? { ...ad, ...draft } : ad));
  const publishedAds = candidateAds.filter((ad) => (ad.status || 'published') !== 'draft');
  const liveNow = publishedAds.filter((ad) => adIsEligibleNow(ad, now));
  const upcoming = publishedAds
    .filter((ad) => !adIsEligibleNow(ad, now))
    .map((ad) => ({ ad, at: adNextEligibleMoment(ad, now) }))
    .filter((entry) => entry.at)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, 6);

  nowWrap.innerHTML = liveNow.length
    ? liveNow.map((ad) => `<div class="ad-side-item"><strong>${escapeHtml(ad.title || 'Untitled ad')}</strong><span>${escapeHtml(adScheduleSummary(ad))}</span></div>`).join('')
    : '<p class="ad-side-empty">No ads are live at this minute.</p>';

  upcomingWrap.innerHTML = upcoming.length
    ? upcoming.map(({ ad, at }) => `<div class="ad-side-item"><strong>${escapeHtml(ad.title || 'Untitled ad')}</strong><span>${escapeHtml(adsFormatMoment(at))} · ${escapeHtml(adScheduleSummary(ad))}</span></div>`).join('')
    : '<p class="ad-side-empty">No upcoming slots in the next 14 days.</p>';

  note.textContent = `Current ${ADS_TIMEZONE} time: ${adsFormatMoment(now)}.`;
}

function renderAdsTable() {
  const wrap = $('ads-table-wrap');
  $('ads-count').textContent = `${ads.length} ad${ads.length === 1 ? '' : 's'}`;

  if (!ads.length) {
    wrap.innerHTML = '<div class="empty">No ads yet. Click <b>+ Add ad</b> to create the first one.</div>';
  } else {
    const rows = ads.map((ad, index) => `
      <tr draggable="true" data-index="${index}">
        <td class="grip" title="Drag to reorder">⠿</td>
        <td class="title">${escapeHtml(ad.title)}</td>
        <td class="sub">${escapeHtml(adScheduleSummary(ad))}</td>
        <td class="sub">${Math.max(2, Number(ad.duration) || 4)}s</td>
        <td><span class="status status-${ad.status || 'published'}">${ad.status === 'draft' ? 'Draft' : 'Published'}</span></td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-act="preview" title="Preview">👁</button>
            <button class="icon-btn" data-act="up" title="Move up">↑</button>
            <button class="icon-btn" data-act="down" title="Move down">↓</button>
            <button class="icon-btn" data-act="edit" title="Edit">✎</button>
            <button class="icon-btn" data-act="del" title="Delete">🗑</button>
          </div>
        </td>
      </tr>`).join('');

    wrap.innerHTML = `
      <div class="table-card">
        <table>
          <thead><tr><th></th><th>Headline</th><th>Schedule</th><th>Time</th><th>Status</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;

    wrap.querySelectorAll('tbody tr').forEach(bindAdRow);
  }
  renderAdsSchedule();
}

function localYmd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when now falls inside the ad's date period and daily time slot (blank = no restriction). */
function adIsEligibleNow(ad, now) {
  const zonedNow = adsTimezoneParts(now);
  const today = zonedNow.ymd;
  if (ad.startDate && today < ad.startDate) return false;
  if (ad.endDate && today > ad.endDate) return false;
  if (ad.startTime || ad.endTime) {
    const nowMinutes = zonedNow.minutes;
    const [sh, sm] = (ad.startTime || '00:00').split(':').map(Number);
    const [eh, em] = (ad.endTime || '23:59').split(':').map(Number);
    const start = sh * 60 + sm;
    const end = eh * 60 + em;
    return start <= end ? nowMinutes >= start && nowMinutes <= end : nowMinutes >= start || nowMinutes <= end;
  }
  return true;
}

function adWindowState(ad, now) {
  if (ad.status === 'draft') return { text: 'Draft', tone: 'draft' };
  const today = adsTimezoneParts(now).ymd;
  if (ad.endDate && today > ad.endDate) return { text: 'Expired', tone: 'expired' };
  if (ad.startDate && today < ad.startDate) return { text: 'Upcoming', tone: 'upcoming' };
  return adIsEligibleNow(ad, now) ? { text: 'Live now', tone: 'live' } : { text: 'Outside time slot', tone: 'upcoming' };
}

function adIsEligibleAroundNow(ad, now, hours = 8, stepMinutes = 30) {
  if (ad.status === 'draft') return false;
  const totalMinutes = Math.max(0, Number(hours) || 0) * 60;
  const step = Math.max(5, Number(stepMinutes) || 30);
  for (let offset = -totalMinutes; offset <= totalMinutes; offset += step) {
    const t = new Date(now.getTime() + (offset * 60000));
    if (adIsEligibleNow(ad, t)) return true;
  }
  return false;
}

function weekStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const shift = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + shift);
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function monthStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function yearStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMonth(0, 1);
  return d;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

function highlightTodayColumn(now = new Date()) {
  const todayText = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  const labels = Array.from(document.querySelectorAll('#ads-calendar-wrap .sched-day-label'));
  const label = labels.find((node) => node.textContent === todayText);
  if (!label) return;
  const th = label.closest('th');
  if (!th || !th.parentElement) return;
  const index = Array.from(th.parentElement.children).indexOf(th);
  if (index < 1) return;

  th.classList.add('sched-day-highlight');
  document.querySelectorAll(`#ads-calendar-wrap tbody tr td:nth-child(${index + 1})`).forEach((cell) => {
    cell.classList.add('sched-day-highlight');
  });
}

function jumpToTodayInCalendar() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  adsCalendarAnchor = now;
  adsCalendarView = 'day';
  setAdsCalendarViewButtons();
  renderAdsCalendar();
  highlightTodayColumn(now);
}

function setAdsCalendarViewButtons() {
  const weekBtn = $('ads-cal-view-week');
  const dayBtn = $('ads-cal-view-day');
  const monthBtn = $('ads-cal-view-month');
  const yearBtn = $('ads-cal-view-year');
  if (weekBtn) weekBtn.classList.toggle('is-on', adsCalendarView === 'week');
  if (dayBtn) dayBtn.classList.toggle('is-on', adsCalendarView === 'day');
  if (monthBtn) monthBtn.classList.toggle('is-on', adsCalendarView === 'month');
  if (yearBtn) yearBtn.classList.toggle('is-on', adsCalendarView === 'year');
}

function ymd(date) {
  return localYmd(date);
}

function localDateFromYmd(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return new Date();
  return new Date(year, month - 1, day);
}

function hmToMinutes(value, fallback) {
  const text = value || fallback || '00:00';
  const parts = String(text).split(':');
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return (h * 60) + m;
}

function wrapMinutes(value) {
  return ((value % 1440) + 1440) % 1440;
}

function minutesToHm(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const mins = wrapMinutes(Math.round(safeValue));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minutesTo12Hour(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const mins = wrapMinutes(Math.round(safeValue));
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 % 12 || 12;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function durationLabel(totalMinutes) {
  const mins = Math.max(1, Math.round(totalMinutes || 0));
  if (mins % 60 === 0) return `${mins / 60}h`;
  if (mins > 60) {
    const h = Math.floor(mins / 60);
    const r = mins % 60;
    return `${h}h ${r}m`;
  }
  return `${mins}m`;
}

function getAdWindow(ad) {
  if (!(ad.startTime || ad.endTime)) return { start: 0, end: 1439, allDay: true };
  return {
    start: hmToMinutes(ad.startTime, '00:00'),
    end: hmToMinutes(ad.endTime, '23:59'),
    allDay: false
  };
}

function setAdWindow(ad, start, end) {
  const s = wrapMinutes(start);
  const e = wrapMinutes(end);
  if (s === 0 && e === 1439) {
    ad.startTime = '';
    ad.endTime = '';
    return;
  }
  ad.startTime = minutesToHm(s);
  ad.endTime = minutesToHm(e);
}

function spanMinutes(start, end) {
  const span = (end - start + 1440) % 1440;
  return span === 0 ? 1440 : span;
}

function adActiveOnDay(ad, dayText) {
  if (ad.status === 'draft') return false;
  if (ad.startDate && dayText < ad.startDate) return false;
  if (ad.endDate && dayText > ad.endDate) return false;
  return true;
}

function adDailySegments(ad) {
  if (!(ad.startTime || ad.endTime)) return [{ start: 0, end: 1440 }];
  const start = hmToMinutes(ad.startTime, '00:00');
  const end = hmToMinutes(ad.endTime, '23:59');
  if (start <= end) return [{ start, end: Math.max(start + 1, end) }];
  return [{ start: 0, end: Math.max(1, end) }, { start, end: 1440 }];
}

function schedulerAdMatchesSearch(ad) {
  if (!adsCalendarSearch) return true;
  return String(ad.title || '').toLowerCase().includes(adsCalendarSearch);
}

function adHasSchedule(ad) {
  return Boolean(ad && (ad.startDate || ad.endDate || ad.startTime || ad.endTime));
}

function schedulerViewRange() {
  const base = new Date(adsCalendarAnchor);
  base.setHours(0, 0, 0, 0);
  if (adsCalendarView === 'day') return { start: base, end: base };
  if (adsCalendarView === 'week') {
    const start = weekStart(base);
    return { start, end: addDays(start, 6) };
  }
  if (adsCalendarView === 'month') {
    const start = weekStart(monthStart(base));
    return { start, end: addDays(start, 41) };
  }
  const start = yearStart(base);
  const end = addDays(addYears(start, 1), -1);
  return { start, end };
}

function adScheduledInCurrentView(ad) {
  if (!adHasSchedule(ad)) return false;
  const { start, end } = schedulerViewRange();
  const cursor = new Date(start);
  while (cursor <= end) {
    if (adActiveOnDay(ad, ymd(cursor))) return true;
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}

function schedulerVisibleAds() {
  return ads
    .map((ad, index) => ({ ad, index }))
    .filter(({ ad }) => adScheduledInCurrentView(ad) && schedulerAdMatchesSearch(ad));
}

function applySchedulerSearch(value, focusState) {
  adsCalendarSearch = String(value || '').trim().toLowerCase();
  if (adsCalendarSearch) adsCalendarSearchOpen = true;
  const firstVisible = schedulerVisibleAds()[0];
  if (firstVisible && !schedulerAdMatchesSearch(ads[adsCalendarSelectedIndex])) {
    adsCalendarSelectedIndex = firstVisible.index;
  }
  renderAdsSchedule();
  if (focusState && focusState.restore) {
    requestAnimationFrame(() => {
      const nextInput = $('ads-cal-search-inline');
      if (!nextInput) return;
      nextInput.focus();
      const caret = Math.max(0, Math.min(Number(focusState.caret) || 0, nextInput.value.length));
      nextInput.setSelectionRange(caret, caret);
    });
  }
}

function bindSchedulerHeaderSearch(wrap) {
  const toggle = wrap.querySelector('#ads-cal-search-toggle');
  const input = wrap.querySelector('#ads-cal-search-inline');
  if (!toggle || !input) return;

  input.value = adsCalendarSearch;
  const open = adsCalendarSearchOpen || Boolean(adsCalendarSearch);
  input.classList.toggle('is-open', open);
  toggle.classList.toggle('is-on', open);
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

  toggle.addEventListener('click', () => {
    const nextOpen = !input.classList.contains('is-open');
    adsCalendarSearchOpen = nextOpen;
    input.classList.toggle('is-open', nextOpen);
    toggle.classList.toggle('is-on', nextOpen);
    toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) {
      requestAnimationFrame(() => input.focus());
    } else if (!input.value.trim()) {
      applySchedulerSearch('');
    }
  });

  input.addEventListener('input', () => {
    applySchedulerSearch(input.value, {
      restore: true,
      caret: input.selectionStart
    });
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      input.value = '';
      adsCalendarSearchOpen = false;
      applySchedulerSearch('');
    }
  });
}

function renderAdsCalendar(now = new Date()) {
  const wrap = $('ads-calendar-wrap');
  if (!wrap) return;
  const range = $('ads-cal-range');
  const base = new Date(adsCalendarAnchor);
  base.setHours(0, 0, 0, 0);
  const zonedNow = adsTimezoneParts(now);
  const nowMinutes = zonedNow.minutes;
  const today = zonedNow.ymd;
  const todayDate = new Date(now);
  todayDate.setHours(0, 0, 0, 0);
  const slotPalette = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const selectedAd = ads[adsCalendarSelectedIndex];
  const visibleAds = schedulerVisibleAds();

  if (adsCalendarView === 'month') {
    const monthBase = monthStart(base);
    const start = weekStart(monthBase);
    const monthIndex = monthBase.getMonth();
    if (range) {
      range.textContent = monthBase.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    }
    if (!ads.length) {
      wrap.innerHTML = '<div class="sched-empty">No ads to schedule yet.</div>';
      return;
    }
    if (!visibleAds.length) {
      wrap.innerHTML = '<div class="sched-empty">No scheduled ads in this view.</div>';
      return;
    }

    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const head = dayNames.map((name) => `<div class="sched-month-head">${name}</div>`).join('');
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const cells = days.map((day) => {
      const dayText = ymd(day);
      const inMonth = day.getMonth() === monthIndex;
      const activeCount = visibleAds.filter(({ ad }) => ad.status !== 'draft' && adActiveOnDay(ad, dayText)).length;
      const selectedActive = selectedAd && adActiveOnDay(selectedAd, dayText);
      const classes = ['sched-month-day'];
      if (!inMonth) classes.push('is-other');
      if (dayText === today) classes.push('is-today');
      if (selectedActive) classes.push('is-selected');
      const meta = activeCount
        ? `${activeCount} active ad${activeCount === 1 ? '' : 's'}`
        : 'No active ads';
      const selectedMeta = selectedActive ? '<span class="sched-month-day-meta">Selected ad active</span>' : '';
      return `<button type="button" class="${classes.join(' ')}" data-month-day="${dayText}"><span class="sched-month-day-num">${day.getDate()}</span><span class="sched-month-day-meta">${meta}</span>${selectedMeta}</button>`;
    }).join('');

    wrap.innerHTML = `<div class="sched-month"><div class="sched-month-grid">${head}${cells}</div></div>`;
    wrap.querySelectorAll('[data-month-day]').forEach((button) => {
      button.addEventListener('click', () => {
        adsCalendarAnchor = localDateFromYmd(button.dataset.monthDay);
        adsCalendarView = 'day';
        setAdsCalendarViewButtons();
        renderAdsCalendar(now);
      });
    });
    return;
  }

  if (adsCalendarView === 'year') {
    const anchorYear = yearStart(base);
    if (range) range.textContent = String(anchorYear.getFullYear());
    if (!ads.length) {
      wrap.innerHTML = '<div class="sched-empty">No ads to schedule yet.</div>';
      return;
    }
    if (!visibleAds.length) {
      wrap.innerHTML = '<div class="sched-empty">No scheduled ads in this view.</div>';
      return;
    }

    const months = Array.from({ length: 12 }, (_, i) => {
      const mStart = addMonths(anchorYear, i);
      const mEnd = addMonths(mStart, 1);
      let activeDays = 0;
      let selectedDays = 0;
      for (let day = new Date(mStart); day < mEnd; day = addDays(day, 1)) {
        const dayText = ymd(day);
        const hasAny = visibleAds.some(({ ad }) => ad.status !== 'draft' && adActiveOnDay(ad, dayText));
        if (hasAny) activeDays += 1;
        if (selectedAd && adActiveOnDay(selectedAd, dayText)) selectedDays += 1;
      }
      const currentMonth = mStart.getFullYear() === todayDate.getFullYear() && mStart.getMonth() === todayDate.getMonth();
      const selectedMonth = selectedDays > 0;
      return { mStart, activeDays, selectedDays, currentMonth, selectedMonth };
    });

    const cards = months.map(({ mStart, activeDays, selectedDays, currentMonth, selectedMonth }) => {
      const classes = ['sched-year-card'];
      if (currentMonth) classes.push('is-current');
      if (selectedMonth) classes.push('is-selected');
      const monthLabel = mStart.toLocaleDateString('en-AU', { month: 'short' });
      return `<button type="button" class="${classes.join(' ')}" data-year-month="${ymd(mStart)}"><span class="sched-year-title"><span>${monthLabel}</span><span>${activeDays}d</span></span><span class="sched-year-stat">Selected ad: ${selectedDays} day${selectedDays === 1 ? '' : 's'}</span></button>`;
    }).join('');

    wrap.innerHTML = `<div class="sched-year"><div class="sched-year-grid">${cards}</div></div>`;
    wrap.querySelectorAll('[data-year-month]').forEach((button) => {
      button.addEventListener('click', () => {
        adsCalendarAnchor = localDateFromYmd(button.dataset.yearMonth);
        adsCalendarView = 'month';
        setAdsCalendarViewButtons();
        renderAdsCalendar(now);
      });
    });
    return;
  }

  const start = adsCalendarView === 'day' ? base : weekStart(base);
  const days = adsCalendarView === 'day' ? [start] : Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const end = days[6];

  if (range) {
    range.textContent = adsCalendarView === 'day'
      ? start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : `${start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  if (!ads.length) {
    wrap.innerHTML = '<div class="sched-empty">No ads to schedule yet.</div>';
    return;
  }

  const halfHourMarks = Array.from({ length: 49 }, (_, i) => i);
  const axisMarkup = `<span class="sched-hour-axis">${halfHourMarks.map((tick) => {
    const pct = (tick / 48) * 100;
    if (tick % 2 === 1) return `<span class="half" style="left:${pct}%" aria-hidden="true">|</span>`;

    const hour = tick / 2;
    const normalized = hour % 12 === 0 ? 12 : hour % 12;
    const suffix = hour >= 12 && hour < 24 ? 'PM' : 'AM';
    const label = `${normalized}${suffix}`;
    const edgeClass = hour === 0 ? ' edge-start' : hour === 24 ? ' edge-end' : '';
    return `<span class="${edgeClass.trim()}" style="left:${pct}%">${label}</span>`;
  }).join('')}</span>`;
  const head = days.map((d) => {
    const topAxis = adsCalendarView === 'day' ? axisMarkup : '<span class="sched-day-label">00 06 12 18 24</span>';
    return `<th>${d.toLocaleDateString('en-AU', { weekday: 'short' })}<span class="sched-day-label">${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>${topAxis}</th>`;
  }).join('');
  const searchHead = '<span class="sched-name-head"><span>Ad / Schedule</span><span class="sched-search-inline-wrap"><input type="search" id="ads-cal-search-inline" class="sched-inline-search" placeholder="Search ad name..." aria-label="Search ads by name" /><button type="button" class="sched-search-toggle" id="ads-cal-search-toggle" aria-label="Search ads" aria-expanded="false"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg></button></span></span>';

  if (!visibleAds.length) {
    wrap.innerHTML = `<table><thead><tr><th>${searchHead}</th>${head}</tr></thead><tbody><tr><td class="sched-empty" colspan="${days.length + 1}">No scheduled ads in this view.</td></tr></tbody></table>`;
    bindSchedulerHeaderSearch(wrap);
    return;
  }

  const rows = visibleAds.map(({ ad, index }) => {
    const tone = slotPalette[index % slotPalette.length];
    const duration = Math.max(2, Number(ad.duration) || 4);
    const segments = adDailySegments(ad);
    const selectedClass = index === adsCalendarSelectedIndex ? ' sched-row-selected' : '';
    const dayCells = days.map((day) => {
      const dayText = ymd(day);
      const isToday = dayText === today;
      const nowLine = adsCalendarView === 'day' && isToday
        ? `<span class="sched-now-line" style="left:${Math.max(0, Math.min(100, (nowMinutes / 1440) * 100))}%"></span>`
        : '';
      const active = adActiveOnDay(ad, dayText);
      if (!active) return `<td class="sched-day-cell" data-cal-index="${index}">${nowLine}</td>`;
      const isLiveNow = isToday && adIsEligibleNow(ad, now) && ad.status !== 'draft';
      const blocks = segments.map((seg) => {
        const left = Math.max(0, Math.min(100, (seg.start / 1440) * 100));
        const width = Math.max(1, Math.min(100 - left, ((seg.end - seg.start) / 1440) * 100));
        const classes = ['sched-slot', tone];
        if (isLiveNow) classes.push('is-live');
        if (ad.status === 'draft') classes.push('is-draft');
        const segDuration = Math.max(1, seg.end - seg.start);
        const label = `${minutesTo12Hour(seg.start)} - ${minutesTo12Hour(seg.end)} · ${durationLabel(segDuration)}`;
        return `<span class="${classes.join(' ')}" data-slot-index="${index}" data-seg-start="${seg.start}" data-seg-end="${seg.end}" style="left:${left}%;width:${width}%" title="${escapeAttr(label)}"><span class="sched-slot-label">${escapeHtml(label)}</span><span class="sched-slot-handle start" title="Adjust start time"></span><span class="sched-slot-handle end" title="Adjust end time"></span></span>`;
      }).join('');
      return `<td class="sched-day-cell" data-cal-index="${index}">${nowLine}${blocks}</td>`;
    }).join('');

    const rowMeta = `${ad.status === 'draft' ? 'Draft' : 'Published'} · ${duration}s`;
    return `<tr class="sched-cal-row${selectedClass}" draggable="true" data-cal-index="${index}"><td class="sched-name">${escapeHtml(ad.title || 'Untitled ad')}<small>${escapeHtml(rowMeta)}</small></td>${dayCells}</tr>`;
  }).join('');

  wrap.innerHTML = `<table><thead><tr><th>${searchHead}</th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
  bindSchedulerHeaderSearch(wrap);

  wrap.querySelectorAll('[data-cal-index]').forEach((node) => {
    node.addEventListener('click', () => {
      adsCalendarSelectedIndex = Number(node.dataset.calIndex);
      renderAdsSchedule();
    });
    node.addEventListener('dblclick', () => {
      const index = Number(node.dataset.calIndex);
      if (!Number.isFinite(index) || index < 0 || index >= ads.length) return;
      openAdForm(index);
    });
  });

  wrap.querySelectorAll('tr.sched-cal-row').forEach((row) => {
    row.addEventListener('dragstart', () => {
      adsCalendarDragIndex = Number(row.dataset.calIndex);
    });
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const before = e.clientY < rect.top + (rect.height / 2);
      row.classList.toggle('sched-drop-top', before);
      row.classList.toggle('sched-drop-bottom', !before);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('sched-drop-top', 'sched-drop-bottom');
    });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      row.classList.remove('sched-drop-top', 'sched-drop-bottom');
      const to = Number(row.dataset.calIndex);
      if (adsCalendarDragIndex < 0 || adsCalendarDragIndex === to) return;
      const [moved] = ads.splice(adsCalendarDragIndex, 1);
      ads.splice(to, 0, moved);
      adsCalendarSelectedIndex = to;
      adsCalendarDragIndex = -1;
      renderAdsTable();
      autoSaveAds('reorder schedule priority');
    });
    row.addEventListener('dragend', () => {
      adsCalendarDragIndex = -1;
      row.classList.remove('sched-drop-top', 'sched-drop-bottom');
    });
  });

  wrap.querySelectorAll('.sched-slot').forEach((slot) => {
    slot.addEventListener('dblclick', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const adIndex = Number(slot.dataset.slotIndex);
      if (!Number.isFinite(adIndex) || adIndex < 0 || adIndex >= ads.length) return;
      openAdForm(adIndex);
    });
    slot.addEventListener('mousedown', (event) => {
      const adIndex = Number(slot.dataset.slotIndex);
      if (!Number.isFinite(adIndex) || !ads[adIndex]) return;

      const handle = event.target.closest('.sched-slot-handle');
      const mode = handle?.classList.contains('start') ? 'resize-start' : handle?.classList.contains('end') ? 'resize-end' : 'move';
      const cell = slot.closest('.sched-day-cell');
      if (!cell) return;

      event.preventDefault();
      event.stopPropagation();

      const ad = ads[adIndex];
      const original = getAdWindow(ad);
      if (original.allDay && mode === 'move') return;

      const minSpan = 15;
      const rect = cell.getBoundingClientRect();
      const clampX = (x) => Math.max(rect.left, Math.min(rect.right, x));
      const snap = (mins) => Math.round(mins / 15) * 15;
      const pointerToMinutes = (x) => Math.max(0, Math.min(1439, snap(((clampX(x) - rect.left) / rect.width) * 1440)));

      const segmentStart = Number(slot.dataset.segStart || original.start);
      const downMinutes = pointerToMinutes(event.clientX);
      const moveOffset = downMinutes - segmentStart;
      let scheduleChanged = false;

      adsCalendarSelectedIndex = adIndex;

      const onMove = (moveEvent) => {
        const current = ads[adIndex];
        if (!current) return;
        let nextStart = original.start;
        let nextEnd = original.end;

        if (mode === 'move') {
          const currentSegStart = pointerToMinutes(moveEvent.clientX) - moveOffset;
          const delta = snap(currentSegStart - segmentStart);
          nextStart = wrapMinutes(original.start + delta);
          nextEnd = wrapMinutes(original.end + delta);
        } else if (mode === 'resize-start') {
          nextStart = pointerToMinutes(moveEvent.clientX);
          if (spanMinutes(nextStart, original.end) < minSpan) nextStart = wrapMinutes(original.end - minSpan);
          nextEnd = original.end;
        } else if (mode === 'resize-end') {
          nextEnd = pointerToMinutes(moveEvent.clientX);
          if (spanMinutes(original.start, nextEnd) < minSpan) nextEnd = wrapMinutes(original.start + minSpan);
          nextStart = original.start;
        }

        if (nextStart !== original.start || nextEnd !== original.end) scheduleChanged = true;
        setAdWindow(current, nextStart, nextEnd);
        renderAdsSchedule();
      };

      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        if (!scheduleChanged) return;
        autoSaveAds('drag schedule window');
        flash(adsFileHandle ? 'Schedule updated — saving…' : 'Schedule updated locally — connect project to save file.', adsFileHandle ? 'info' : 'warning');
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  });
}

function initAdsCalendarControls() {
  const prev = $('ads-cal-prev');
  const next = $('ads-cal-next');
  const todayBtn = $('ads-cal-today');
  const yesterdayBtn = $('ads-cal-yesterday');
  const tomorrowBtn = $('ads-cal-tomorrow');
  const jumpBtn = $('ads-cal-jump-today');
  const weekBtn = $('ads-cal-view-week');
  const dayBtn = $('ads-cal-view-day');
  const monthBtn = $('ads-cal-view-month');
  const yearBtn = $('ads-cal-view-year');
  if (!prev || prev.dataset.bound === '1') return;

  prev.dataset.bound = '1';
  next.dataset.bound = '1';
  if (yesterdayBtn) yesterdayBtn.dataset.bound = '1';
  if (tomorrowBtn) tomorrowBtn.dataset.bound = '1';
  if (todayBtn) todayBtn.dataset.bound = '1';
  if (jumpBtn) jumpBtn.dataset.bound = '1';
  if (weekBtn) weekBtn.dataset.bound = '1';
  if (dayBtn) dayBtn.dataset.bound = '1';
  if (monthBtn) monthBtn.dataset.bound = '1';
  if (yearBtn) yearBtn.dataset.bound = '1';
  setAdsCalendarViewButtons();

  const setToTodayOffset = (offset) => {
    const target = new Date();
    target.setHours(0, 0, 0, 0);
    target.setDate(target.getDate() + offset);
    adsCalendarAnchor = target;
    adsCalendarView = 'day';
    setAdsCalendarViewButtons();
    renderAdsCalendar();
  };

  const shiftCalendar = (direction) => {
    if (adsCalendarView === 'day') adsCalendarAnchor = addDays(adsCalendarAnchor, direction);
    else if (adsCalendarView === 'week') adsCalendarAnchor = addDays(adsCalendarAnchor, direction * 7);
    else if (adsCalendarView === 'month') adsCalendarAnchor = addMonths(adsCalendarAnchor, direction);
    else if (adsCalendarView === 'year') adsCalendarAnchor = addYears(adsCalendarAnchor, direction);
    renderAdsCalendar();
  };

  prev.addEventListener('click', () => shiftCalendar(-1));
  next.addEventListener('click', () => shiftCalendar(1));
  if (yesterdayBtn) yesterdayBtn.addEventListener('click', () => setToTodayOffset(-1));
  if (tomorrowBtn) tomorrowBtn.addEventListener('click', () => setToTodayOffset(1));
  if (todayBtn) todayBtn.addEventListener('click', jumpToTodayInCalendar);
  if (jumpBtn) jumpBtn.addEventListener('click', jumpToTodayInCalendar);
  if (weekBtn) weekBtn.addEventListener('click', () => {
    adsCalendarView = 'week';
    setAdsCalendarViewButtons();
    renderAdsCalendar();
  });
  if (dayBtn) dayBtn.addEventListener('click', () => {
    adsCalendarView = 'day';
    setAdsCalendarViewButtons();
    renderAdsCalendar();
  });
  if (monthBtn) monthBtn.addEventListener('click', () => {
    adsCalendarView = 'month';
    adsCalendarAnchor = monthStart(adsCalendarAnchor);
    setAdsCalendarViewButtons();
    renderAdsCalendar();
  });
  if (yearBtn) yearBtn.addEventListener('click', () => {
    adsCalendarView = 'year';
    adsCalendarAnchor = yearStart(adsCalendarAnchor);
    setAdsCalendarViewButtons();
    renderAdsCalendar();
  });
}

function syncAdsPicker() {
  const picker = $('ads-picker');
  if (!picker) return;
  const visibleAds = schedulerVisibleAds();

  if (picker.dataset.bound !== '1') {
    picker.dataset.bound = '1';
    picker.addEventListener('change', () => {
      adsCalendarSelectedIndex = Number(picker.value) || 0;
      renderAdsSchedule();
    });
  }

  if (!ads.length) {
    picker.innerHTML = '<option value="">No ads available</option>';
    picker.disabled = true;
    return;
  }
  if (!visibleAds.length) {
    picker.innerHTML = '<option value="">No scheduled ads in this view</option>';
    picker.disabled = true;
    return;
  }

  if (!visibleAds.some(({ index }) => index === adsCalendarSelectedIndex)) {
    adsCalendarSelectedIndex = visibleAds[0].index;
  }
  picker.disabled = false;
  picker.innerHTML = visibleAds.map(({ ad, index }, i) => `<option value="${index}">${i + 1}. ${escapeHtml(ad.title || 'Untitled ad')}</option>`).join('');
  picker.value = String(adsCalendarSelectedIndex);
}

/** Shows what would actually play right now, so overlapping schedules are easy to reason about. */
function renderAdsSchedule() {
  const wrap = $('ads-schedule-wrap');
  const now = new Date();
  const visibleAds = schedulerVisibleAds();
  adsCalendarSelectedIndex = Math.max(0, Math.min(adsCalendarSelectedIndex, Math.max(ads.length - 1, 0)));
  if (visibleAds.length && !visibleAds.some(({ index }) => index === adsCalendarSelectedIndex)) {
    adsCalendarSelectedIndex = visibleAds[0].index;
  }
  const states = visibleAds.map(({ ad, index }) => {
    const state = adWindowState(ad, now);
    const inWindow = adIsEligibleAroundNow(ad, now, 8, 30);
    const displayState = state.tone === 'live'
      ? state
      : inWindow && state.tone !== 'expired' && state.tone !== 'draft'
        ? { text: 'Within +/-8h', tone: 'window' }
        : state;
    return { ad, index, state, inWindow, displayState };
  });
  const stateOrder = { live: 0, window: 1, upcoming: 2, draft: 3, expired: 4 };
  const sortedStates = [...states].sort((a, b) => (stateOrder[a.displayState.tone] ?? 99) - (stateOrder[b.displayState.tone] ?? 99));
  const liveNow = states.filter(({ state }) => state.tone === 'live');
  const inWindow = states.filter((item) => item.inWindow);
  const scheduled = ads.filter((ad) => ad.startDate || ad.endDate || ad.startTime || ad.endTime);
  const published = ads.filter((ad) => ad.status !== 'draft');
  const revenue = published.reduce((sum, ad) => sum + (Number(ad.revenue) || 0), 0);

  $('stat-ads-total').textContent = ads.length;
  $('stat-ads-live').textContent = inWindow.length;
  $('stat-ads-slots').textContent = scheduled.length;
  $('stat-ads-revenue').textContent = `$${revenue.toLocaleString()}`;
  renderDashboard();

  if (!wrap) {
    syncAdsPicker();
    initAdsCalendarControls();
    renderAdsCalendar(now);
    return;
  }

  if (!ads.length) {
    wrap.innerHTML = '<div class="sched-empty">No ads yet — Edgeducate\'s default ad will show until you add one.</div>';
    syncAdsPicker();
    initAdsCalendarControls();
    renderAdsCalendar(now);
    return;
  }

  if (!visibleAds.length) {
    wrap.innerHTML = '<div class="sched-empty">No scheduled ads in this view.</div>';
    syncAdsPicker();
    initAdsCalendarControls();
    renderAdsCalendar(now);
    return;
  }

  const note = !adsEnabled
    ? 'Ads are turned off — the loading screen will show with no advertising.'
    : inWindow.length > 1
      ? `${inWindow.length} ads are eligible within +/-8 hours of now. At the exact current minute, ${liveNow.length} are live and one is picked at random each session.`
      : inWindow.length === 1
        ? `1 ad is eligible within +/-8 hours of now. At the exact current minute, ${liveNow.length} ${liveNow.length === 1 ? 'ad is' : 'ads are'} live.`
        : 'No ads are eligible in the +/-8 hour window around now — Edgeducate\'s default ad will show instead.';

  const rows = sortedStates.map(({ ad, displayState, index }) => `
    <div class="sched-row${index === adsCalendarSelectedIndex ? ' is-selected' : ''}" data-sched-index="${index}">
      <div class="sched-row-top">
        <span class="sched-dot sched-${displayState.tone}"></span>
        <span class="sched-title">${escapeHtml(ad.title)}</span>
        <span class="sched-state sched-${displayState.tone}">${displayState.text}</span>
      </div>
      <span class="sched-window">${escapeHtml(adScheduleSummary(ad))}</span>
    </div>`).join('');

  wrap.innerHTML = `<div class="sched-note">${escapeHtml(note)}</div><div class="sched-card">${rows}</div>`;
  wrap.querySelectorAll('[data-sched-index]').forEach((row) => {
    row.addEventListener('click', () => {
      adsCalendarSelectedIndex = Number(row.dataset.schedIndex) || 0;
      renderAdsSchedule();
    });
  });
  syncAdsPicker();
  initAdsCalendarControls();
  renderAdsCalendar(now);
}

setInterval(() => { if (ads.length) renderAdsSchedule(); }, 30000);
window.addEventListener('focus', () => { if (ads.length) renderAdsSchedule(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ads.length) renderAdsSchedule();
});

function bindAdRow(tr) {
  const index = Number(tr.dataset.index);

  tr.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'preview') return openAdPreview(ads[index]);
      if (act === 'edit') return openAdForm(index);
      if (act === 'del') {
        if (confirm(`Delete "${ads[index].title}"?`)) {
          log(`Deleted ad "${ads[index].title}"`, 'warnl');
          ads.splice(index, 1);
          renderAdsTable();
          autoSaveAds('delete ad');
        }
        return;
      }
      const to = act === 'up' ? index - 1 : index + 1;
      if (to < 0 || to >= ads.length) return;
      [ads[index], ads[to]] = [ads[to], ads[index]];
      renderAdsTable();
      autoSaveAds('reorder ads');
    });
  });

  tr.addEventListener('dragstart', () => { adsDragIndex = index; });
  tr.addEventListener('dragover', (e) => { e.preventDefault(); tr.classList.add('drag-over'); });
  tr.addEventListener('dragleave', () => tr.classList.remove('drag-over'));
  tr.addEventListener('drop', (e) => {
    e.preventDefault();
    tr.classList.remove('drag-over');
    if (adsDragIndex < 0 || adsDragIndex === index) return;
    const [moved] = ads.splice(adsDragIndex, 1);
    ads.splice(index, 0, moved);
    adsDragIndex = -1;
    renderAdsTable();
    autoSaveAds('reorder ads');
  });
}

function hasClubActionTarget(deal) {
  return Boolean(
    (deal.url && String(deal.url).trim())
    || (deal.locationName && String(deal.locationName).trim())
    || (deal.address && String(deal.address).trim())
    || (deal.mapUrl && String(deal.mapUrl).trim())
    || (deal.latitude && String(deal.latitude).trim())
    || (deal.longitude && String(deal.longitude).trim())
  );
}

function isLikelySampleClubDeal(deal) {
  const id = String(deal.id || '').toLowerCase();
  const partner = String(deal.partner || '').toLowerCase();
  const title = String(deal.title || '').toLowerCase();
  return id.startsWith('sample-') || partner.startsWith('sample') || title.startsWith('sample ');
}

/* ---------- Club offers ---------- */
function renderClubTable() {
  const today = adsTimezoneParts(new Date()).ymd;
  const expiredPublishedCount = clubDeals.filter((deal) => (deal.status || 'published') === 'published' && deal.expires && deal.expires < today).length;
  const missingActionCount = clubDeals.filter((deal) => (deal.status || 'published') === 'published' && deal.actionEnabled !== false && !hasClubActionTarget(deal)).length;
  const samplePublishedCount = clubDeals.filter((deal) => (deal.status || 'published') === 'published' && isLikelySampleClubDeal(deal)).length;
  const warningCount = expiredPublishedCount + missingActionCount + samplePublishedCount;
  $('club-count').textContent = `${clubDeals.length} offer${clubDeals.length === 1 ? '' : 's'}${warningCount ? ` · ${warningCount} warning${warningCount === 1 ? '' : 's'}` : ''}`;
  renderDashboard();
  if (!clubDeals.length) {
    $('club-table-wrap').innerHTML = '<div class="empty">No Club offers yet. Click <b>+ Add offer</b> to create the first one.</div>';
    return;
  }
  const rows = clubDeals.map((deal, index) => {
    const isPublished = (deal.status || 'published') === 'published';
    const rowWarnings = [];
    if (isPublished && deal.expires && deal.expires < today) rowWarnings.push('Expired');
    if (isPublished && deal.actionEnabled !== false && !hasClubActionTarget(deal)) rowWarnings.push('Missing action link');
    if (isPublished && isLikelySampleClubDeal(deal)) rowWarnings.push('Sample');
    const warningText = rowWarnings.join(' · ');
    return `
    <tr data-index="${index}">
      <td class="grip">⠿</td>
      <td class="title">${escapeHtml(deal.title)}<small>${escapeHtml(deal.partner || '')}</small></td>
      <td><span class="pill ${index % 4 === 0 ? 'blue' : index % 4 === 1 ? 'amber' : index % 4 === 2 ? 'purple' : 'green'}">${escapeHtml(deal.highlight || 'CLUB DEAL')}</span><small>${Number(deal.popularity) > 0 ? 'Popular' : ''}${deal.actionEnabled === false ? ' · No action button' : ''}</small></td>
      <td class="sub">${escapeHtml(deal.category || (deal.birthday ? 'Birthday' : 'Club'))}</td>
      <td class="sub">${formatMoney(deal.revenue)}</td>
      <td class="sub">${escapeHtml(deal.expires || 'No expiry')}</td>
      <td><span class="status status-${deal.status || 'published'}">${deal.status === 'draft' ? 'Draft' : 'Published'}</span><small>${escapeHtml(warningText)}</small></td>
      <td><div class="row-actions"><button class="icon-btn" data-club-act="up" title="Move up">↑</button><button class="icon-btn" data-club-act="down" title="Move down">↓</button><button class="icon-btn" data-club-act="edit" title="Edit">✎</button><button class="icon-btn" data-club-act="del" title="Delete">🗑</button></div></td>
    </tr>`;
  }).join('');
  $('club-table-wrap').innerHTML = `<div class="table-card"><table><thead><tr><th></th><th>Offer</th><th>Card badge</th><th>Category</th><th>Revenue</th><th>Expiry</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('club-table-wrap').querySelectorAll('tbody tr').forEach((row) => row.querySelectorAll('[data-club-act]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(row.dataset.index);
    const action = button.dataset.clubAct;
    if (action === 'edit') return openClubForm(index);
    if (action === 'del') {
      if (!confirm(`Delete "${clubDeals[index].title}"?`)) return;
      clubDeals.splice(index, 1);
      renderClubTable();
      autoSaveClub('delete offer');
      return;
    }
    const target = action === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= clubDeals.length) return;
    [clubDeals[index], clubDeals[target]] = [clubDeals[target], clubDeals[index]];
    renderClubTable();
    autoSaveClub('reorder offers');
  })));
}

function openClubForm(index) {
  editingClubIndex = index;
  const deal = index >= 0 ? clubDeals[index] : {};
  $('club-dlg-title').textContent = index >= 0 ? 'Edit Club offer' : 'Add Club offer';
  $('club-title').value = deal.title || '';
  $('club-highlight').value = deal.highlight || '';
  $('club-partner').value = deal.partner || '';
  $('club-badge').value = deal.badge || '';
  $('club-category').value = deal.category || '';
  $('club-description').value = deal.description || '';
  $('club-disclaimer').value = deal.disclaimer || '';
  $('club-image').value = deal.image || '';
  $('club-code').value = deal.code || '';
  $('club-url').value = deal.url || '';
  const hasLegacyAction = Boolean(deal.url || deal.locationName || deal.address || deal.mapUrl || deal.latitude || deal.longitude);
  $('club-action-enabled').checked = deal.actionEnabled === undefined ? hasLegacyAction : Boolean(deal.actionEnabled);
  $('club-starts').value = deal.starts || '';
  $('club-expires').value = deal.expires || '';
  $('club-status').value = deal.status || 'published';
  $('club-revenue').value = Number(deal.revenue) || 0;
  $('club-location').value = deal.locationName || '';
  $('club-address').value = deal.address || '';
  $('club-map').value = deal.mapUrl || '';
  $('club-id').value = deal.id || '';
  $('club-latitude').value = deal.latitude ?? '';
  $('club-longitude').value = deal.longitude ?? '';
  $('club-birthday').checked = Boolean(deal.birthday);
  $('club-popular').checked = Number(deal.popularity) > 0;
  $('club-form-err').hidden = true;
  clubDlg.showModal();
  $('club-title').focus();
}

$('club-title').addEventListener('input', () => { if (editingClubIndex < 0) $('club-id').value = slugify($('club-title').value); });
$('btn-add-club').addEventListener('click', () => openClubForm(-1));
$('btn-cancel-club').addEventListener('click', () => clubDlg.close());
$('btn-save-club').addEventListener('click', () => {
  const err = $('club-form-err');
  const title = $('club-title').value.trim();
  const highlight = $('club-highlight').value.trim();
  const id = $('club-id').value.trim() || slugify(title);
  const starts = $('club-starts').value;
  const expires = $('club-expires').value;
  const actionEnabled = $('club-action-enabled').checked;
  const actionTargetPresent = hasClubActionTarget({
    url: $('club-url').value.trim(),
    locationName: $('club-location').value.trim(),
    address: $('club-address').value.trim(),
    mapUrl: $('club-map').value.trim(),
    latitude: $('club-latitude').value.trim(),
    longitude: $('club-longitude').value.trim()
  });
  if (!title) return showErr(err, 'Please enter an offer title.');
  if (!highlight) return showErr(err, 'Please enter the large card badge text.');
  if (clubDeals.some((deal, index) => deal.id === id && index !== editingClubIndex)) return showErr(err, `The ID "${id}" is already used.`);
  if (starts && expires && expires < starts) return showErr(err, 'Valid until must be on or after Valid from.');
  if (actionEnabled && !actionTargetPresent) return showErr(err, 'Show action button is enabled, but there is no link or location to open. Add Offer link, map URL or location details.');
  const record = {
    id, title, highlight, partner: $('club-partner').value.trim(), badge: $('club-badge').value.trim(), category: $('club-category').value.trim(),
    description: $('club-description').value.trim(), disclaimer: $('club-disclaimer').value.trim(), image: $('club-image').value.trim(), code: $('club-code').value.trim(),
    url: $('club-url').value.trim(), actionEnabled, starts, expires, status: $('club-status').value,
    revenue: Number($('club-revenue').value) || 0,
    locationName: $('club-location').value.trim(), address: $('club-address').value.trim(), mapUrl: $('club-map').value.trim(),
    latitude: $('club-latitude').value.trim(), longitude: $('club-longitude').value.trim(), birthday: $('club-birthday').checked,
    popularity: $('club-popular').checked ? 1 : 0
  };
  if (editingClubIndex >= 0) clubDeals[editingClubIndex] = record; else clubDeals.unshift(record);
  const wasEdit = editingClubIndex >= 0;
  clubDlg.close();
  renderClubTable();
  autoSaveClub(wasEdit ? 'edit offer' : 'add offer');
  flash(clubFileHandle ? 'Club offer saved.' : 'Club offer updated — connect the project to save.', clubFileHandle ? 'success' : 'warning');
});

function serializeClubDeals() {
  const body = clubDeals.map((deal) => {
    const lines = Object.entries(deal).filter(([key, value]) => value !== undefined && value !== '').map(([key, value]) => `    ${key}: ${typeof value === 'boolean' ? value : typeof value === 'number' ? value : js(value)},`);
    if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    return `  {\n${lines.join('\n')}\n  }`;
  }).join(',\n');
  return `/**\n * EDGEDUCATE CLUB OFFERS\n * Managed by admin.html — you shouldn't need to edit this by hand.\n */\nwindow.EDG_CLUB_DEALS = [\n${body}\n];\n`;
}

/* ---------- Packages ---------- */
function renderPackagesTable() {
  const query = ($('package-search')?.value || '').trim().toLowerCase();
  const visible = packages
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => !query || `${entry.name || ''} ${entry.collection || ''} ${entry.subject || ''} ${entry.grade || ''} ${entry.price || ''} ${entry.link || ''} ${entry.note || ''}`.toLowerCase().includes(query));

  $('packages-count').textContent = query
    ? `${visible.length} of ${packages.length} collection${packages.length === 1 ? '' : 's'}`
    : `${packages.length} collection${packages.length === 1 ? '' : 's'}`;
  renderDashboard();
  if (!packages.length) {
    $('packages-table-wrap').innerHTML = '<div class="packages-empty">No collections yet. Click <b>+ Add collection</b> to create the first one.</div>';
    return;
  }

  if (!visible.length) {
    $('packages-table-wrap').innerHTML = '<div class="packages-empty">No collections match that search.</div>';
    return;
  }

  const rows = visible.map(({ entry, index }) => {
    const status = entry.status === 'draft' ? 'draft' : 'published';
    return `
    <tr data-index="${index}">
      <td class="grip">⠿</td>
      <td class="title"><div class="pkg-name"><strong>${escapeHtml(entry.name || 'Untitled collection')}</strong><span class="pkg-subtle">${escapeHtml(entry.collection || 'General collection')}</span></div></td>
      <td class="sub"><span class="pkg-chip">${escapeHtml(entry.subject || 'General')}</span></td>
      <td class="sub"><span class="pkg-chip is-grade">${escapeHtml(entry.grade || 'All grades')}</span></td>
      <td class="sub">${escapeHtml(entry.price || '')}</td>
      <td class="sub"><span class="pkg-link" title="${escapeAttr(entry.link || '')}">${escapeHtml(entry.link || '')}</span></td>
      <td><span class="status status-${status}">${status === 'draft' ? 'Draft' : 'Published'}</span><span class="pkg-status-note">${escapeHtml(entry.note || '')}</span></td>
      <td><div class="row-actions"><button class="icon-btn" data-pkg-act="copy" title="Copy link">⎘</button><button class="icon-btn" data-pkg-act="up" title="Move up">↑</button><button class="icon-btn" data-pkg-act="down" title="Move down">↓</button><button class="icon-btn" data-pkg-act="edit" title="Edit">✎</button><button class="icon-btn" data-pkg-act="del" title="Delete">🗑</button></div></td>
    </tr>`;
  }).join('');

  $('packages-table-wrap').innerHTML = `<div class="table-card packages-table-card"><table class="packages-table"><thead><tr><th></th><th>Name</th><th>Subject</th><th>Grade</th><th>Price</th><th>Link</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  $('packages-table-wrap').querySelectorAll('tbody tr').forEach((row) => row.querySelectorAll('[data-pkg-act]').forEach((button) => button.addEventListener('click', async () => {
    const index = Number(row.dataset.index);
    const action = button.dataset.pkgAct;
    if (action === 'copy') {
      const link = String(packages[index]?.link || '').trim();
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        flash('Link copied.', 'success');
      } catch (e) {
        prompt('Copy this link:', link);
      }
      return;
    }
    if (action === 'edit') return openPackageForm(index);
    if (action === 'del') {
      if (!confirm(`Delete "${packages[index].name}"?`)) return;
      packages.splice(index, 1);
      renderPackagesTable();
      autoSavePackages('delete collection');
      return;
    }
    const target = action === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= packages.length) return;
    [packages[index], packages[target]] = [packages[target], packages[index]];
    renderPackagesTable();
    autoSavePackages('reorder collections');
  })));
}

function openPackageForm(index) {
  editingPackageIndex = index;
  const entry = index >= 0 ? packages[index] : {};
  $('package-dlg-title').textContent = index >= 0 ? 'Edit collection' : 'Add collection';
  $('package-name').value = entry.name || '';
  $('package-collection').value = entry.collection || '';
  $('package-subject').value = entry.subject || '';
  $('package-grade').value = entry.grade || '';
  $('package-price').value = entry.price || '';
  $('package-link').value = entry.link || '';
  $('package-note').value = entry.note || '';
  $('package-status').value = entry.status || 'published';
  $('package-id').value = entry.id || '';
  $('package-form-err').hidden = true;
  $('package-dlg').showModal();
  $('package-name').focus();
}

$('package-name').addEventListener('input', () => {
  if (editingPackageIndex >= 0) return;
  $('package-id').value = slugify($('package-name').value);
});

$('package-search').addEventListener('input', renderPackagesTable);

$('btn-add-package').addEventListener('click', () => openPackageForm(-1));
$('btn-cancel-package').addEventListener('click', () => $('package-dlg').close());
$('btn-save-package').addEventListener('click', () => {
  const err = $('package-form-err');
  const name = $('package-name').value.trim();
  const link = $('package-link').value.trim();
  const id = $('package-id').value.trim() || slugify(name);

  if (!name) return showErr(err, 'Please enter a collection name.');
  if (!link) return showErr(err, 'Please add the product link.');
  if (!/^https?:\/\//i.test(link)) return showErr(err, 'The link must start with http:// or https://');
  if (packages.some((item, index) => item.id === id && index !== editingPackageIndex)) return showErr(err, `The ID "${id}" is already used.`);

  const record = {
    id,
    name,
    collection: $('package-collection').value.trim(),
    subject: $('package-subject').value.trim(),
    grade: $('package-grade').value.trim(),
    price: $('package-price').value.trim(),
    link,
    note: $('package-note').value.trim(),
    status: $('package-status').value
  };

  if (editingPackageIndex >= 0) packages[editingPackageIndex] = record;
  else packages.unshift(record);

  const wasEdit = editingPackageIndex >= 0;
  $('package-dlg').close();
  renderPackagesTable();
  autoSavePackages(wasEdit ? 'edit collection' : 'add collection');
  flash(packagesFileHandle ? 'Collection saved.' : 'Collection updated — connect project to save file.', packagesFileHandle ? 'success' : 'warning');
});

function serializePackages() {
  const body = packages.map((entry) => {
    const lines = Object.entries(entry)
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `    ${key}: ${js(value)},`);
    if (lines.length) lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    return `  {\n${lines.join('\n')}\n  }`;
  }).join(',\n');

  return `/**\n * EDGEDUCATE PACKAGE COLLECTIONS\n * Managed by admin.html — you should not need to edit this by hand.\n */\nwindow.EDG_PACKAGES = [\n${body}\n];\n`;
}

$('btn-export-packages').addEventListener('click', () => {
  const blob = new Blob([serializePackages()], { type: 'text/javascript' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'packages.js';
  link.click();
  URL.revokeObjectURL(link.href);
  flash('Downloaded packages.js.', 'info');
});

$('btn-export-club').addEventListener('click', () => {
  const blob = new Blob([serializeClubDeals()], { type: 'text/javascript' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = 'club-deals.js'; link.click(); URL.revokeObjectURL(link.href);
  flash('Downloaded club-deals.js.', 'info');
});

function updateAdMediaFields() {
  const type = $('ad-media-type').value;
  $('ad-media-image-field').hidden = type !== 'image';
  $('ad-media-video-field').hidden = type !== 'video';
}
$('ad-media-type').addEventListener('change', updateAdMediaFields);

/* ---------- ad preview ---------- */
function adPreviewMediaMarkup(ad) {
  if (ad.mediaType === 'image' && ad.image) return `<img src="${escapeAttr(ad.image)}" alt="" />`;
  if (ad.mediaType === 'video' && ad.videoUrl) {
    const yt = String(ad.videoUrl).match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
    if (yt) return `<iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0" title="${escapeAttr(ad.title)}" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    if (/\.(mp4|webm|ogg)(\?|#|$)/i.test(ad.videoUrl)) return `<video src="${escapeAttr(ad.videoUrl)}" controls muted></video>`;
  }
  return '';
}

function openAdPreview(ad) {
  const media = $('ad-preview-media');
  const markup = adPreviewMediaMarkup(ad);
  media.innerHTML = markup;
  media.hidden = !markup;
  $('ad-preview-title').textContent = ad.title || 'Untitled ad';
  $('ad-preview-body').textContent = ad.body || '';
  const cta = $('ad-preview-cta');
  cta.textContent = ad.ctaLabel || 'Learn more';
  const duration = Math.max(2, Number(ad.duration) || 4);
  $('ad-preview-duration').textContent = `Stays on screen for ${duration} second${duration === 1 ? '' : 's'}.`;
  $('ad-preview-dlg').showModal();
}

$('ad-preview-close').addEventListener('click', () => $('ad-preview-dlg').close());

/** Preview the form's current, unsaved values — no need to save first. */
$('btn-preview-ad').addEventListener('click', () => {
  const mediaType = $('ad-media-type').value;
  openAdPreview({
    title: $('ad-title').value.trim(),
    body: $('ad-body').value.trim(),
    ctaLabel: $('ad-cta-label').value.trim(),
    mediaType,
    image: mediaType === 'image' ? adImageValue : '',
    videoUrl: mediaType === 'video' ? $('ad-video-url').value.trim() : '',
    duration: $('ad-duration').value
  });
});

$('ad-image-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (projectHandle) {
    try {
      const assetsDir = await projectHandle.getDirectoryHandle('assets', { create: true });
      const thumbsDir = await assetsDir.getDirectoryHandle('thumbs', { create: true });
      const adsDir = await thumbsDir.getDirectoryHandle('ads', { create: true });
      const imgHandle = await adsDir.getFileHandle(file.name, { create: true });
      const writable = await imgHandle.createWritable();
      await writable.write(file);
      await writable.close();
      adImageValue = `assets/thumbs/ads/${file.name}`;
      log(`Saved ${file.name} to assets/thumbs/ads`, 'ok');
    } catch (err) {
      log(`IMAGE SAVE FAILED: ${err.name} - ${err.message}`, 'bad');
      return;
    }
  } else {
    adImageValue = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  const preview = $('ad-image-preview');
  preview.src = adImageValue;
  preview.hidden = false;
});

function openAdForm(index) {
  editingAdIndex = index;
  const a = index >= 0 ? ads[index] : {};
  $('ads-dlg-title').textContent = index >= 0 ? 'Edit ad' : 'Add ad';
  $('ad-title').value = a.title || '';
  $('ad-body').value = a.body || '';
  $('ad-cta-label').value = a.ctaLabel || '';
  $('ad-cta-url').value = a.ctaUrl || '';
  $('ad-media-type').value = a.mediaType || '';
  $('ad-image-file').value = '';
  adImageValue = a.mediaType === 'image' ? (a.image || '') : '';
  $('ad-image-preview').src = adImageValue || '';
  $('ad-image-preview').hidden = !adImageValue;
  $('ad-video-url').value = a.videoUrl || '';
  updateAdMediaFields();
  $('ad-duration').value = a.duration || 4;
  $('ad-revenue').value = a.revenue || '';
  $('ad-start-date').value = a.startDate || '';
  $('ad-end-date').value = a.endDate || '';
  $('ad-start-time').value = a.startTime || '';
  $('ad-end-time').value = a.endTime || '';
  $('ad-status').value = a.status || 'published';
  $('ad-id').value = a.id || '';
  $('ads-form-err').hidden = true;
  adsDlg.showModal();
  renderAdEditorSchedulePanel();
  $('ad-title').focus();
}

$('ad-title').addEventListener('input', () => {
  if (editingAdIndex >= 0) return;
  $('ad-id').value = slugify($('ad-title').value);
  renderAdEditorSchedulePanel();
});
['ad-start-date', 'ad-end-date', 'ad-start-time', 'ad-end-time', 'ad-status', 'ad-duration'].forEach((id) => {
  const node = $(id);
  if (!node) return;
  node.addEventListener('input', renderAdEditorSchedulePanel);
  node.addEventListener('change', renderAdEditorSchedulePanel);
});
$('btn-add-ad').addEventListener('click', () => openAdForm(-1));
$('btn-cancel-ad').addEventListener('click', () => adsDlg.close());

$('btn-save-ad').addEventListener('click', () => {
  const err = $('ads-form-err');
  const title = $('ad-title').value.trim();
  let id = $('ad-id').value.trim() || slugify(title);
  const startDate = $('ad-start-date').value;
  const endDate = $('ad-end-date').value;
  const startTime = $('ad-start-time').value;
  const endTime = $('ad-end-time').value;

  if (!title) return showErr(err, 'Please enter a headline.');
  if (ads.some((ad, i) => ad.id === id && i !== editingAdIndex)) return showErr(err, `The ID "${id}" is already used. Give this one a different ID.`);
  if (startDate && endDate && endDate < startDate) return showErr(err, '"Show until" must be on or after "Show from".');

  const mediaType = $('ad-media-type').value;
  const ctaUrl = $('ad-cta-url').value.trim();
  const videoUrl = $('ad-video-url').value.trim();
  if (ctaUrl && !/^#|^https?:\/\//i.test(ctaUrl)) return showErr(err, 'CTA URL must start with https://, http:// or #.');
  if (mediaType === 'image' && !adImageValue) return showErr(err, 'Choose an image file or image URL for image ads.');
  if (mediaType === 'video' && !videoUrl) return showErr(err, 'Enter a video URL for video ads.');
  const duration = Math.min(30, Math.max(2, Number($('ad-duration').value) || 4));
  const record = {
    id,
    title,
    body: $('ad-body').value.trim(),
    ctaLabel: $('ad-cta-label').value.trim(),
    ctaUrl,
    mediaType,
    image: mediaType === 'image' ? adImageValue : '',
    videoUrl: mediaType === 'video' ? videoUrl : '',
    duration,
    revenue: Number($('ad-revenue').value) || 0,
    startDate,
    endDate,
    startTime,
    endTime,
    status: $('ad-status').value
  };

  if (editingAdIndex >= 0) ads[editingAdIndex] = record;
  else ads.unshift(record);

  log(`${editingAdIndex >= 0 ? 'Edited' : 'Added'} ad "${record.title}"`, 'ok');

  const wasEdit = editingAdIndex >= 0;
  adsDlg.close();
  renderAdsTable();
  autoSaveAds(wasEdit ? 'edit ad' : 'add ad');
  flash(adsFileHandle ? (wasEdit ? 'Updated and saved.' : 'Added and saved.') : (wasEdit ? 'Updated — connect the project to save.' : 'Added — connect the project to save.'), adsFileHandle ? 'success' : 'warning');
});

const adsToggle = $('ads-enabled-toggle');
adsToggle.classList.toggle('is-on', adsEnabled);
adsToggle.setAttribute('aria-checked', String(adsEnabled));
adsToggle.addEventListener('click', () => {
  adsEnabled = !adsEnabled;
  adsToggle.classList.toggle('is-on', adsEnabled);
  adsToggle.setAttribute('aria-checked', String(adsEnabled));
  log(`Loading screen ads turned ${adsEnabled ? 'on' : 'off'}`, 'ok');
  renderAdsSchedule();
  autoSaveAds('toggle ads');
});

function serializeAds() {
  const body = ads.map((a) => {
    const lines = [
      `    id: ${js(a.id)},`,
      `    title: ${js(a.title)},`,
      `    body: ${js(a.body)},`,
      `    ctaLabel: ${js(a.ctaLabel)},`,
      `    ctaUrl: ${js(a.ctaUrl)},`,
      `    mediaType: ${js(a.mediaType || '')},`,
      `    image: ${js(a.image || '')},`,
      `    videoUrl: ${js(a.videoUrl || '')},`,
      `    duration: ${Number(a.duration) || 4},`,
      `    revenue: ${Number(a.revenue) || 0},`,
      `    startDate: ${js(a.startDate || '')},`,
      `    endDate: ${js(a.endDate || '')},`,
      `    startTime: ${js(a.startTime || '')},`,
      `    endTime: ${js(a.endTime || '')},`,
      `    status: ${js(a.status)}`
    ];
    return `  {\n${lines.join('\n')}\n  }`;
  }).join(',\n');

  return `/**\n * LOADING SCREEN ADVERTISING\n * Managed by admin.html — you shouldn't need to edit this by hand.\n */\nwindow.EDG_ADS_ENABLED = ${adsEnabled};\nwindow.EDG_ADS = [\n${body}\n];\n`;
}

$('btn-export-ads').addEventListener('click', () => {
  const blob = new Blob([serializeAds()], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ads.js';
  a.click();
  URL.revokeObjectURL(a.href);
  log('Downloaded ads.js to your Downloads folder.', 'ok');
  flash('Downloaded. Move it into your data folder.', 'info');
});

/* ---------- push ads.js straight to GitHub (Contents API), independent of git ---------- */
const GH_OWNER = 'zwh19921116-crypto';
const GH_REPO = 'Resources';
const GH_BRANCH = 'main';
const GH_PATH = 'data/ads.js';
const GH_TOKEN_KEY = 'edg-gh-token';

function getGithubToken() {
  let token = localStorage.getItem(GH_TOKEN_KEY);
  if (!token) {
    token = prompt(
      'Paste a GitHub personal access token with "Contents: Read and write" access to this repo.\n\n' +
      'It is stored only in this browser\'s local storage and is only ever sent to api.github.com.'
    );
    if (token) localStorage.setItem(GH_TOKEN_KEY, token.trim());
  }
  return token ? token.trim() : '';
}

function setAdsPushState(text) {
  $('ads-push-state').textContent = text;
}

$('btn-push-ads').addEventListener('click', async () => {
  const token = getGithubToken();
  if (!token) return;
  const api = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_PATH}`;
  setAdsPushState('Pushing…');
  try {
    const getRes = await fetch(`${api}?ref=${GH_BRANCH}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
    });
    if (!getRes.ok) throw new Error(`Could not read the current file on GitHub (status ${getRes.status}). Check your token's permissions.`);
    const current = await getRes.json();

    const content = serializeAds();
    const encoded = btoa(unescape(encodeURIComponent(content)));
    const putRes = await fetch(api, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({
        message: 'Update advertising (data/ads.js) via admin panel',
        content: encoded,
        sha: current.sha,
        branch: GH_BRANCH
      })
    });
    if (!putRes.ok) {
      const err = await putRes.json().catch(() => ({}));
      throw new Error(err.message || `GitHub rejected the update (status ${putRes.status}).`);
    }
    log(`Pushed ${ads.length} ads to GitHub (data/ads.js).`, 'ok');
    flash('Advertising pushed to GitHub.', 'success');
    setAdsPushState(`Pushed ${new Date().toLocaleTimeString()}`);
  } catch (e) {
    log(`GITHUB PUSH FAILED: ${e.message}`, 'bad');
    flash('Push failed — see the log.', 'error');
    setAdsPushState('Push failed');
  }
});

let adsSaveTimer = null;
function autoSaveAds(reason) {
  keepAdsDraft();
  if (!adsFileHandle) return;
  clearTimeout(adsSaveTimer);
  adsSaveTimer = setTimeout(() => writeAdsFile(reason), 350);
}

async function writeAdsFile(reason) {
  if (!adsFileHandle) return false;
  try {
    const permission = await adsFileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      notifyDisconnected('Connection issue while saving ads. Reconnect project.');
      return false;
    }
    const writable = await adsFileHandle.createWritable();
    await writable.write(serializeAds());
    await writable.close();
    clearAdsDraft();
    log(`Saved ${ads.length} ads${reason ? ' after ' + reason : ''}`, 'ok');
    if (reason === 'drag schedule window') flash('Schedule saved.', 'success');
    return true;
  } catch (e) {
    log(`ADS SAVE FAILED: ${e.name} - ${e.message}`, 'bad');
    if (reason === 'drag schedule window') flash('Could not save schedule — see log.', 'error');
    return false;
  }
}

const saveAdsHandle = (h) => idb('readwrite', (s) => s.put(h, 'ads'));
const loadAdsHandle = () => idb('readonly', (s) => s.get('ads'));

/* ---------- live preview ---------- */
const LEVEL_TONE = { Easy: 'easy', Medium: 'medium', Hard: 'hard', Fun: 'fun' };

function currentDraft() {
  return {
    title: $('f-title').value.trim(),
    type: $('f-type').value,
    stage: $('f-stage').value,
    year: $('f-year').value,
    level: $('f-level').value,
    details: $('f-details').value.trim(),
    art: $('f-art').value,
    image: $('f-image').value.trim(),
    url: $('f-url').value.trim()
  };
}

function renderPreview() {
  const d = currentDraft();
  const type = CONFIG.types[d.type] || { label: d.type, colour: 'blue', action: 'link' };
  const tone = LEVEL_TONE[d.level] || 'info';
  const meta = [d.year, d.details].filter(Boolean).join(' &nbsp;\u2022&nbsp; ');

  $('preview').innerHTML = `
    <div class="pv-card">
      <div class="pv-thumb">
        ${window.edgThumb(d.art, d.image)}
        <span class="pv-badge ${type.colour}">${escapeHtml(type.label)}</span>
        ${type.action === 'embed' ? '<span class="pv-play"><span>\u25B6</span></span>' : ''}
      </div>
      <h3>${escapeHtml(d.title || 'Untitled resource')}</h3>
      <p class="pv-meta">${meta || '&nbsp;'}</p>
      <p class="pv-foot">
        <span class="pv-level tone-${tone}">${escapeHtml(d.level || '')}</span>
        <span class="pv-bars tone-${tone}"><i></i><i></i><i></i></span>
      </p>
    </div>`;

  const warn = $('pv-warn');
  if (d.image && /drive\.google\.com|dropbox\.com/i.test(d.image)) {
    showWarn(warn, 'Drive and Dropbox links usually will not display as images. Put the picture in assets\\thumbs instead.');
  } else if (type.action === 'embed' && d.url && !/youtu\.?be/i.test(d.url)) {
    showWarn(warn, 'Videos play in a popup only for YouTube links. Other links will open in a new tab.');
  } else {
    warn.hidden = true;
  }
}

function showWarn(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

['f-title', 'f-url', 'f-solutions', 'f-solutions-video', 'f-type', 'f-art', 'f-image', 'f-stage', 'f-unit', 'f-year', 'f-level', 'f-details'].forEach((id) => {
  const node = $(id);
  node.addEventListener('input', renderPreview);
  node.addEventListener('change', renderPreview);
});

function syncSolutionFields() {
  const solutionsEnabled = $('f-solutions-enabled').checked;
  const solutionsVideoEnabled = $('f-solutions-video-enabled').checked;
  $('f-solutions').disabled = !solutionsEnabled;
  $('f-solutions-video').disabled = !solutionsVideoEnabled;
  if (!solutionsEnabled) $('f-solutions').value = '';
  if (!solutionsVideoEnabled) $('f-solutions-video').value = '';
}

$('f-solutions-enabled').addEventListener('change', () => {
  syncSolutionFields();
  renderPreview();
});
$('f-solutions-video-enabled').addEventListener('change', () => {
  syncSolutionFields();
  renderPreview();
});

/* ---------- form ---------- */
function openForm(index) {
  editingIndex = index;
  const r = index >= 0 ? items[index] : {};
  $('dlg-title').textContent = index >= 0 ? 'Edit resource' : 'Add resource';
  $('f-title').value = r.title || '';
  $('f-url').value = r.url || '';
  $('f-solutions').value = r.solutions || '';
  $('f-solutions-video').value = r.solutionsVideo || '';
  $('f-solutions-enabled').checked = Boolean(r.solutions);
  $('f-solutions-video-enabled').checked = Boolean(r.solutionsVideo);
  syncSolutionFields();
  relatedResourceId = r.id || '__new__';
  relatedSelection = new Set(Array.isArray(r.relatedIds) ? r.relatedIds : []);
  $('f-related-search').value = '';
  $('f-type').value = r.type || typeKeys[0];
  $('f-view-type').value = r.viewType || 'standard';
  updateViewTypeFields();
  $('f-question-resource').value = r.questionResourceId || '';
  $('f-video-resource').value = r.videoResourceId || '';
  renderQuestionVideoPairs(Array.isArray(r.questionVideoPairs) ? r.questionVideoPairs : []);
  $('f-art').value = r.art || CONFIG.artStyles[0];
  $('f-image').value = r.image || '';
  $('f-stage').value = stageFor(r);
  $('f-unit').value = r.unit || (String(r.year || '').startsWith('VCE') ? r.year : '');
  $('f-subject').value = r.subject || CONFIG.subjects[0];
  $('f-year').value = r.year || CONFIG.years[0];
  $('f-level').value = r.level || CONFIG.levels[0];
  $('f-details').value = r.details || '';
  $('f-desc').value = r.desc || '';
  $('f-tags').value = (r.tags || []).join(', ');
  renderRelatedResourceOptions(r);
  $('f-status').value = r.status || 'published';
  $('f-id').value = r.id || '';
  updateUnitField();
  $('form-err').hidden = true;
  renderPreview();
  dlg.showModal();
  $('f-title').focus();
}

$('f-view-type').addEventListener('change', updateViewTypeFields);

function updateUnitField() {
  const isVce = $('f-stage').value === 'vce';
  $('f-unit-field').hidden = !isVce;
  $('f-unit').disabled = !isVce;
  if (!isVce) $('f-unit').value = '';
}

$('f-stage').addEventListener('change', updateUnitField);

$('f-title').addEventListener('input', () => {
  if (editingIndex >= 0) return;
  $('f-id').value = slugify($('f-title').value);
});
$('btn-add').addEventListener('click', () => openForm(-1));
$('btn-cancel').addEventListener('click', () => dlg.close());
$('search').addEventListener('input', renderTable);
$('btn-select-visible').addEventListener('click', () => {
  const query = $('search').value.trim().toLowerCase();
  const visibleIds = items
    .filter((item) => !query || `${item.title} ${item.subject} ${item.year} ${(item.tags || []).join(' ')}`.toLowerCase().includes(query))
    .map((item) => item.id);
  const shouldSelect = !visibleIds.length || !visibleIds.every((id) => selectedResourceIds.has(id));
  visibleIds.forEach((id) => {
    if (shouldSelect) selectedResourceIds.add(id);
    else selectedResourceIds.delete(id);
  });
  renderTable();
});
$('btn-clear-selection').addEventListener('click', () => {
  selectedResourceIds.clear();
  renderTable();
});
$('btn-delete-selected').addEventListener('click', deleteSelectedResources);

$('btn-save-item').addEventListener('click', () => {
  const err = $('form-err');
  const title = $('f-title').value.trim();
  const url = $('f-url').value.trim();
  const solutions = $('f-solutions-enabled').checked ? $('f-solutions').value.trim() : '';
  const solutionsVideo = $('f-solutions-video-enabled').checked ? $('f-solutions-video').value.trim() : '';
  let id = $('f-id').value.trim() || slugify(title);

  if (!title) return showErr(err, 'Please enter a title.');
  if (!url) return showErr(err, 'Please paste the link this card should open.');
  if (!/^https?:\/\//i.test(url)) return showErr(err, 'The link must start with http:// or https://');
  if ($('f-solutions-enabled').checked && !solutions) return showErr(err, 'Paste a Solutions link or turn off the Solutions link toggle.');
  if ($('f-solutions-video-enabled').checked && !solutionsVideo) return showErr(err, 'Paste a Solutions video link or turn off the Solutions video link toggle.');
  if (solutions && !/^https?:\/\//i.test(solutions)) return showErr(err, 'The Solutions link must start with http:// or https://');
  if (solutionsVideo && !/^https?:\/\//i.test(solutionsVideo)) return showErr(err, 'The Solutions video link must start with http:// or https://');
  if (items.some((r, i) => r.id === id && i !== editingIndex)) return showErr(err, `The ID "${id}" is already used. Give this one a different ID.`);

  const record = {
    id,
    title,
    type: $('f-type').value,
    viewType: $('f-view-type').value,
    questionResourceId: $('f-view-type').value === 'question-paper' ? $('f-question-resource').value : '',
    videoResourceId: $('f-view-type').value === 'question-paper' ? $('f-video-resource').value : '',
    questionVideoPairs: $('f-view-type').value === 'question-paper' ? readQuestionVideoPairs() : [],
    stage: $('f-stage').value,
    unit: $('f-stage').value === 'vce' ? $('f-unit').value : '',
    subject: $('f-subject').value,
    year: $('f-year').value,
    level: $('f-level').value,
    desc: $('f-desc').value.trim(),
    details: $('f-details').value.trim(),
    art: $('f-art').value,
    image: $('f-image').value.trim(),
    tags: $('f-tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    relatedIds: [...relatedSelection],
    url,
    solutions,
    solutionsVideo,
    added: (editingIndex >= 0 && items[editingIndex].added) || new Date().toISOString().slice(0, 10),
    status: $('f-status').value
  };

  if (editingIndex >= 0) items[editingIndex] = record;
  else items.unshift(record);

  log(`${editingIndex >= 0 ? 'Edited' : 'Added'} "${record.title}" -> ${record.url}`, 'ok', record.id);

  const wasEdit = editingIndex >= 0;
  dlg.close();
  if (!wasEdit) $('search').value = '';
  renderTable();
  if (!wasEdit) {
    requestAnimationFrame(() => {
      const first = document.querySelector('#table-wrap tbody tr[data-index="0"]');
      if (!first) return;
      first.scrollIntoView({ block: 'center' });
      first.classList.add('row-new');
      setTimeout(() => first.classList.remove('row-new'), 1400);
    });
  }
  autoSave(wasEdit ? 'edit' : 'add');
  flash(fileHandle ? (wasEdit ? 'Updated and saved.' : 'Added and saved.') : (wasEdit ? 'Updated — connect the file to save.' : 'Added — connect the file to save.'), fileHandle ? 'success' : 'warning');
});

function showErr(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}

/* ---------- output ---------- */
function serialize() {
  const body = items.map((r) => {
    const lines = [
      `    id: ${js(r.id)},`,
      `    title: ${js(r.title)},`,
      `    type: ${js(r.type)},`,
      `    viewType: ${js(r.viewType || 'standard')},`,
      `    questionResourceId: ${js(r.questionResourceId || '')},`,
      `    videoResourceId: ${js(r.videoResourceId || '')},`,
      `    questionVideoPairs: ${JSON.stringify(r.questionVideoPairs || []).replace(/"/g, "'")},`,
      `    stage: ${js(stageFor(r))},`,
      `    unit: ${js(r.unit || '')},`,
      `    subject: ${js(r.subject)},`,
      `    year: ${js(r.year)},`,
      `    level: ${js(r.level)},`,
      `    desc: ${js(r.desc)},`,
      `    details: ${js(r.details)},`,
      `    art: ${js(r.art)},`,
      `    image: ${js(r.image || '')},`,
      `    tags: [${(r.tags || []).map(js).join(', ')}],`,
      `    relatedIds: [${(r.relatedIds || []).map(js).join(', ')}],`,
      `    url: ${js(r.url)},`,
      `    solutions: ${js(r.solutions || '')},`,
      `    solutionsVideo: ${js(r.solutionsVideo || '')},`,
      `    added: ${js(r.added)},`,
      `    status: ${js(r.status)}`
    ];
    return `  {\n${lines.join('\n')}\n  }`;
  }).join(',\n');

  return `/**\n * MASTER RESOURCE LIST\n * Managed by admin.html — you shouldn't need to edit this by hand.\n * Newest entries go at the top.\n */\nwindow.EDG_RESOURCES = [\n${body}\n];\n`;
}

const js = (v) => `'${String(v ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ')}'`;

function resourcePreviewMarkup(resource) {
  const url = String(resource.url || '');
  const youtube = url.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/);
  if (youtube) return `<iframe src="https://www.youtube-nocookie.com/embed/${youtube[1]}?rel=0" title="${escapeHtml(resource.title)}" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (drive) return `<iframe src="https://drive.google.com/file/d/${drive[1]}/preview" title="${escapeHtml(resource.title)}" allow="autoplay"></iframe>`;
  if (/\.pdf(\?|#|$)/i.test(url)) return `<div class="pdf-reader" data-pdf-url="${escapeAttr(url)}"><div class="pdf-reader-toolbar"><span class="pdf-reader-name">${escapeHtml(resource.title)}</span><span class="pdf-reader-controls"><button type="button" data-pdf-prev aria-label="Previous page" disabled>‹</button><span data-pdf-page>Loading</span><button type="button" data-pdf-next aria-label="Next page" disabled>›</button><i></i><button type="button" data-pdf-zoom-out aria-label="Zoom out">−</button><button type="button" data-pdf-zoom-in aria-label="Zoom in">+</button></span></div><p class="pdf-reader-status" data-pdf-status>Loading document</p><div class="pdf-reader-canvas"><canvas></canvas></div><div class="pdf-reader-fallback" hidden><div class="pdf-cover"><div class="pdf-cover-art">${window.edgThumb(resource.art, resource.image)}</div><div class="pdf-cover-copy"><span>PDF resource</span><h2>${escapeHtml(resource.title)}</h2><p>This document cannot be previewed here. Open the full document to read it.</p><a href="${escapeAttr(url)}">View full document</a></div></div></div></div>`;
  return `<div class="preview-note"><p>${escapeHtml(typeLabel(resource.type))}</p><p class="small">Use Open resource to view it here.</p></div>`;
}

function hasInlinePreview(resource) {
  const url = String(resource.url || '');
  return /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/.test(url)
    || /drive\.google\.com\/file\/d\/([\w-]+)/.test(url)
    || /\.pdf(\?|#|$)/i.test(url);
}

function typeLabel(typeKey) {
  return (CONFIG.types[typeKey] || { label: typeKey }).label;
}

function questionPaperMarkup(resource, linkPrefix) {
  if (resource.viewType !== 'question-paper') return '';
  const pairs = Array.isArray(resource.questionVideoPairs) ? resource.questionVideoPairs : [];
  if (pairs.length) {
    const pairMarkup = pairs.map((pair, index) => {
      const question = items.find((item) => item.id === pair.questionResourceId && item.status !== 'draft');
      const video = items.find((item) => item.id === pair.videoResourceId && item.status !== 'draft');
      if (!question && !video) return '';
      const questionUrl = question ? `${question.url || ''}${pair.page ? `#page=${encodeURIComponent(pair.page)}` : ''}` : '';
      const videoId = video ? String(video.url || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/) : null;
      const questionViewer = question ? `<div class="question-region" data-pdf-url="${escapeAttr(question.url)}" data-pdf-page="${escapeAttr(pair.page || 1)}" data-pdf-top="${escapeAttr(pair.top ?? 0)}" data-pdf-bottom="${escapeAttr(pair.bottom ?? 100)}"><canvas></canvas><span>Loading question</span></div><a class="btn btn-light btn-sm" href="${escapeAttr(questionUrl)}" target="_blank" rel="noopener">Open question</a>` : '<p>Question resource not selected.</p>';
      return `<article class="question-video-pair"><div class="question-video-question"><span class="question-video-label">Question ${index + 1}${pair.page ? ` · Page ${escapeHtml(pair.page)}` : ''}</span>${question ? `<h3>${escapeHtml(question.title)}</h3>${questionViewer}` : questionViewer}</div><div class="question-video-viewer">${videoId ? `<iframe src="https://www.youtube-nocookie.com/embed/${videoId[1]}?rel=0" title="${escapeHtml(video.title)}" loading="lazy" allow="accelerometer; autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>` : video ? `<a class="btn btn-light btn-sm" href="${escapeAttr(video.url)}" target="_blank" rel="noopener">Watch ${escapeHtml(video.title)}</a>` : '<p>Video not selected.</p>'}</div></article>`;
    }).filter(Boolean).join('');
    if (pairMarkup) return `<section class="question-paper-links" aria-labelledby="question-paper-links-title"><p class="section-eyebrow">Exam support</p><h2 id="question-paper-links-title">Questions and videos</h2><div class="question-video-pairs">${pairMarkup}</div></section>`;
  }
  const question = items.find((item) => item.id === resource.questionResourceId && item.status !== 'draft');
  const video = items.find((item) => item.id === resource.videoResourceId && item.status !== 'draft');
  const links = [
    question ? `<a class="question-paper-link" href="${linkPrefix}${encodeURIComponent(question.id)}/index.html"><span>Question resource</span><strong>${escapeHtml(question.title)}</strong></a>` : '',
    video ? `<a class="question-paper-link" href="${linkPrefix}${encodeURIComponent(video.id)}/index.html"><span>Associated video</span><strong>${escapeHtml(video.title)}</strong></a>` : ''
  ].filter(Boolean).join('');
  return links ? `<section class="question-paper-links" aria-labelledby="question-paper-links-title"><p class="section-eyebrow">Exam support</p><h2 id="question-paper-links-title">Use this paper with</h2><div class="question-paper-link-grid">${links}</div></section>` : '';
}

function resourcePageMarkup(resource) {
  const type = CONFIG.types[resource.type] || { label: resource.type, colour: 'blue', blurb: '' };
  const staticPath = resourcePagePath(resource);
  const rootPrefix = '../../';
  const resourcePagesPrefix = '../';
  const metadata = [['Subject', resource.subject], ['Year level', resource.year], ['Difficulty', resource.level], ['Details', resource.details], ['Solutions', resource.solutions], ['Solutions video', resource.solutionsVideo]]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${label === 'Solutions' ? `<a href="${escapeAttr(value)}">View solutions</a>` : label === 'Solutions video' ? `<a href="${escapeAttr(value)}">Watch solutions video</a>` : escapeHtml(value)}</dd></div>`).join('');
  const related = relatedResourcesFor(resource);
  const relatedMarkup = related.map((item) => {
    const relatedType = CONFIG.types[item.type] || { label: item.type, colour: 'blue' };
    const relatedPath = resourcePagePath(item);
    return `<article class="resource-card"><a class="thumb" href="${resourcePagesPrefix}${relatedPath}/index.html"><span class="badge badge-${relatedType.colour}">${escapeHtml(relatedType.label)}</span>${window.edgThumb(item.art, item.image)}</a><a class="card-link" href="${resourcePagesPrefix}${relatedPath}/index.html"><h3>${escapeHtml(item.title)}</h3><p class="meta">${escapeHtml(item.year || '')}</p></a></article>`;
  }).join('');
  const relatedSection = relatedMarkup ? `<section class="related-resources" data-carousel><a class="reader-download" href="${escapeAttr(resource.url)}" download>Download resource</a><div class="related-resources-head"><div><p class="section-eyebrow">Keep learning</p><h2>More ${escapeHtml(resource.subject)} resources</h2></div><div class="carousel-controls"><button type="button" data-carousel-prev aria-label="Previous related resources">‹</button><button type="button" data-carousel-next aria-label="Next related resources">›</button></div></div><div class="related-carousel" tabindex="0" aria-label="Related ${escapeHtml(resource.subject)} resources"><div class="related-track">${relatedMarkup}</div></div></section>` : '';
  const questionPaperSection = questionPaperMarkup(resource, resourcePagesPrefix);
  const solutionHref = String(resource.solutions || '').startsWith('resource-pages/') ? `../${String(resource.solutions).slice('resource-pages/'.length)}` : resource.solutions;
  const preview = resourcePreviewMarkup(resource);
  const canonical = `https://zwh19921116-crypto.github.io/Resources/resource-pages/${staticPath}/`;
  const description = resource.desc || type.blurb;
  const actionLabel = resource.type === 'video' ? 'Watch video' : /\.pdf(\?|#|$)/i.test(String(resource.url || '')) ? 'View full document' : 'Open resource';
  const solutionsButton = resource.solutions ? `<a class="btn btn-solutions btn-block" href="${escapeAttr(solutionHref)}">View Solutions <svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg></a>` : '';
  const solutionsVideoButton = resource.solutionsVideo ? `<a class="btn btn-primary btn-block" href="${escapeAttr(resource.solutionsVideo)}" target="_blank" rel="noopener noreferrer">Watch Solutions Video <svg class="ico" aria-hidden="true"><use href="#i-arrow"/></svg></a>` : '';
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'LearningResource', name: resource.title, description, educationalLevel: resource.year, learningResourceType: type.label, url: canonical, about: resource.tags || [], isAccessibleForFree: true, inLanguage: 'en-AU' });
  const faqSchema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: [
    { '@type': 'Question', name: `Who is ${resource.title} for?`, acceptedAnswer: { '@type': 'Answer', text: `${resource.title} is suitable for ${resource.year || 'students'} studying ${resource.subject || 'this topic'}.` } },
    { '@type': 'Question', name: `How should I use ${resource.title}?`, acceptedAnswer: { '@type': 'Answer', text: description } }
  ] });

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(resource.title)} | Edgeducate Resources</title><meta name="description" content="${escapeHtml(description)}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escapeHtml(resource.title)} | Edgeducate Resources"><meta property="og:description" content="${escapeHtml(description)}"><meta property="og:type" content="article"><meta property="og:url" content="${canonical}"><script type="application/ld+json">${schema}</script><script type="application/ld+json">${faqSchema}</script><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet"><link rel="stylesheet" href="${rootPrefix}styles.css"></head>
<body class="resource-detail-page"><header class="site-header is-solid"><div class="container"><div class="navbar"><a class="brand" href="${rootPrefix}index.html"><span class="brand-fallback"><span class="brand-name"><strong>Edge</strong>ducate</span><span class="brand-tag">Leading Edge in Education</span></span></a><nav class="primary-nav"><a href="${rootPrefix}index.html">Home</a><a href="${rootPrefix}index.html#categories">Categories</a><a href="${rootPrefix}resources.html" class="is-active">Resources</a></nav><a class="btn btn-cta" href="${rootPrefix}resources.html">Browse library</a></div></div></header>
<main><article class="resource-detail${hasInlinePreview(resource) ? ' has-inline-preview' : ''}"${hasInlinePreview(resource) ? ` data-resource-title="${escapeAttr(resource.title)}" data-resource-context="${escapeAttr(`${type.label} · ${resource.subject} · ${resource.year}`)}"` : ''}><div class="container"><nav class="crumbs"><a href="${rootPrefix}index.html">Resources</a><span>/</span><a href="${rootPrefix}resources.html">Library</a><span>/</span><span>${escapeHtml(resource.title)}</span></nav><div class="resource-detail-layout"><div class="resource-detail-preview">${preview}</div><div class="resource-detail-copy"><span class="badge badge-${type.colour}">${escapeHtml(type.label)}</span><h1>${escapeHtml(resource.title)}</h1><p class="resource-detail-desc">${escapeHtml(description)}</p><dl class="resource-detail-meta">${metadata}</dl><a class="btn btn-primary btn-block" href="${escapeHtml(resource.url)}">${actionLabel}</a><a class="resource-back" href="${rootPrefix}resources.html">Back to all resources</a></div></div><section class="resource-faq"><h2>About this resource</h2><dl><div><dt>Who is this for?</dt><dd>${escapeHtml(resource.title)} is suitable for ${escapeHtml(resource.year || 'students')} studying ${escapeHtml(resource.subject || 'this topic')}.</dd></div><div><dt>How should I use it?</dt><dd>${escapeHtml(description)}</dd></div></dl></section>${relatedSection}</div></article></main>
  <footer class="site-footer"><div class="container footer-simple"><span class="brand-name light"><strong>Edge</strong>ducate</span><p>&copy; ${new Date().getFullYear()} Edgeducate</p></div></footer><script src="${rootPrefix}reader-layout.js"></script><script src="${rootPrefix}carousel.js"></script><script type="module" src="${rootPrefix}pdf-reader.js"></script></body></html>`.replace('</div></div><section class="resource-faq"', `</div></div>${questionPaperSection}<section class="resource-faq"`).replace('<a class="resource-back"', `${solutionsButton}${solutionsVideoButton}<a class="resource-back"`);
}

async function writeStaticPages() {
  if (!projectHandle) return false;
  const pagesDirectory = await projectHandle.getDirectoryHandle('resource-pages', { create: true });
  for await (const [name] of pagesDirectory.entries()) await pagesDirectory.removeEntry(name, { recursive: true });
  for (const resource of items.filter((item) => item.status !== 'draft')) {
    let pageDirectory = pagesDirectory;
    for (const segment of resourcePagePath(resource).split('/')) pageDirectory = await pageDirectory.getDirectoryHandle(segment, { create: true });
    const pageFile = await pageDirectory.getFileHandle('index.html', { create: true });
    const writable = await pageFile.createWritable();
    await writable.write(resourcePageMarkup(resource));
    await writable.close();
  }
  const sitemap = items.filter((item) => item.status !== 'draft').map((item) => `  <url><loc>https://zwh19921116-crypto.github.io/Resources/resource-pages/${resourcePagePath(item)}/</loc><lastmod>${item.added || new Date().toISOString().slice(0, 10)}</lastmod></url>`).join('\n');
  const sitemapFile = await projectHandle.getFileHandle('sitemap.xml', { create: true });
  const sitemapWriter = await sitemapFile.createWritable();
  await sitemapWriter.write(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://zwh19921116-crypto.github.io/Resources/</loc></url>\n  <url><loc>https://zwh19921116-crypto.github.io/Resources/resources.html</loc></url>\n${sitemap}\n</urlset>\n`);
  await sitemapWriter.close();
  return true;
}

async function listPublishedPageFolders(dirHandle, prefix = '') {
  const folders = [];
  for await (const entry of dirHandle.entries()) {
    const [name, value] = entry;
    const kind = typeof value === 'string' ? value : value.kind;
    const nextPrefix = prefix ? `${prefix}/${name}` : name;
    if (kind === 'file') {
      if (name === 'index.html' && prefix) folders.push(prefix);
      continue;
    }
    if (kind === 'directory') {
      const child = await dirHandle.getDirectoryHandle(name);
      folders.push(...await listPublishedPageFolders(child, nextPrefix));
    }
  }
  return folders;
}

async function logConsistencyReport(context, options = {}) {
  if (!projectHandle) {
    log(`[Consistency:${context}] skipped - project not connected.`, 'warnl');
    return;
  }
  const stale = options && options.inMemoryMayBeStale;
  try {
    const expected = items.filter((item) => item.status !== 'draft').map((item) => resourcePagePath(item));
    const expectedSet = new Set(expected);
    const pagesDirectory = await projectHandle.getDirectoryHandle('resource-pages', { create: true });
    const actual = await listPublishedPageFolders(pagesDirectory);
    const actualSet = new Set(actual);
    const missing = expected.filter((slug) => !actualSet.has(slug));
    const extra = actual.filter((slug) => !expectedSet.has(slug));

    log(
      `[Consistency:${context}] resources=${items.length}, published=${expected.length}, drafts=${items.length - expected.length}, generatedFolders=${actual.length}${stale ? ' (in-memory data may be stale until reload)' : ''}.`,
      'info'
    );

    if (!missing.length && !extra.length) {
      log(`[Consistency:${context}] OK - generated pages match current resources.`, 'ok');
      return;
    }

    if (missing.length) {
      const sample = missing.slice(0, 8).join(', ');
      log(`[Consistency:${context}] Missing generated pages (${missing.length}): ${sample}${missing.length > 8 ? ', ...' : ''}`, 'bad');
    }
    if (extra.length) {
      const sample = extra.slice(0, 8).join(', ');
      log(`[Consistency:${context}] Extra generated pages not in data (${extra.length}): ${sample}${extra.length > 8 ? ', ...' : ''}`, 'warnl');
    }
  } catch (e) {
    log(`[Consistency:${context}] REPORT FAILED: ${e.name} - ${e.message}`, 'bad');
  }
}

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([serialize()], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'resources.js';
  a.click();
  URL.revokeObjectURL(a.href);
  log('Downloaded resources.js to your Downloads folder.', 'ok');
  flash('Downloaded. Move it into your data folder.', 'info');
});

/* ---------- file handle storage ---------- */
/** The chosen file handle is kept in IndexedDB so reopening only needs a permission re-grant. */
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('edg-admin', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('handles');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('handles', mode);
      const req = fn(tx.objectStore('handles'));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}
const saveHandle = (h) => idb('readwrite', (s) => s.put(h, 'resources'));
const loadHandle = () => idb('readonly', (s) => s.get('resources'));
const saveProjectHandle = (h) => idb('readwrite', (s) => s.put(h, 'project'));
const loadProjectHandle = () => idb('readonly', (s) => s.get('project'));
const saveClubHandle = (h) => idb('readwrite', (s) => s.put(h, 'club'));
const loadClubHandle = () => idb('readonly', (s) => s.get('club'));
const savePackageHandle = (h) => idb('readwrite', (s) => s.put(h, 'packages'));
const loadPackageHandle = () => idb('readonly', (s) => s.get('packages'));

function desktopDirectoryHandle(relativePath) {
  return {
    async getDirectoryHandle(name) { return desktopDirectoryHandle([relativePath, name].filter(Boolean).join('/')); },
    async getFileHandle(name) { return desktopFileHandle([relativePath, name].filter(Boolean).join('/')); },
    async *entries() { for (const entry of await window.desktop.projectList(relativePath)) yield entry; },
    async removeEntry(name, options) { return window.desktop.projectRemove([relativePath, name].filter(Boolean).join('/'), options && options.recursive); }
  };
}

function desktopFileHandle(relativePath) {
  return {
    async queryPermission() { return 'granted'; },
    async requestPermission() { return 'granted'; },
    async createWritable() {
      let content;
      return {
        async write(value) { content = value; },
        async close() { await window.desktop.projectWrite(relativePath, content); }
      };
    }
  };
}

/* ---------- save status ---------- */
function setState(state, text) {
  const el = $('save-state');
  el.className = `save-state ${state}`;
  el.textContent = text;
}

function setConnectionUi(connected) {
  const connectBtn = $('btn-connect-project');
  const saveBtn = $('btn-save');
  connectBtn.hidden = connected;
  saveBtn.hidden = !connected;
}

let saveTimer = null;
let saving = false;
let queuedSaveReason = '';
let hasPendingLocalChanges = false;
let disconnectFlashAt = 0;

/** Writes the file without prompting, once a handle has been connected. */
async function autoSave(reason) {
  if (!fileHandle) {
    setState('is-dirty', 'Not saved');
    return;
  }
  hasPendingLocalChanges = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void writeFile(reason);
  }, 350);
}

async function writeFile(reason, showProgress = true) {
  if (!fileHandle) return false;
  if (saving) {
    queuedSaveReason = reason || 'queued save';
    return false;
  }
  if (!projectHandle) {
    setState('is-error', 'Reconnect project');
    log('Resource file saved previously without a project-folder connection. Click "Reconnect project" so resource pages can be regenerated.', 'bad');
    notifyDisconnected('Disconnected from project. Reconnecting...');
    return false;
  }
  saving = true;
  if (showProgress) setState('is-saving', 'Saving…');
  try {
    const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      setState('is-error', 'Needs permission');
      log('Lost write permission - click "Reconnect file".', 'bad');
      notifyDisconnected('Lost write permission. Please reconnect project.');
      saving = false;
      return false;
    }
    const text = serialize();
    const writable = await fileHandle.createWritable();
    await writable.write(text);
    await writable.close();
    await writeStaticPages();
    clearDraft();
    hasPendingLocalChanges = false;
    const setupNotice = $('fs-notice');
    if (setupNotice) setupNotice.hidden = true;
    setState('is-saved', `Saved ${new Date().toLocaleTimeString()}`);
    log(`Saved ${items.length} resources and regenerated ${items.filter((item) => item.status !== 'draft').length} SEO pages${reason ? ' after ' + reason : ''}`, 'ok');
    saving = false;
    if (queuedSaveReason) {
      const nextReason = queuedSaveReason;
      queuedSaveReason = '';
      void writeFile(nextReason);
    }
    return true;
  } catch (e) {
    setState('is-error', 'Save failed');
    log(`SAVE FAILED: ${e.name} - ${e.message}`, 'bad');
    saving = false;
    if (queuedSaveReason) {
      const nextReason = queuedSaveReason;
      queuedSaveReason = '';
      void writeFile(nextReason);
    }
    return false;
  }
}

let clubSaveTimer = null;
function autoSaveClub(reason) {
  if (!clubFileHandle) return;
  clearTimeout(clubSaveTimer);
  clubSaveTimer = setTimeout(() => writeClubFile(reason), 350);
}

async function writeClubFile(reason) {
  if (!clubFileHandle) return false;
  try {
    const permission = await clubFileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      notifyDisconnected('Connection issue while saving club offers. Reconnect project.');
      return false;
    }
    const writable = await clubFileHandle.createWritable();
    await writable.write(serializeClubDeals());
    await writable.close();
    log(`Saved ${clubDeals.length} Club offers${reason ? ' after ' + reason : ''}`, 'ok');
    return true;
  } catch (e) {
    log(`CLUB SAVE FAILED: ${e.name} - ${e.message}`, 'bad');
    return false;
  }
}

let packageSaveTimer = null;
function autoSavePackages(reason) {
  if (!packagesFileHandle) return;
  clearTimeout(packageSaveTimer);
  packageSaveTimer = setTimeout(() => writePackagesFile(reason), 350);
}

async function writePackagesFile(reason) {
  if (!packagesFileHandle) return false;
  try {
    const permission = await packagesFileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      notifyDisconnected('Connection issue while saving packages. Reconnect project.');
      return false;
    }
    const writable = await packagesFileHandle.createWritable();
    await writable.write(serializePackages());
    await writable.close();
    log(`Saved ${packages.length} package collections${reason ? ' after ' + reason : ''}`, 'ok');
    return true;
  } catch (e) {
    log(`PACKAGES SAVE FAILED: ${e.name} - ${e.message}`, 'bad');
    return false;
  }
}

async function connectFile() {
  if (window.desktop && window.desktop.projectConnect) return connectDesktopProject();
  if (!window.showDirectoryPicker) {
    log('This browser has no project-folder save support. Open the admin page over http://localhost in Chrome.', 'bad');
    alert('Chrome blocks folder saving when a page is opened straight from disk.\n\nRun start-admin.bat to open this page properly.');
    return;
  }
  if (folderPickerActive) {
    log('A folder picker is already open. Finish or close it before connecting again.', 'warnl');
    setState('is-dirty', 'Folder picker already open');
    return;
  }
  if (!acquirePickerLock()) {
    log('Another admin page already has the folder picker open. Close it before connecting here.', 'warnl');
    setState('is-dirty', 'Picker open in another page');
    return;
  }
  folderPickerActive = true;
  $('btn-connect-project').disabled = true;
  setState('is-dirty', 'Choose project folder...');
  try {
    log('Opening the folder picker - choose the Resources project folder.', 'warnl');
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });
    log(`Folder picker returned: ${root.name}`, 'info');
    const granted = await root.requestPermission({ mode: 'readwrite' });
    log(`Folder permission request returned: ${granted}`, 'info');
    log(`Permission to write: ${granted}`, granted === 'granted' ? 'ok' : 'bad');
    if (granted !== 'granted') {
      setState('is-error', 'Permission denied');
      return;
    }
    const dataDirectory = await root.getDirectoryHandle('data');
    fileHandle = await dataDirectory.getFileHandle('resources.js');
    adsFileHandle = await dataDirectory.getFileHandle('ads.js', { create: true });
    clubFileHandle = await dataDirectory.getFileHandle('club-deals.js', { create: true });
    packagesFileHandle = await dataDirectory.getFileHandle('packages.js', { create: true });
    projectHandle = root;
    await saveHandle(fileHandle);
    await saveAdsHandle(adsFileHandle);
    await saveClubHandle(clubFileHandle);
    await savePackageHandle(packagesFileHandle);
    await saveProjectHandle(root);
    setConnectionUi(true);
    $('btn-save').textContent = 'Save now';
    setState('is-saved', 'Connected successfully');
    log(`Connected successfully to project folder ${root.name}`, 'ok');
    flash(`Connected successfully to ${root.name}`, 'success');
    await writeFile('connecting');
    await writeAdsFile('connecting');
    await writeClubFile('connecting');
    await writePackagesFile('connecting');
  } catch (e) {
    if (e && e.name === 'AbortError') {
      log('You closed the file picker without choosing a file - nothing saved.', 'warnl');
      setConnectionUi(false);
      setState('', 'Not connected');
      return;
    }
    setConnectionUi(false);
    log(`CONNECT FAILED: ${e.name} - ${e.message}`, 'bad');
    setState('is-error', 'Connection failed');
  } finally {
    folderPickerActive = false;
    releasePickerLock();
    $('btn-connect-project').disabled = false;
  }
}

async function connectDesktopProject() {
  if (folderPickerActive) return;
  folderPickerActive = true;
  $('btn-connect-project').disabled = true;
  setState('is-dirty', 'Connecting project...');
  try {
    log('Desktop bridge detected. Starting project handshake...', 'info');
    const result = await window.desktop.projectConnect();
    if (!result.ok) throw new Error(`Missing project files: ${result.missing.join(', ')}`);
    log('Project handshake successful. Required project files were found.', 'ok');
    fileHandle = desktopFileHandle('data/resources.js');
    adsFileHandle = desktopFileHandle('data/ads.js');
    clubFileHandle = desktopFileHandle('data/club-deals.js');
    packagesFileHandle = desktopFileHandle('data/packages.js');
    projectHandle = desktopDirectoryHandle('');
    setConnectionUi(true);
    $('btn-save').textContent = 'Save now';
    setState('is-saved', 'Connected successfully');
    log('Connected successfully to the Electron project checkout.', 'ok');
    flash('Connected successfully', 'success');
    await writeFile('connecting');
    await writeAdsFile('connecting');
    await writeClubFile('connecting');
    await writePackagesFile('connecting');
    await logConsistencyReport('connect');
  } catch (e) {
    setConnectionUi(false);
    setState('is-error', 'Connection failed');
    log(`CONNECT FAILED: ${e.message}`, 'bad');
    notifyDisconnected('Project connection failed. Please reconnect.');
  } finally {
    folderPickerActive = false;
    $('btn-connect-project').disabled = false;
  }
}

$('btn-connect-project').addEventListener('click', connectFile);

async function waitForResourceSaveIdle(timeoutMs = 6000) {
  const start = Date.now();
  while (saving) {
    if (Date.now() - start > timeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return true;
}

$('btn-save').addEventListener('click', async () => {
  if (!fileHandle || !projectHandle) return connectFile();
  const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted') {
    const asked = await fileHandle.requestPermission({ mode: 'readwrite' });
    log(`Permission after asking: ${asked}`, asked === 'granted' ? 'ok' : 'bad');
    if (asked !== 'granted') return;
    $('btn-save').textContent = 'Save now';
    setState('is-saved', 'Connected');
    return;
  }
  const idle = await waitForResourceSaveIdle();
  if (!idle) {
    log('SAVE SKIPPED: Another save is still running. Try again in a moment.', 'warnl');
    flash('A save is already running. Please try Save now again.', 'warning');
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = null;
  clearTimeout(adsSaveTimer);
  adsSaveTimer = null;
  clearTimeout(clubSaveTimer);
  clubSaveTimer = null;
  clearTimeout(packageSaveTimer);
  packageSaveTimer = null;

  const results = {
    resources: await writeFile('manual save'),
    ads: await writeAdsFile('manual save'),
    club: await writeClubFile('manual save'),
    packages: await writePackagesFile('manual save')
  };
  const failed = Object.entries(results).filter(([, ok]) => !ok).map(([name]) => name);
  if (failed.length) {
    const list = failed.join(', ');
    log(`SAVE INCOMPLETE: Failed to save ${list}.`, 'bad');
    flash(`Save incomplete (${list}). See log and reconnect if needed.`, 'error');
    return;
  }

  await logConsistencyReport('save-now');

  if (results.resources) {
    flash(window.desktop ? 'Saved — pushing to GitHub…' : 'Saved locally — use the desktop app to push to GitHub.', window.desktop ? 'success' : 'info');
    if (window.syncToGithubAfterSave) await window.syncToGithubAfterSave();
  }
});

/** Reconnects to the previously chosen file, asking for permission if needed. */
async function restoreHandle() {
  try {
    const [root, handle, adsHandle, savedClubHandle, savedPackageHandle] = await Promise.all([loadProjectHandle(), loadHandle(), loadAdsHandle(), loadClubHandle(), loadPackageHandle()]);
    if (fileHandle || projectHandle) return;
    if (!handle) {
      setConnectionUi(false);
      return setState('', 'Not connected');
    }
    fileHandle = handle;
    adsFileHandle = adsHandle || null;
    clubFileHandle = savedClubHandle || null;
    packagesFileHandle = savedPackageHandle || null;
    projectHandle = root || null;
    $('btn-save').textContent = 'Save now';
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'granted' && projectHandle) {
      setConnectionUi(true);
      setState('is-saved', 'Connected');
      log(`Reconnected to project folder and ${handle.name} - auto-save is on.`, 'ok');
    } else {
      setConnectionUi(false);
      setState('is-dirty', 'Click Connect project');
      log('The project folder permission is missing - click "Connect project" and choose the Resources folder again.', 'warnl');
      notifyDisconnected('Project disconnected. Please click Connect project.');
    }
  } catch (e) {
    if (fileHandle || projectHandle) return;
    setConnectionUi(false);
    setState('', 'Not connected');
  }
}

async function bootstrapConnection() {
  if (window.desktop && window.desktop.projectConnect) {
    if (!fileHandle || !projectHandle) await connectDesktopProject();
    return;
  }
  await restoreHandle();
}


let flashTimer;
function flash(msg, tone = 'info') {
  const f = $('flash');
  if (!f) return;
  f.textContent = msg;
  f.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');
  const toneClass = tone === 'success' ? 'is-success' : tone === 'warning' ? 'is-warning' : tone === 'error' ? 'is-error' : 'is-info';
  f.classList.add(toneClass);
  f.classList.remove('show');
  void f.offsetWidth;
  f.classList.add('show');
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => f.classList.remove('show'), 3200);
}

function notifyDisconnected(message) {
  const now = Date.now();
  if (now - disconnectFlashAt < 6000) return;
  disconnectFlashAt = now;
  flash(message || 'Project disconnected. Please reconnect.', 'warning');
}

window.addEventListener('beforeunload', (e) => {
  if (!fileHandle && serialize() !== originalText) {
    e.preventDefault();
    e.returnValue = '';
  }
});

$('draft-discard').addEventListener('click', () => {
  items = JSON.parse(JSON.stringify(window.EDG_RESOURCES || []));
  clearDraft();
  renderTable();
  log('Discarded unsaved changes.', 'warnl');
  autoSave('discard');
  flash('Unsaved changes discarded.', 'warning');
});

$('log-copy').addEventListener('click', async () => {
  const lines = logFilter ? logLines.filter((l) => l.ref === logFilter) : logLines;
  const text = lines.map((l) => `${l.t}  ${l.msg}`).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    flash('Log copied — paste it into the chat.', 'info');
  } catch (e) {
    prompt('Copy this log:', text);
  }
});

$('log-clear').addEventListener('click', () => {
  logLines = [];
  localStorage.removeItem(LOG_KEY);
  paintLog();
});

$('btn-log').addEventListener('click', () => openLog('', ''));
$('log-all').addEventListener('click', () => openLog('', ''));
$('log-close').addEventListener('click', () => $('log-dlg').close());

const migrateDlg = $('migrate-dlg');
const migrateBtn = $('btn-migrate');
const migrateCloseBtn = $('migrate-close');
const migrateAuthPath = $('migrate-auth-path');
const migrateProjectRootPath = $('migrate-project-root-path');
const migrateAdminDesktopPath = $('migrate-admin-desktop-path');
let desktopPathsCache = null;

function inferAuthPathFromLogPath(logFilePath) {
  if (!logFilePath || typeof logFilePath !== 'string') return '';
  const sep = logFilePath.includes('\\') ? '\\' : '/';
  const marker = `${sep}logs${sep}admin.log`;
  if (!logFilePath.endsWith(marker)) return '';
  return `${logFilePath.slice(0, -marker.length)}${sep}auth.json`;
}

async function loadDesktopPaths() {
  if (desktopPathsCache) return desktopPathsCache;
  if (!window.desktop || typeof window.desktop.getPaths !== 'function') return null;
  try {
    desktopPathsCache = await window.desktop.getPaths();
    return desktopPathsCache;
  } catch (error) {
    return null;
  }
}

async function refreshMigrationHints() {
  if (!migrateAuthPath) return;
  const paths = await loadDesktopPaths();
  const projectRoot = paths && typeof paths.standaloneDir === 'string' ? paths.standaloneDir : '';
  const authPath = inferAuthPathFromLogPath(paths && paths.logFile);
  if (migrateProjectRootPath) {
    migrateProjectRootPath.textContent = projectRoot
      ? `Current project root: ${projectRoot}`
      : 'Current project root: unavailable (open in desktop app to reveal)';
  }
  if (migrateAdminDesktopPath) {
    const sep = projectRoot.includes('\\') ? '\\' : '/';
    const parent = projectRoot ? projectRoot.split(/[/\\]/).slice(0, -1).join(sep) : '';
    const adminDesktopPath = parent ? `${parent}${sep}admin-desktop` : '';
    migrateAdminDesktopPath.textContent = adminDesktopPath
      ? `Current admin-desktop folder: ${adminDesktopPath}`
      : 'Current admin-desktop folder: unavailable (copy your existing admin-desktop folder)';
  }
  migrateAuthPath.textContent = authPath
    ? `Current auth.json path: ${authPath}`
    : 'Current auth.json path: unavailable (open in desktop app to reveal)';
}

if (migrateBtn && migrateDlg) {
  migrateBtn.addEventListener('click', async () => {
    await refreshMigrationHints();
    migrateDlg.showModal();
    log('Opened migration guide.', 'ok');
  });
}

if (migrateCloseBtn && migrateDlg) {
  migrateCloseBtn.addEventListener('click', () => migrateDlg.close());
}

paintLog();
log(`Page loaded. Project save supported: ${Boolean(window.showDirectoryPicker)}. ${items.length} resources in memory.`);
if (window.desktop) {
  clearDraft();
  clearAdsDraft();
} else {
  restoreDraft();
  restoreAdsDraft();
}
renderTable();
renderAdsTable();
renderClubTable();
renderPackagesTable();
renderDashboard();
void bootstrapConnection();
const originalText = serialize();

/* ---------- desktop app: sync everything (resources + ads) straight to GitHub via git ---------- */
if (window.desktop) {
  const syncBtn = $('btn-desktop-sync');
  const pullBtn = $('btn-desktop-pull');
  const lastPushTime = $('last-push-time');
  const lastPullTime = $('last-pull-time');
  const syncTimesKey = 'resource-master-control-sync-times';
  const syncTimes = JSON.parse(localStorage.getItem(syncTimesKey) || '{}');
  const formatSyncTime = (value) => value ? new Date(value).toLocaleString() : 'Never';
  const recordSyncTime = (name, element) => {
    syncTimes[name] = new Date().toISOString();
    localStorage.setItem(syncTimesKey, JSON.stringify(syncTimes));
    element.textContent = formatSyncTime(syncTimes[name]);
  };
  lastPushTime.textContent = formatSyncTime(syncTimes.push);
  lastPullTime.textContent = formatSyncTime(syncTimes.pull);

  async function syncToGithub() {
    syncBtn.disabled = true;
    log('Starting GitHub handshake for deploy push...', 'info');
    const result = await window.desktop.gitSync('Update resources/ads/club/packages via Edgeducate Admin');
    syncBtn.disabled = false;
    if (result.ok) {
      recordSyncTime('push', lastPushTime);
      log('GitHub handshake successful. Push completed.', 'ok');
      log(`Synced to GitHub via desktop app.\n${result.log}`, 'ok');
      flash('Deployed to GitHub. Cloudflare will deploy shortly.', 'success');
    } else {
      log(`DESKTOP SYNC FAILED:\n${result.log}`, 'bad');
      flash('Saved locally, but GitHub push failed — see the log.', 'error');
    }
  }

  syncBtn.hidden = false;
  pullBtn.hidden = false;

  pullBtn.addEventListener('click', async () => {
    pullBtn.disabled = true;
    log('Starting GitHub handshake for data pull...', 'info');
    const result = await window.desktop.gitPull();
    pullBtn.disabled = false;
    if (result.ok) {
      recordSyncTime('pull', lastPullTime);
      log('GitHub handshake successful. Pull completed.', 'ok');
      log(`Pulled latest from GitHub.\n${result.output}`, 'ok');
      await logConsistencyReport('pull-post-sync', { inMemoryMayBeStale: true });
      flash('Pulled latest — reload the page to see it.', 'success');
    } else {
      log(`DESKTOP PULL FAILED:\n${result.output || result.error}`, 'bad');
      flash('Pull failed — see the log.', 'error');
    }
  });

  syncBtn.addEventListener('click', syncToGithub);

  window.syncToGithubAfterSave = syncToGithub;
}
