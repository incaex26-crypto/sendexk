// Phone numbers in one shape (+<country><number>) so login lookups match however people type them.
// Country code and trunk prefix come from the region, so a new country needs no code change.
const err = (status, message) => Object.assign(new Error(message), { status });

function normalizePhone(region, raw) {
  const { countryCode: cc, trunkPrefix: trunk } = region.phone || {};
  if (!/^\d{1,3}$/.test(cc || '') || typeof trunk !== 'string') throw err(500, `region ${region.id} needs phone.countryCode and phone.trunkPrefix`);
  let d = String(raw || '').replace(/[\s().-]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (trunk && d.startsWith(trunk)) d = cc + d.slice(trunk.length); // some countries have no trunk prefix ("")
  else if (!d.startsWith(cc)) d = cc + d;
  if (!/^\d{8,15}$/.test(d) || d.length <= cc.length + 5) throw err(400, 'enter a valid phone number');
  return '+' + d;
}

module.exports = { normalizePhone };
