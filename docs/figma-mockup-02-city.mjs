// Aira AI — Mockups 02-06 build script
// File: figma-mockups-build.mjs
// Usage in Figma Plugin API console (Plugins → Development → Open Console):
//   1. Open https://www.figma.com/design/BXxltpewsgKQSudkzgubNy
//   2. Menu → Plugins → Development → "Run plugin code..." (or open the JS console via Quick Actions)
//   3. Paste the whole file, run
// Each call returns the new frame's node id; screenshot it via mcp__figma__get_screenshot.

const FILE_KEY = 'BXxltpewsgKQSudkzgubNy';

// ============================================================
// DESIGN SYSTEM (re-declared per script for self-containment)
// ============================================================

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
  'Border/Default':     { r: 226/255, g: 232/255, b: 240/255 }
};

function fill(key) {
  const c = colorStyles[key];
  if (!c) return [];
  return [{ type: 'SOLID', color: c }];
}

function setSize(node, w, h) {
  node.resize(w, h);
  node.layoutSizingHorizontal = 'FIXED';
  node.layoutSizingVertical = 'FIXED';
}

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
  f.layoutMode = 'HORIZONTAL';
  f.fills = [];
  if (opts.gap !== undefined) f.itemSpacing = opts.gap;
  if (opts.pad) {
    f.paddingTop = opts.pad[0]; f.paddingRight = opts.pad[1];
    f.paddingBottom = opts.pad[2]; f.paddingLeft = opts.pad[3];
  }
  if (opts.align) f.counterAxisAlignItems = opts.align;
  if (opts.justify) f.primaryAxisAlignItems = opts.justify;
  if (opts.fill) f.fills = fill(opts.fill);
  if (opts.stroke) {
    f.strokes = fill(opts.stroke);
    f.strokeWeight = opts.strokeWeight || 1;
  }
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.name) f.name = opts.name;
  return f;
}

function vbox(parent, opts) {
  const f = figma.createFrame();
  parent.appendChild(f);
  f.layoutMode = 'VERTICAL';
  f.fills = [];
  if (opts.gap !== undefined) f.itemSpacing = opts.gap;
  if (opts.pad) {
    f.paddingTop = opts.pad[0]; f.paddingRight = opts.pad[1];
    f.paddingBottom = opts.pad[2]; f.paddingLeft = opts.pad[3];
  }
  if (opts.align) f.counterAxisAlignItems = opts.align;
  if (opts.justify) f.primaryAxisAlignItems = opts.justify;
  if (opts.fill) f.fills = fill(opts.fill);
  if (opts.stroke) {
    f.strokes = fill(opts.stroke);
    f.strokeWeight = opts.strokeWeight || 1;
  }
  if (opts.radius) f.cornerRadius = opts.radius;
  if (opts.name) f.name = opts.name;
  return f;
}

function makeRoot(name, x, y) {
  const root = figma.createFrame();
  figma.currentPage.appendChild(root);
  root.name = name;
  root.x = x; root.y = y;
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
  const nav = hbox(parent, {
    name: 'Nav', gap: 0,
    pad: [20, 48, 20, 48],
    justify: 'SPACE_BETWEEN', align: 'CENTER',
    fill: 'Surface/Card', stroke: 'Border/Default'
  });
  nav.strokeBottomWeight = 1; nav.strokeTopWeight = 0;
  nav.strokeLeftWeight = 0; nav.strokeRightWeight = 0;
  nav.layoutSizingHorizontal = 'FILL';
  nav.layoutSizingVertical = 'HUG';
  txt(nav, 'Aira AI', 'Inter', 'Bold', 22, 'Brand/Primary');
  const links = hbox(nav, { name: 'Links', gap: 32, align: 'CENTER' });
  for (const name of ['Home', 'Map', 'Advisory', 'Methodology']) {
    txt(links, name, 'Inter', 'Medium', 15, 'Text/Secondary');
  }
  return nav;
}

// Place a new frame to the right of the previous one in the page
function positionRightOf(prev, newFrame, gap = 120) {
  newFrame.x = prev.x + prev.width + gap;
  newFrame.y = prev.y;
}

const HOME = figma.currentPage.findOne(n => n.name && n.name.startsWith('01 — HOME'));

// ============================================================
// 02 — CITY (/city/mumbai)
// ============================================================
const city = makeRoot('02 — CITY (/city/mumbai)', 0, 0);
positionRightOf(HOME, city);
makeNav(city);

// Breadcrumb
const crumb = hbox(city, { name: 'Crumb', gap: 8, pad: [24, 48, 0, 48], align: 'CENTER' });
crumb.layoutSizingHorizontal = 'FILL';
crumb.layoutSizingVertical = 'HUG';
txt(crumb, 'Home', 'Inter', 'Medium', 13, 'Text/Muted');
txt(crumb, '/', 'Inter', 'Regular', 13, 'Text/Muted');
txt(crumb, 'Mumbai', 'Inter', 'Medium', 13, 'Text/Secondary');

// Header
const head = vbox(city, { name: 'Header', gap: 8, pad: [16, 48, 32, 48] });
head.layoutSizingHorizontal = 'FILL';
head.layoutSizingVertical = 'HUG';
txt(head, 'Mumbai', 'Inter', 'Bold', 40, 'Text/Primary');
txt(head, 'Live AQI from 12 monitoring stations. Last updated 14 min ago.',
  'Inter', 'Regular', 15, 'Text/Secondary',
  { lineHeight: { unit: 'PERCENT', value: 150 } });

