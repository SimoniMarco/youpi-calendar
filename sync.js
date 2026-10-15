// Haalt de agenda van Booking.com (incl. gekoppelde Airbnb) op en schrijft bookings.json.
// Draait automatisch elke nacht via GitHub Actions.
const fs = require("fs");

function parse(ics){
  const lines = ics.replace(/\r\n[ \t]/g,"").split(/\r?\n/); // regels samenvoegen
  const ranges = []; let s = null, e = null;
  const iso = d => `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`;
  for(const ln of lines){
    if(ln.startsWith("BEGIN:VEVENT")){ s = null; e = null; }
    else if(ln.startsWith("DTSTART")){ const m = ln.match(/(\d{8})/); if(m) s = m[1]; }
    else if(ln.startsWith("DTEND")){ const m = ln.match(/(\d{8})/); if(m) e = m[1]; }
    else if(ln.startsWith("END:VEVENT")){
      if(s && e){
        // DTEND is de vertrekdag (= weer vrij) -> laatste bezette nacht = DTEND - 1 dag
        const d = new Date(Date.UTC(+e.slice(0,4), +e.slice(4,6)-1, +e.slice(6,8)));
        d.setUTCDate(d.getUTCDate() - 1);
        ranges.push([ iso(s), d.toISOString().slice(0,10) ]);
      }
    }
  }
  return ranges;
}

(async () => {
  const url = process.env.ICAL_URL;
  if(!url){ console.error("ICAL_URL ontbreekt (zet hem als Secret)."); process.exit(1); }
  const res = await fetch(url, { headers: { "User-Agent": "youpi-calendar/1.0" } });
  if(!res.ok){ console.error("Ophalen mislukt: HTTP " + res.status); process.exit(1); }
  const ics = await res.text();
  const ranges = parse(ics);
  const out = { updated: new Date().toISOString().slice(0,10), source: "Booking.com + Airbnb", ranges };
  fs.writeFileSync("bookings.json", JSON.stringify(out));
  console.log("OK — " + ranges.length + " periodes weggeschreven.");
})().catch(err => { console.error(err); process.exit(1); });
