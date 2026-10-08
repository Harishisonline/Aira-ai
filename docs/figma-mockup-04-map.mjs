// 04 — MAP (/map)
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
  'Surface/Page':       { r: 248/255, g: 250/255, b: 252/255 },
  'Surface/Card':       { r: 255/255, g: 255/255, b: 255/255 },
  'Text/Primary':       { r: 17/255, g: 24/255, b: 39/255 },
  'Text/Secondary':     { r: 75/255, g: 85/255, b: 99/255 },
  'Text/Muted':         { r: 148/255, g: 163/255, b: 184/255 },
  'Border/Default':     { r: 226/255, g: 232/255, b: 240/255 },
  'Map/Land':           { r: 235/255, g: 240/255, b: 235/255 },
  'Map/Water':          { r: 200/255, g: 220/255, b: 235/255 }
};

function fill(key) {
  const c = colorStyles[key];
  if (!c) return [];
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

const FORECAST = figma.currentPage.findOne(n => n.name && n.name.startsWith('03 — FORECAST'));
const root = makeRoot('04 — MAP (/map)', FORECAST.x + FORECAST.width + 120, FORECAST.y);
makeNav(root);

// Header
const head = vbox(root, { name: 'Header', gap: 8, pad: [32, 48, 24, 48] });
head.layoutSizingHorizontal = 'FILL'; head.layoutSizingVertical = 'HUG';
txt(head, 'Maharashtra AQI map', 'Inter', 'Bold', 32, 'Text/Primary');
txt(head, 'Every active CPCB monitoring station. Marker color matches the AQI bucket.',
  'Inter', 'Regular', 14, 'Text/Secondary', { lineHeight: { unit: 'PERCENT', value: 150 } });

// Map body: split into map area + sidebar
const bodyWrap = hbox(root, { name: 'Body Wrap', gap: 24, pad: [0, 48, 48, 48] });
bodyWrap.layoutSizingHorizontal = 'FILL'; bodyWrap.layoutSizingVertical = 'HUG';

// Map canvas
const map = vbox(bodyWrap, { name: 'Map Canvas', gap: 0, fill: 'Map/Land', radius: 20, stroke: 'Border/Default' });
map.layoutSizingVertical = 'FIXED';
map.resize(900, 700);

// Mock Maharashtra outline (decorative blob)
const blob = figma.createEllipse();
map.appendChild(blob);
blob.resize(700, 600);
blob.x = 100; blob.y = 50;
blob.fills = fill('Map/Land');
blob.strokes = fill('Border/Default');
blob.strokeWeight = 2;
blob.dashPattern = [4, 4];

// Water body (Arabian Sea)
const water = figma.createEllipse();
map.appendChild(water);
water.resize(220, 480);
water.x = 0; water.y = 180;
water.fills = fill('Map/Water');

// City markers (fictional positions across the map for mockup)
const markers = [
  { name: 'Mumbai Bandra',     aqi: 168, color: 'AQI/Poor',         x: 180, y: 380 },
  { name: 'Mumbai Colaba',     aqi: 152, color: 'AQI/Moderate',     x: 220, y: 460 },
  { name: 'Navi Mumbai',       aqi: 145, color: 'AQI/Moderate',     x: 290, y: 400 },
  { name: 'Thane',             aqi: 178, color: 'AQI/VeryPoor',     x: 320, y: 320 },
  { name: 'Pune',              aqi: 132, color: 'AQI/Moderate',     x: 460, y: 280 },
  { name: 'Nashik',            aqi: 88,  color: 'AQI/Satisfactory',  x: 380, y: 130 },
  { name: 'Nagpur',            aqi: 95,  color: 'AQI/Satisfactory',  x: 620, y: 300 },
  { name: 'Aurangabad',        aqi: 112, color: 'AQI/Moderate',     x: 500, y: 380 },
  { name: 'Kolhapur',          aqi: 72,  color: 'AQI/Satisfactory',  x: 380, y: 540 },
  { name: 'Sangli',            aqi: 68,  color: 'AQI/Good',          x: 460, y: 560 },
  { name: 'Solapur',           aqi: 105, color: 'AQI/Moderate',     x: 580, y: 500 },
  { name: 'Amravati',          aqi: 118, color: 'AQI/Moderate',     x: 580, y: 240 },
  { name: 'Akola',             aqi: 142, color: 'AQI/Moderate',     x: 560, y: 320 },
  { name: 'Latur',             aqi: 88,  color: 'AQI/Satisfactory',  x: 660, y: 460 },
  { name: 'Nanded',            aqi: 102, color: 'AQI/Moderate',     x: 700, y: 380 },
  { name: 'Chandrapur',        aqi: 128, color: 'AQI/Moderate',     x: 720, y: 280 },
  { name: 'Ratnagiri',         aqi: 56,  color: 'AQI/Good',          x: 240, y: 560 },
  { name: 'Sindhudurg',        aqi: 48,  color: 'AQI/Good',          x: 200, y: 620 }
];

for (const m of markers) {
  const marker = figma.createFrame();
  map.appendChild(marker);
  marker.layoutMode = 'HORIZONTAL';
  marker.primaryAxisAlignItems = 'CENTER';
  marker.counterAxisAlignItems = 'CENTER';
  marker.cornerRadius = 999;
  marker.fills = fill(m.color);
  marker.strokes = fill('Surface/Card');
  marker.strokeWeight = 2;
  marker.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.2 }, offset: { x: 0, y: 2 }, radius: 6, spread: 0, visible: true, blendMode: 'NORMAL' }];
  setSize(marker, 28, 28);
  marker.x = m.x; marker.y = m.y;
  const num = figma.createText();
  marker.appendChild(num);
  num.characters = String(m.aqi);
  num.fontName = { family: 'Inter', style: 'Bold' };
  num.fontSize = 9;
  num.fills = fill('Surface/Card');
}