// AQI big card
const aqiWrap = vbox(city, { name: 'AQI Wrap', gap: 0, pad: [0, 48, 0, 48] });
aqiWrap.layoutSizingHorizontal = 'FILL';
aqiWrap.layoutSizingVertical = 'HUG';
const aqiCard = hbox(aqiWrap, {
  name: 'AQI Card', gap: 48,
  pad: [40, 40, 40, 40],
  fill: 'Surface/Card', stroke: 'Border/Default', radius: 20
});
aqiCard.effects = [{
  type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.04 },
  offset: { x: 0, y: 4 }, radius: 16, spread: 0,
  visible: true, blendMode: 'NORMAL'
}];
aqiCard.layoutSizingHorizontal = 'FILL';
aqiCard.layoutSizingVertical = 'HUG';
const leftCol = vbox(aqiCard, { name: 'Number', gap: 8 });
setSize(leftCol, 420, 200);
txt(leftCol, 'Bandra Station', 'Inter', 'Medium', 14, 'Text/Secondary');
txt(leftCol, '168', 'Inter', 'Bold', 120, 'AQI/Poor',
  { lineHeight: { unit: 'PERCENT', value: 100 } });
txt(leftCol, 'POOR - Breathing discomfort for sensitive groups',
  'Inter', 'Semi Bold', 14, 'Text/Secondary');
const forecastCta = hbox(leftCol, { name: 'CTA', gap: 8, pad: [12, 20, 12, 20], radius: 8, fill: 'Brand/Primary' });
setSize(forecastCta, 280, 44);
txt(forecastCta, 'View 7-day forecast  ->', 'Inter', 'Semi Bold', 14, 'Surface/Card');

const rightCol = vbox(aqiCard, { name: 'Pollutants', gap: 0 });
rightCol.layoutSizingHorizontal = 'FILL';
rightCol.layoutSizingVertical = 'HUG';
const pollutants = [
  { name: 'PM2.5', value: '92',  unit: 'ug/m3', color: 'AQI/Poor' },
  { name: 'PM10',  value: '154', unit: 'ug/m3', color: 'AQI/Moderate' },
  { name: 'NO2',   value: '38',  unit: 'ug/m3', color: 'AQI/Satisfactory' },
  { name: 'SO2',   value: '11',  unit: 'ug/m3', color: 'AQI/Good' },
  { name: 'CO',    value: '0.8', unit: 'mg/m3', color: 'AQI/Good' },
  { name: 'O3',    value: '47',  unit: 'ug/m3', color: 'AQI/Satisfactory' }
];
for (const p of pollutants) {
  const row = hbox(rightCol, { gap: 0, justify: 'SPACE_BETWEEN', align: 'CENTER',
    pad: [12, 0, 12, 0], stroke: 'Border/Default' });
  row.strokeTopWeight = 1; row.strokeBottomWeight = 0;
  row.strokeLeftWeight = 0; row.strokeRightWeight = 0;
  row.layoutSizingHorizontal = 'FILL';
  row.layoutSizingVertical = 'HUG';
  txt(row, p.name, 'Inter', 'Medium', 16, 'Text/Primary');
  txt(row, `${p.value} ${p.unit}`, 'Inter', 'Semi Bold', 16, p.color);
}

// Health advisory strip
const advWrap = vbox(city, { name: 'Advisory Wrap', gap: 0, pad: [24, 48, 64, 48] });
advWrap.layoutSizingHorizontal = 'FILL';
advWrap.layoutSizingVertical = 'HUG';
const advCard = hbox(advWrap, { name: 'Advisory', gap: 20, pad: [20, 24, 20, 24], radius: 12,
  fill: { r: 255/255, g: 244/255, b: 220/255 } }); // soft warning tint
advCard.layoutSizingHorizontal = 'FILL';
advCard.layoutSizingVertical = 'HUG';
const advIcon = vbox(advCard, { name: 'Icon', pad: [0, 0, 0, 0] });
setSize(advIcon, 32, 32);
const advIconText = figma.createText();
advIcon.appendChild(advIconText);
advIconText.characters = '!';
advIconText.fontName = { family: 'Inter', style: 'Bold' };
advIconText.fontSize = 20;
advIconText.fills = fill('AQI/Poor');
const advBody = vbox(advCard, { name: 'Body', gap: 4 });
advBody.layoutSizingHorizontal = 'FILL';
advBody.layoutSizingVertical = 'HUG';
txt(advBody, 'Health advisory for Healthy adults', 'Inter', 'Semi Bold', 14, 'Text/Primary');
const advText = figma.createText();
advBody.appendChild(advText);
advText.characters = 'Limit prolonged outdoor exertion. PM2.5 levels are elevated. Consider an N95 mask if you exercise outdoors.';
advText.fontName = { family: 'Inter', style: 'Regular' };
advText.fontSize = 14;
advText.lineHeight = { unit: 'PERCENT', value: 150 };
advText.fills = fill('Text/Secondary');
advText.textAutoResize = 'HEIGHT';
advText.layoutSizingHorizontal = 'FILL';

return { cityFrame: city.id };
