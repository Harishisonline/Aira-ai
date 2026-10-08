// 06 — METHODOLOGY (/methodology)
// Figma Plugin API console script.

const colorStyles = {
  'AQI/Good':           { r: 0/255,  g: 153/255, b: 102/255 },
  'AQI/Satisfactory':   { r: 30/255, g: 161/255, b: 117/255 },
  'AQI/Moderate':       { r: 255/255, g: 196/255, b: 0/255 },
  'AQI/Poor':           { r: 255/255, g: 140/255, b: 0/255 },
  'AQI/VeryPoor':       { r: 220/255, g: 53/255, b: 69/255 },
  'AQI/Severe':         { r: 122/255, g: 12/255, b: 40/255 },
  'Brand/Primary':      { r: 15/255, g: 76/255, b: 117/255 },
  'Brand/Accent':       { r: 0/255,  g: 168/255, b: 150/255 },
  'Brand/AccentTint':   { r: 0/255,  g: 168/255, b: 150/255, a: 0.12 },
  'Surface/Page':       { r: 248/255, g: 250/255, b: 252/255 },
  'Surface/Card':       { r: 255/255, g: 255/255, b: 255/255 },
  'Code/Background':    { r: 241/255, g: 245/255, b: 249/255 },
  'Text/Primary':       { r: 17/255, g: 24/255, b: 39/255 },
  'Text/Secondary':     { r: 75/255, g: 85/255, b: 99/255 },
  'Text/Muted':         { r: 148/255, g: 163/255, b: 184/255 },
  'Border/Default':     { r: 226/255, g: 232/255, b: 240/255 }
};

function fill(key) {
  const c = colorStyles[key];
  if (!c) return [];
  if (c.a !== undefined) return [{ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }];
  return [{ type: 'SOLID', color: c }];
}
function setSize(node, w, h) { node.resize(w, h); node.layoutSizingHorizontal = 'FIXED'; node.layoutSizingVertical = 'FIXED'; }
function txt(parent, characters, family, style, size, colorKey, opts) {
  const t = figma.createText();
  parent.appendChild(t);
  t.characters = characters;
  t.fontName = { family, style };
  t.fontSize = size;
  if (colorKey) t.fills = fill(colorKey);
  if (opts) {
    if (opts.lineHeight) t.lineHeight = opts.lineHeight;
    if (opts.letterSpacing) t.letterSpacing = opts.letterSpacing;
    if (opts.textAutoResize) t.textAutoResize = opts.textAutoResize;
  }
  return t;
}
function hbox(parent, opts) {
  const f = figma.createFrame();
  parent.appendChild(f);
  f.layoutMode = 'HORIZONTAL'; f.fills = [];
  if (opts.gap !== undefined) f.itemSpacing = opts.gap;
  if (opts.pad) { f.paddingTop = opts.pad[0]; f.paddingRight = opts.pad[1]; f.paddingBottom = opts.pad[2]; f.paddingLeft = opts.pad[3]; }
  if (opts.align) f.counterAxisAlignItems = opts.align;
  if (opts.justify) f.primaryAxisAlignItems = opts.justify;
  if (opts.fill) f.fills = fill(opts.fill);
  if (opts.stroke) { f.strokes = fill(opts.stroke); f.strokeWeight = opts.strokeWeight || 1; }
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.name) f.name = opts.name;
  return f;
}
function vbox(parent, opts) {
  const f = figma.createFrame();
  parent.appendChild(f);
  f.layoutMode = 'VERTICAL'; f.fills = [];
  if (opts.gap !== undefined) f.itemSpacing = opts.gap;
  if (opts.pad) { f.paddingTop = opts.pad[0]; f.paddingRight = opts.pad[1]; f.paddingBottom = opts.pad[2]; f.paddingLeft = opts.pad[3]; }
  if (opts.align) f.counterAxisAlignItems = opts.align;
  if (opts.justify) f.primaryAxisAlignItems = opts.justify;
  if (opts.fill) f.fills = fill(opts.fill);
  if (opts.stroke) { f.strokes = fill(opts.stroke); f.strokeWeight = opts.strokeWeight || 1; }
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.name) f.name = opts.name;
  return f;
}
function makeRoot(name, x, y) {
  const root = figma.createFrame();
  figma.currentPage.appendChild(root);
  root.name = name; root.x = x; root.y = y;
  root.resize(1440, 100);
  root.layoutMode = 'VERTICAL';
  root.primaryAxisSizingMode = 'AUTO';
  root.counterAxisSizingMode = 'FIXED';
  root.itemSpacing = 0;
  root.fills = fill('Surface/Page');
  root.clipsContent = false;
  return root;
}
function makeNav(parent) {
  const nav = hbox(parent, { name: 'Nav', pad: [20, 48, 20, 48], justify: 'SPACE_BETWEEN', align: 'CENTER', fill: 'Surface/Card', stroke: 'Border/Default' });
  nav.strokeBottomWeight = 1; nav.strokeTopWeight = 0; nav.strokeLeftWeight = 0; nav.strokeRightWeight = 0;
  nav.layoutSizingHorizontal = 'FILL'; nav.layoutSizingVertical = 'HUG';
  txt(nav, 'Aira AI', 'Inter', 'Bold', 22, 'Brand/Primary');
  const links = hbox(nav, { name: 'Links', gap: 32, align: 'CENTER' });
  for (const name of ['Home', 'Map', 'Advisory', 'Methodology']) txt(links, name, 'Inter', 'Medium', 15, 'Text/Secondary');
  return nav;
}

