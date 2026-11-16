// Haalt de agenda's van Booking.com en Airbnb op, voegt ze samen en schrijft bookings.json.
// Draait automatisch elke nacht via GitHub Actions.
const fs = require("fs");

function parse(ics){
  const lines = ics.replace(/\r?\n[ \t]/g,"").split(/\r?\n/); // regels samenvoegen
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
        const last = d.toISOString().slice(0,10);
        if(last >= iso(s)) ranges.push([ iso(s), last ]);
      }
    }
  }
  return ranges;
}

// Overlappende en aansluitende periodes samenvoegen tot één periode
function merge(ranges){
  const nextDay = iso => { const d = new Date(iso + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0,10); };
  const sorted = ranges.slice().sort((a,b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const out = [];
  for(const [a,b] of sorted){
    const prev = out[out.length - 1];
    if(prev && a <= nextDay(prev[1])){ if(b > prev[1]) prev[1] = b; }
    else out.push([a,b]);
  }
  return out;
}

async function load(name, url){
  const res = await fetch(url, { headers: { "User-Agent": "youpi-calendar/1.0" } });
  if(!res.ok) throw new Error(name + ": ophalen mislukt (HTTP " + res.status + ")");
  const ics = await res.text();
  if(!ics.includes("BEGIN:VCALENDAR")) throw new Error(name + ": antwoord is geen iCal-agenda");
  const ranges = parse(ics);
  console.log(name + ": " + ranges.length + " periodes");
  return ranges;
}

(async () => {
  const sources = [
    ["Booking.com", process.env.ICAL_URL],
    ["Airbnb", process.env.ICAL_URL_AIRBNB],
  ];
  for(const [name, url] of sources){
    if(!url){ console.error("iCal-link van " + name + " ontbreekt (zet hem als Secret)."); process.exit(1); }
  }
  // Mislukt één van beide, dan stopt het script en blijft de vorige bookings.json staan.
  let all = [];
  for(const [name, url] of sources) all = all.concat(await load(name, url));
  const ranges = merge(all);
  const out = { updated: new Date().toISOString().slice(0,10), source: "Booking.com + Airbnb", ranges };
  fs.writeFileSync("bookings.json", JSON.stringify(out));
  console.log("OK — " + ranges.length + " periodes weggeschreven.");
})().catch(err => { console.error(err.message || err); process.exit(1); });
