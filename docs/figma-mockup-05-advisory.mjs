// 05 — ADVISORY (/advisory)
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

const MAP = figma.currentPage.findOne(n => n.name && n.name.startsWith('04 — MAP'));
const root = makeRoot('05 — ADVISORY (/advisory)', MAP.x + MAP.width + 120, MAP.y);
makeNav(root);

// Header
const head = vbox(root, { name: 'Header', gap: 8, pad: [32, 48, 24, 48] });
head.layoutSizingHorizontal = 'FILL'; head.layoutSizingVertical = 'HUG';
txt(head, 'Personalised health advisory', 'Inter', 'Bold', 32, 'Text/Primary');
txt(head, 'Pick the profile that matches you or the people you care about. The advice updates every hour from current AQI and 7-day forecast.',
  'Inter', 'Regular', 14, 'Text/Secondary', { lineHeight: { unit: 'PERCENT', value: 150 } });

// Profile selector — 4 cards in a row
const profWrap = vbox(root, { name: 'Profile Wrap', gap: 12, pad: [0, 48, 0, 48] });
profWrap.layoutSizingHorizontal = 'FILL'; profWrap.layoutSizingVertical = 'HUG';
txt(profWrap, 'Who is this advisory for?', 'Inter', 'Semi Bold', 16, 'Text/Primary');

const profRow = hbox(profWrap, { name: 'Profiles', gap: 16 });
profRow.layoutSizingHorizontal = 'FILL'; profRow.layoutSizingVertical = 'HUG';

const profiles = [
  { name: 'Healthy adult', icon: 'ADULT',  selected: false },
  { name: 'Child',         icon: 'CHILD',  selected: true },
  { name: 'Elderly',       icon: 'OLDER',  selected: false },
  { name: 'Asthmatic',     icon: 'BREATH', selected: false }
];
for (const p of profiles) {
  const card = vbox(profRow, { name: p.name, gap: 8, pad: [24, 20, 24, 20],
    fill: p.selected ? 'Brand/AccentTint' : 'Surface/Card',
    stroke: p.selected ? 'Brand/Accent' : 'Border/Default', radius: 16, align: 'CENTER' });
  card.strokeWeight = p.selected ? 2 : 1;
  card.layoutSizingHorizontal = 'FILL'; card.layoutSizingVertical = 'HUG';
  const iconBox = figma.createFrame();
  card.appendChild(iconBox);
  iconBox.layoutMode = 'HORIZONTAL';
  iconBox.primaryAxisAlignItems = 'CENTER';
  iconBox.counterAxisAlignItems = 'CENTER';
  iconBox.cornerRadius = 999;
  iconBox.fills = fill(p.selected ? 'Brand/Accent' : 'Surface/Page');
  setSize(iconBox, 48, 48);
  const iconT = figma.createText();
  iconBox.appendChild(iconT);
  iconT.characters = p.icon;
  iconT.fontName = { family: 'Inter', style: 'Bold' };
  iconT.fontSize = 10;
  iconT.letterSpacing = { unit: 'PERCENT', value: 6 };
  iconT.fills = fill(p.selected ? 'Surface/Card' : 'Text/Muted');
  txt(card, p.name, 'Inter', 'Semi Bold', 15, p.selected ? 'Brand/Primary' : 'Text/Primary');
  if (p.selected) {
    const sel = figma.createFrame();
    card.appendChild(sel);
    sel.layoutMode = 'HORIZONTAL';
    sel.primaryAxisAlignItems = 'CENTER';
    sel.counterAxisAlignItems = 'CENTER';
    sel.cornerRadius = 999;
    sel.fills = fill('Brand/Accent');
    setSize(sel, 20, 20);
    const ck = figma.createText();
    sel.appendChild(ck);
    ck.characters = 'v';
    ck.fontName = { family: 'Inter', style: 'Bold' };
    ck.fontSize = 12;
    ck.fills = fill('Surface/Card');
  }
}

// Advisory body card
const advWrap = vbox(root, { name: 'Advisory Wrap', gap: 0, pad: [24, 48, 64, 48] });
advWrap.layoutSizingHorizontal = 'FILL'; advWrap.layoutSizingVertical = 'HUG';
const advCard = vbox(advWrap, { name: 'Advisory', gap: 24, pad: [32, 32, 32, 32], fill: 'Surface/Card', stroke: 'Border/Default', radius: 20 });
advCard.effects = [{ type: 'DROP_SHADOW', color: { r: 0, g: 0, b: 0, a: 0.04 }, offset: { x: 0, y: 4 }, radius: 16, spread: 0, visible: true, blendMode: 'NORMAL' }];
advCard.layoutSizingHorizontal = 'FILL'; advCard.layoutSizingVertical = 'HUG';