// Sidebar
const sidebar = vbox(bodyWrap, { name: 'Sidebar', gap: 16 });
sidebar.layoutSizingHorizontal = 'FILL';
sidebar.layoutSizingVertical = 'HUG';

// Legend
const legend = vbox(sidebar, { name: 'Legend', gap: 12, pad: [20, 20, 20, 20], fill: 'Surface/Card', stroke: 'Border/Default', radius: 16 });
legend.layoutSizingHorizontal = 'FILL'; legend.layoutSizingVertical = 'HUG';
txt(legend, 'AQI legend', 'Inter', 'Semi Bold', 14, 'Text/Primary');
const legendItems = [
  { label: 'Good (0-50)',         color: 'AQI/Good' },
  { label: 'Satisfactory (51-100)', color: 'AQI/Satisfactory' },
  { label: 'Moderate (101-200)',   color: 'AQI/Moderate' },
  { label: 'Poor (201-300)',       color: 'AQI/Poor' },
  { label: 'Very Poor (301-400)',  color: 'AQI/VeryPoor' },
  { label: 'Severe (401+)',        color: 'AQI/Severe' }
];
for (const li of legendItems) {
  const row = hbox(legend, { gap: 10, align: 'CENTER' });
  row.layoutSizingHorizontal = 'FILL'; row.layoutSizingVertical = 'HUG';
  const dot = figma.createFrame();
  row.appendChild(dot);
  setSize(dot, 12, 12); dot.cornerRadius = 6; dot.fills = fill(li.color);
  txt(row, li.label, 'Inter', 'Medium', 13, 'Text/Secondary');
}

// Top 5 worst
const worst = vbox(sidebar, { name: 'Worst', gap: 12, pad: [20, 20, 20, 20], fill: 'Surface/Card', stroke: 'Border/Default', radius: 16 });
worst.layoutSizingHorizontal = 'FILL'; worst.layoutSizingVertical = 'HUG';
txt(worst, 'Top 5 worst right now', 'Inter', 'Semi Bold', 14, 'Text/Primary');
const worstList = [
  { name: 'Thane',         aqi: 178, color: 'AQI/VeryPoor' },
  { name: 'Mumbai Bandra', aqi: 168, color: 'AQI/Poor' },
  { name: 'Mumbai Colaba', aqi: 152, color: 'AQI/Moderate' },
  { name: 'Navi Mumbai',   aqi: 145, color: 'AQI/Moderate' },
  { name: 'Akola',         aqi: 142, color: 'AQI/Moderate' }
];
for (let i = 0; i < worstList.length; i++) {
  const w = worstList[i];
  const row = hbox(worst, { justify: 'SPACE_BETWEEN', align: 'CENTER', pad: [10, 0, 10, 0] });
  row.layoutSizingHorizontal = 'FILL'; row.layoutSizingVertical = 'HUG';
  if (i < worstList.length - 1) {
    row.strokes = fill('Border/Default');
    row.strokeBottomWeight = 1; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
  }
  const left = hbox(row, { gap: 10, align: 'CENTER' });
  txt(left, `${i+1}`, 'Inter', 'Semi Bold', 13, 'Text/Muted');
  txt(left, w.name, 'Inter', 'Medium', 14, 'Text/Primary');
  txt(row, String(w.aqi), 'Inter', 'Bold', 16, w.color);
}

// Top 5 cleanest
const clean = vbox(sidebar, { name: 'Clean', gap: 12, pad: [20, 20, 20, 20], fill: 'Surface/Card', stroke: 'Border/Default', radius: 16 });
clean.layoutSizingHorizontal = 'FILL'; clean.layoutSizingVertical = 'HUG';
txt(clean, 'Top 5 cleanest right now', 'Inter', 'Semi Bold', 14, 'Text/Primary');
const cleanList = [
  { name: 'Sindhudurg', aqi: 48, color: 'AQI/Good' },
  { name: 'Ratnagiri',  aqi: 56, color: 'AQI/Good' },
  { name: 'Sangli',     aqi: 68, color: 'AQI/Good' },
  { name: 'Kolhapur',   aqi: 72, color: 'AQI/Satisfactory' },
  { name: 'Nashik',     aqi: 88, color: 'AQI/Satisfactory' }
];
for (let i = 0; i < cleanList.length; i++) {
  const c = cleanList[i];
  const row = hbox(clean, { justify: 'SPACE_BETWEEN', align: 'CENTER', pad: [10, 0, 10, 0] });
  row.layoutSizingHorizontal = 'FILL'; row.layoutSizingVertical = 'HUG';
  if (i < cleanList.length - 1) {
    row.strokes = fill('Border/Default');
    row.strokeBottomWeight = 1; row.strokeTopWeight = 0; row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
  }
  const left = hbox(row, { gap: 10, align: 'CENTER' });
  txt(left, `${i+1}`, 'Inter', 'Semi Bold', 13, 'Text/Muted');
  txt(left, c.name, 'Inter', 'Medium', 14, 'Text/Primary');
  txt(row, String(c.aqi), 'Inter', 'Bold', 16, c.color);
}

return { mapFrame: root.id };
