// 03 — FORECAST (/city/mumbai/forecast)
// Figma Plugin API console script. Run after HOME and CITY are placed.

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
  'Text/Primary':       { r: 17/255, g: 24/255, b: 39/255 },
  'Text/Secondary':     { r: 75/255, g: 85/255, b: 99/255 },
  'Text/Muted':         { r: 148/255, g: 163/255, b: 184/255 },
  'Border/Default':     { r: 226/255, g: 232/255, b: 240/255 },
  'Confidence/Tint':    { r: 0/255,  g: 168/255, b: 150/255, a: 0.18 }
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

const CITY = figma.currentPage.findOne(n => n.name && n.name.startsWith('02 — CITY'));
const root = makeRoot('03 — FORECAST (/city/mumbai/forecast)', CITY.x + CITY.width + 120, CITY.y);
makeNav(root);

// Breadcrumb
const crumb = hbox(root, { name: 'Crumb', gap: 8, pad: [24, 48, 0, 48], align: 'CENTER' });
crumb.layoutSizingHorizontal = 'FILL'; crumb.layoutSizingVertical = 'HUG';
txt(crumb, 'Home', 'Inter', 'Medium', 13, 'Text/Muted');
txt(crumb, '/', 'Inter', 'Regular', 13, 'Text/Muted');
txt(crumb, 'Mumbai', 'Inter', 'Medium', 13, 'Text/Muted');
txt(crumb, '/', 'Inter', 'Regular', 13, 'Text/Muted');
txt(crumb, 'Forecast', 'Inter', 'Medium', 13, 'Text/Secondary');

// Header
const head = vbox(root, { name: 'Header', gap: 8, pad: [16, 48, 24, 48] });
head.layoutSizingHorizontal = 'FILL'; head.layoutSizingVertical = 'HUG';
txt(head, '7-day AQI forecast for Mumbai', 'Inter', 'Bold', 32, 'Text/Primary');
txt(head, 'Predicted from the last 30 days using linear regression. Confidence band shows 1 standard error.',
  'Inter', 'Regular', 14, 'Text/Secondary', { lineHeight: { unit: 'PERCENT', value: 150 } });

// Chart card (manually rendered as a stylized chart since Plugin API doesn't have a chart primitive)
const chartWrap = vbox(root, { name: 'Chart Wrap', gap: 0, pad: [0, 48, 0, 48] });
chartWrap.layoutSizingHorizontal = 'FILL'; chartWrap.layoutSizingVertical = 'HUG';
const chart = vbox(chartWrap, { name: 'Chart', gap: 16, pad: [32, 32, 32, 32], fill: 'Surface/Card', stroke: 'Border/Default', radius: 20 });
chart.layoutSizingHorizontal = 'FILL'; chart.layoutSizingVertical = 'HUG';
chart.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.04 }, offset: { x: 0, y: 4 }, radius: 16, spread: 0, visible: true, blendMode: 'NORMAL' }];

// Chart title row
const chartTitle = hbox(chart, { name: 'Chart Title', justify: 'SPACE_BETWEEN', align: 'CENTER' });
chartTitle.layoutSizingHorizontal = 'FILL'; chartTitle.layoutSizingVertical = 'HUG';
const chartLabels = hbox(chartTitle, { gap: 16, align: 'CENTER' });
const dot1 = figma.createFrame(); chartLabels.appendChild(dot1);
setSize(dot1, 10, 10); dot1.cornerRadius = 5; dot1.fills = fill('Brand/Accent');
txt(chartLabels, 'Predicted AQI', 'Inter', 'Medium', 13, 'Text/Secondary');
const dot2 = figma.createFrame(); chartLabels.appendChild(dot2);
setSize(dot2, 10, 10); dot2.cornerRadius = 5; dot2.fills = fill('Confidence/Tint');
txt(chartLabels, 'Confidence band', 'Inter', 'Medium', 13, 'Text/Secondary');
const chartR2 = hbox(chartTitle, { gap: 8, align: 'CENTER' });
txt(chartR2, 'Model fit (R-squared):', 'Inter', 'Medium', 13, 'Text/Secondary');
txt(chartR2, '0.62', 'Inter', 'Semi Bold', 13, 'Text/Primary');