const ADV = figma.currentPage.findOne(n => n.name && n.name.startsWith('05 — ADVISORY'));
const root = makeRoot('06 — METHODOLOGY (/methodology)', ADV.x + ADV.width + 120, ADV.y);
makeNav(root);

// Article container — narrower for readability
const articleWrap = vbox(root, { name: 'Article Wrap', gap: 0, pad: [48, 240, 64, 240] });
articleWrap.layoutSizingHorizontal = 'FILL'; articleWrap.layoutSizingVertical = 'HUG';

// Header
const head = vbox(articleWrap, { name: 'Header', gap: 12 });
head.layoutSizingHorizontal = 'FILL'; head.layoutSizingVertical = 'HUG';
txt(head, 'METHODOLOGY', 'Inter', 'Semi Bold', 12, 'Brand/Accent',
  { letterSpacing: { unit: 'PERCENT', value: 8 } });
txt(head, 'How Aira AI computes AQI and forecasts it', 'Inter', 'Bold', 40, 'Text/Primary',
  { lineHeight: { unit: 'PERCENT', value: 110 } });
const sub = figma.createText();
head.appendChild(sub);
sub.characters = 'A transparent breakdown of the data sources, math, and assumptions. v1 model. Last reviewed 14 Jan 2026.';
sub.fontName = { family: 'Inter', style: 'Regular' };
sub.fontSize = 16;
sub.lineHeight = { unit: 'PERCENT', value: 160 };
sub.fills = fill('Text/Secondary');
sub.textAutoResize = 'HEIGHT';
sub.layoutSizingHorizontal = 'FILL';

// Section helper
function section(parent, eyebrowTxt, title, body) {
  const sec = vbox(parent, { gap: 12 });
  sec.layoutSizingHorizontal = 'FILL'; sec.layoutSizingVertical = 'HUG';
  txt(sec, eyebrowTxt, 'Inter', 'Semi Bold', 11, 'Brand/Accent',
    { letterSpacing: { unit: 'PERCENT', value: 8 } });
  txt(sec, title, 'Inter', 'Bold', 24, 'Text/Primary');
  const b = figma.createText();
  sec.appendChild(b);
  b.characters = body;
  b.fontName = { family: 'Inter', style: 'Regular' };
  b.fontSize = 16;
  b.lineHeight = { unit: 'PERCENT', value: 170 };
  b.fills = fill('Text/Secondary');
  b.textAutoResize = 'HEIGHT';
  b.layoutSizingHorizontal = 'FILL';
  // Spacer below
  const sp = figma.createFrame();
  parent.appendChild(sp);
  sp.fills = []; sp.resize(1, 32); sp.layoutSizingVertical = 'FIXED'; sp.layoutSizingHorizontal = 'FILL';
  return sec;
}

section(articleWrap, 'SECTION 1', 'Data source: Central Pollution Control Board',
  'Every reading on Aira AI comes from the CPCB Continuous Ambient Air Quality Monitoring System (CAAQMS). The network has 28 active stations across Maharashtra as of January 2026. We pull hourly readings via the official CCR API. The data is owned by CPCB and the Government of India; Aira AI does not modify, average, or re-publish raw measurements.');

