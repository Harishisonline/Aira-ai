// FIX: Disable clipping on HOME frame so destination cards aren't cut off.
// Run once after opening the file.

const HOME = figma.currentPage.findOne(n => n.name && n.name.startsWith('01 — HOME'));
if (!HOME) return { error: 'HOME frame not found' };
HOME.clipsContent = false;
return { ok: true, width: HOME.width, height: HOME.height };