// Plot area: 30 historical + 7 forecast
const plot = vbox(chart, { name: 'Plot', gap: 0 });
plot.layoutSizingHorizontal = 'FILL'; plot.layoutSizingVertical = 'HUG';

// Day labels row
const dayRow = hbox(plot, { name: 'Days', gap: 0, pad: [0, 0, 8, 0] });
dayRow.layoutSizingHorizontal = 'FILL'; dayRow.layoutSizingVertical = 'HUG';
const days = ['Dec 23', 'Dec 26', 'Dec 29', 'Jan 1', 'Jan 4', 'Jan 7', 'Jan 10', 'Jan 13', 'Jan 15'];
for (let i = 0; i < days.length; i++) {
  const cell = vbox(dayRow, { gap: 0, align: 'CENTER' });
  cell.layoutSizingHorizontal = 'FILL'; cell.layoutSizingVertical = 'HUG';
  txt(cell, days[i], 'Inter', 'Medium', 11, 'Text/Muted');
}

// Chart body: stacked rows representing AQI levels (Good/Sat/Mod/Poor/VeryPoor) with markers
const plotBox = vbox(plot, { name: 'Plot Box', gap: 0, fill: 'Surface/Page', radius: 12 });
plotBox.layoutSizingHorizontal = 'FILL'; plotBox.layoutSizingVertical = 'HUG';
plotBox.resize(1, 320);

// AQI bucket bands (background)
const bands = [
  { label: 'Good',          color: { r: 0/255, g: 153/255, b: 102/255, a: 0.08 } },
  { label: 'Satisfactory',  color: { r: 30/255, g: 161/255, b: 117/255, a: 0.08 } },
  { label: 'Moderate',      color: { r: 255/255, g: 196/255, b: 0/255, a: 0.10 } },
  { label: 'Poor',          color: { r: 255/255, g: 140/255, b: 0/255, a: 0.10 } },
  { label: 'Very Poor',     color: { r: 220/255, g: 53/255, b: 69/255, a: 0.10 } }
];
for (const b of bands) {
  const band = hbox(plotBox, { name: b.label, pad: [0, 0, 0, 0], fill: { r: b.color.r, g: b.color.g, b: b.color.b }, align: 'CENTER' });
  band.layoutSizingHorizontal = 'FILL'; band.resize(1, 64);
  band.layoutSizingVertical = 'FIXED';
  const t = figma.createText();
  band.appendChild(t);
  t.characters = b.label;
  t.fontName = { family: 'Inter', style: 'Medium' };
  t.fontSize = 10;
  t.fills = fill('Text/Muted');
  // push to far right
  const spacer = figma.createFrame();
  band.insertChild(0, spacer);
  spacer.fills = []; spacer.resize(8, 1); spacer.layoutSizingVertical = 'FIXED';
  // Use SPACE_BETWEEN via primary axis
  band.primaryAxisAlignItems = 'SPACE_BETWEEN';
}

// Data line (simulated as a row of dots across the plot)
const lineRow = hbox(plotBox, { name: 'Line', pad: [12, 24, 12, 24], justify: 'SPACE_BETWEEN', align: 'CENTER' });
lineRow.layoutSizingHorizontal = 'FILL'; lineRow.layoutSizingVertical = 'HUG';
const points = [
  { x: 120, past: true }, { x: 135, past: true }, { x: 155, past: true }, { x: 142, past: true }, { x: 128, past: true },
  { x: 150, past: true }, { x: 168, past: true }, { x: 175, past: true }, { x: 160, past: true }, { x: 145, past: true },
  { x: 168, past: true }, { x: 175, past: true }, { x: 170, past: true }, { x: 160, past: true }, { x: 155, past: true },
  { x: 165, past: true }, { x: 178, past: true }, { x: 170, past: true }, { x: 160, past: true }, { x: 150, past: true },
  { x: 155, past: true }, { x: 165, past: true }, { x: 175, past: true }, { x: 170, past: true }, { x: 162, past: true },
  { x: 155, past: true }, { x: 148, past: true }, { x: 152, past: true }, { x: 158, past: true }, { x: 165, past: true },
  { x: 162, future: true }, { x: 170, future: true }, { x: 168, future: true }, { x: 160, future: true }, { x: 155, future: true },
  { x: 148, future: true }, { x: 152, future: true }
];
for (const pt of points) {
  const dot = figma.createFrame();
  lineRow.appendChild(dot);
  setSize(dot, 8, 8);
  dot.cornerRadius = 4;
  if (pt.future) {
    dot.fills = fill('Brand/Accent');
    dot.strokes = fill('Brand/Accent');
    dot.strokeWeight = 1;
  } else {
    dot.fills = fill('AQI/Moderate');
  }
}