section(articleWrap, 'SECTION 2', 'AQI: the Indian National AQI formula',
  'We use the official NAQI computation, not the US EPA formula. The NAQI assigns sub-indices to PM2.5, PM10, NO2, SO2, CO, and O3, each with pollutant-specific breakpoints. The reported AQI is the maximum of all available sub-indices for the station at that time. Bucket boundaries: Good (0-50), Satisfactory (51-100), Moderate (101-200), Poor (201-300), Very Poor (301-400), Severe (401-500).');

section(articleWrap, 'SECTION 3', 'Forecast: linear regression on 30-day history',
  'For each station, we fit a simple linear regression of daily mean AQI against day index over the trailing 30 days. The model has two parameters: a slope and an intercept. The prediction for day d is y(d) = a + b*d. The 7-day forecast is the value of y(d) at d = today+1 through d = today+7. The confidence band is +/- one standard error of the regression residuals, scaled per day.');

// Code block (visualised)
const codeWrap = vbox(articleWrap, { gap: 12 });
codeWrap.layoutSizingHorizontal = 'FILL'; codeWrap.layoutSizingVertical = 'HUG';
txt(codeWrap, 'PSEUDOCODE', 'Inter', 'Semi Bold', 11, 'Brand/Accent',
  { letterSpacing: { unit: 'PERCENT', value: 8 } });
const codeBlock = vbox(codeWrap, { name: 'Code', gap: 4, pad: [20, 24, 20, 24], fill: 'Code/Background', radius: 12 });
codeBlock.layoutSizingHorizontal = 'FILL'; codeBlock.layoutSizingVertical = 'HUG';
const codeLines = [
  '# for each station s:',
  'history = last_30_days_of_daily_mean_aqi(s)',
  'X = [0, 1, 2, ..., 29]',
  'y = history',
  'a, b = linear_regression(X, y)            # slope and intercept',
  'for d in range(1, 8):',
  '    predicted[d] = a + b * (29 + d)',
  '    stderr = residual_std_error(X, y, a, b)',
  '    ci[d] = (predicted[d] - stderr, predicted[d] + stderr)'
];
for (const line of codeLines) {
  const t = figma.createText();
  codeBlock.appendChild(t);
  t.characters = line;
  t.fontName = { family: 'Courier New', style: 'Regular' };
  t.fontSize = 13;
  t.fills = fill('Text/Primary');
}

section(articleWrap, 'SECTION 4', 'Why linear regression',
  'We picked OLS linear regression for v1 because it is interpretable, fast to compute, and matches the regression unit in our second-year Mathematics for Computer Engineering course. The R-squared value displayed on the forecast page is honest about model fit - if it is low, the prediction is unreliable. We will move to ARIMA or an LSTM only if real data shows linear regression is consistently wrong on the test set.');

section(articleWrap, 'SECTION 5', 'AI-generated advisories',
  'The Plain-English summary on the forecast page and the personalised advisories are generated by a large language model hosted on Groq. The model receives the current AQI, the 7-day forecast, and the user-selected profile (healthy adult, child, elderly, asthmatic). It produces a 2-4 sentence advisory grounded in WHO and Indian Medical Association guidelines. The model is not a medical authority - advisories are a starting point, not a substitute for professional care.');

section(articleWrap, 'SECTION 6', 'Limitations',
  'We do not currently: (1) account for indoor air quality, (2) forecast pollutant-specific health risk, (3) model micro-local effects (one street vs. another), (4) handle station outages gracefully, (5) cover cities without a CPCB station within ~10 km. v2 will add better station-outage handling and a confidence breakdown per day.');

// Sources card
const sources = vbox(articleWrap, { name: 'Sources', gap: 12, pad: [24, 28, 24, 28], fill: 'Surface/Card', stroke: 'Border/Default', radius: 16 });
sources.layoutSizingHorizontal = 'FILL'; sources.layoutSizingVertical = 'HUG';
txt(sources, 'REFERENCES', 'Inter', 'Semi Bold', 11, 'Brand/Accent',
  { letterSpacing: { unit: 'PERCENT', value: 8 } });
const refs = [
  'CPCB National AQI Computation Method (2014)',
  'WHO Global Air Quality Guidelines (2021)',
  'CPCB Continuous Ambient Air Quality Monitoring data (open API)',
  'Indian Medical Association - Air Pollution and Public Health (2023)'
];
for (const r of refs) {
  const t = figma.createText();
  sources.appendChild(t);
  t.characters = '- ' + r;
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = 14;
  t.fills = fill('Text/Secondary');
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FILL';
}

return { methodologyFrame: root.id };