// Top row: profile label + city
const advTop = hbox(advCard, { justify: 'SPACE_BETWEEN', align: 'CENTER' });
advTop.layoutSizingHorizontal = 'FILL'; advTop.layoutSizingVertical = 'HUG';
const advTopLeft = vbox(advTop, { gap: 4 });
advTopLeft.layoutSizingHorizontal = 'HUG'; advTopLeft.layoutSizingVertical = 'HUG';
txt(advTopLeft, 'ADVISORY FOR CHILDREN IN MUMBAI', 'Inter', 'Semi Bold', 11, 'Brand/Accent',
  { letterSpacing: { unit: 'PERCENT', value: 8 } });
txt(advTopLeft, 'Current AQI: 168 (Poor)', 'Inter', 'Semi Bold', 18, 'Text/Primary');
const refresh = hbox(advTop, { gap: 6, pad: [8, 14, 8, 14], radius: 8, fill: 'Surface/Page', stroke: 'Border/Default', align: 'CENTER' });
refresh.layoutSizingHorizontal = 'HUG'; refresh.layoutSizingVertical = 'HUG';
txt(refresh, 'Refresh', 'Inter', 'Semi Bold', 13, 'Text/Secondary');

// Body prose
const body = figma.createText();
advCard.appendChild(body);
body.characters = "Children's lungs are still developing, and they breathe more air per kilogram of body weight than adults. With AQI in the Poor range, your child is at higher risk of respiratory irritation, especially during outdoor play. Keep outdoor activities short and away from busy roads. School sports and PE periods should be moved indoors or rescheduled to early morning when AQI tends to be lower.";
body.fontName = { family: 'Inter', style: 'Regular' };
body.fontSize = 16;
body.lineHeight = { unit: 'PERCENT', value: 170 };
body.fills = fill('Text/Primary');
body.textAutoResize = 'HEIGHT';
body.layoutSizingHorizontal = 'FILL';

// Action list
const actionHead = figma.createText();
advCard.appendChild(actionHead);
actionHead.characters = 'What to do';
actionHead.fontName = { family: 'Inter', style: 'Semi Bold' };
actionHead.fontSize = 14;
actionHead.fills = fill('Text/Primary');

const actions = [
  { ok: false, text: 'Move outdoor play indoors before 10am or after 7pm' },
  { ok: false, text: 'Close windows during peak traffic hours (8-11am, 5-9pm)' },
  { ok: true,  text: 'Use a HEPA air purifier in your child\'s bedroom' },
  { ok: true,  text: 'Switch to a school route that avoids the main road' },
  { ok: true,  text: 'Watch for cough, wheeze, or unusual tiredness - call your paediatrician if symptoms last more than 2 days' }
];
for (const a of actions) {
  const row = hbox(advCard, { gap: 12, align: 'MIN' });
  row.layoutSizingHorizontal = 'FILL'; row.layoutSizingVertical = 'HUG';
  const check = figma.createFrame();
  row.appendChild(check);
  setSize(check, 22, 22);
  check.cornerRadius = 999;
  check.fills = a.ok ? fill('AQI/Good') : fill('AQI/Poor');
  check.layoutMode = 'HORIZONTAL';
  check.primaryAxisAlignItems = 'CENTER';
  check.counterAxisAlignItems = 'CENTER';
  const cT = figma.createText();
  check.appendChild(cT);
  cT.characters = a.ok ? 'v' : '!';
  cT.fontName = { family: 'Inter', style: 'Bold' };
  cT.fontSize = 12;
  cT.fills = fill('Surface/Card');
  const t = figma.createText();
  row.appendChild(t);
  t.characters = a.text;
  t.fontName = { family: 'Inter', style: 'Regular' };
  t.fontSize = 15;
  t.lineHeight = { unit: 'PERCENT', value: 150 };
  t.fills = fill('Text/Primary');
  t.textAutoResize = 'HEIGHT';
  t.layoutSizingHorizontal = 'FILL';
}

// Footer note
const note = figma.createText();
advCard.appendChild(note);
note.characters = 'Generated by Aira AI from CPCB data, last refreshed 14 minutes ago. Not a substitute for medical advice.';
note.fontName = { family: 'Inter', style: 'Regular' };
note.fontSize = 12;
note.fills = fill('Text/Muted');
note.textAutoResize = 'HEIGHT';
note.layoutSizingHorizontal = 'FILL';

return { advisoryFrame: root.id };