// Forecast callout
const calloutWrap = vbox(root, { name: 'Callout Wrap', gap: 0, pad: [24, 48, 0, 48] });
calloutWrap.layoutSizingHorizontal = 'FILL'; calloutWrap.layoutSizingVertical = 'HUG';
const callout = vbox(calloutWrap, { name: 'Callout', gap: 8, pad: [24, 28, 24, 28], fill: 'Brand/AccentTint', radius: 12 });
callout.layoutSizingHorizontal = 'FILL'; callout.layoutSizingVertical = 'HUG';
txt(callout, 'PLAIN ENGLISH', 'Inter', 'Semi Bold', 11, 'Brand/Accent',
  { letterSpacing: { unit: 'PERCENT', value: 8 } });
const calloutBody = figma.createText();
callout.appendChild(calloutBody);
calloutBody.characters = 'Mumbai air will stay in the Poor range for the next 4 days, peaking at 178 on Saturday. Brief improvement expected Monday before climbing again Tuesday. Plan outdoor activities for early mornings when PM2.5 is typically lower.';
calloutBody.fontName = { family: 'Inter', style: 'Regular' };
calloutBody.fontSize = 15;
calloutBody.lineHeight = { unit: 'PERCENT', value: 160 };
calloutBody.fills = fill('Text/Primary');
calloutBody.textAutoResize = 'HEIGHT';
calloutBody.layoutSizingHorizontal = 'FILL';

// 7-day day cards
const cardsWrap = vbox(root, { name: 'Day Cards Wrap', gap: 16, pad: [24, 48, 64, 48] });
cardsWrap.layoutSizingHorizontal = 'FILL'; cardsWrap.layoutSizingVertical = 'HUG';
txt(cardsWrap, 'Day-by-day', 'Inter', 'Semi Bold', 20, 'Text/Primary');
const daysRow = hbox(cardsWrap, { name: 'Days', gap: 12 });
daysRow.layoutSizingHorizontal = 'FILL'; daysRow.layoutSizingVertical = 'HUG';
const dayCards = [
  { day: 'Today',  date: 'Jan 15', aqi: 165, color: 'AQI/Poor' },
  { day: 'Thu',    date: 'Jan 16', aqi: 170, color: 'AQI/Poor' },
  { day: 'Fri',    date: 'Jan 17', aqi: 175, color: 'AQI/Poor' },
  { day: 'Sat',    date: 'Jan 18', aqi: 178, color: 'AQI/VeryPoor' },
  { day: 'Sun',    date: 'Jan 19', aqi: 172, color: 'AQI/Poor' },
  { day: 'Mon',    date: 'Jan 20', aqi: 148, color: 'AQI/Moderate' },
  { day: 'Tue',    date: 'Jan 21', aqi: 160, color: 'AQI/Poor' }
];
for (const d of dayCards) {
  const card = vbox(daysRow, { name: d.day, gap: 4, pad: [16, 12, 16, 12], fill: 'Surface/Card', stroke: 'Border/Default', radius: 12, align: 'CENTER' });
  card.layoutSizingHorizontal = 'FILL'; card.layoutSizingVertical = 'HUG';
  txt(card, d.day, 'Inter', 'Semi Bold', 12, 'Text/Secondary');
  txt(card, d.date, 'Inter', 'Regular', 11, 'Text/Muted');
  txt(card, String(d.aqi), 'Inter', 'Bold', 28, d.color);
  txt(card, 'AQI', 'Inter', 'Medium', 10, 'Text/Muted',
    { letterSpacing: { unit: 'PERCENT', value: 8 } });
}

return { forecastFrame: root.id };
