(function () {
  "use strict";

  var MEETINGS = [];
  var DAYS = ["Tue", "Wed", "Thu", "Fri", "Sat"];
  var DAY_NAMES = { Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday" };
  var DAY_ORDER = { Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  var RRULE_DAY = { Tue: "TU", Wed: "WE", Thu: "TH", Fri: "FR", Sat: "SA" };
  var TZ = "America/Los_Angeles";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c];
    });
  }
  function hm(t) { var p = t.split(":").map(Number); return { hour: p[0], minute: p[1] }; }
  function fmtTime(t) {
    var x = hm(t);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, x.hour, x.minute));
  }
  function timeBucket(t) { var h = hm(t).hour; return h < 12 ? "morning" : h < 17 ? "midday" : "evening"; }
  function mapsUrl(m) { return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(m.venue + ", " + m.address); }
  function telHref(phone) { var d = phone.replace(/\D/g, ""); return d.length === 10 ? "tel:+1" + d : null; }
  function pad(n) { return String(n).padStart(2, "0"); }

  function pacificParts(date) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(date);
    function get(type) { var p = parts.find(function (x) { return x.type === type; }); return p ? p.value : ""; }
    return { year: +get("year"), month: +get("month"), day: +get("day"), weekday: get("weekday"), hour: +get("hour"), minute: +get("minute") };
  }
  // Converts a Pacific wall-clock time to a UTC Date.
  function pacificToUtc(y, mo, d, h, mi) {
    var guess = Date.UTC(y, mo - 1, d, h, mi);
    for (var i = 0; i < 2; i++) {
      var p = pacificParts(new Date(guess));
      var diff = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Date.UTC(y, mo - 1, d, h, mi);
      guess -= diff;
    }
    return new Date(guess);
  }
  function nextOccurrence(m) {
    var s = hm(m.start), e = hm(m.end), now = Date.now();
    for (var i = 0; i < 8; i++) {
      var p = pacificParts(new Date(now + 864e5 * i));
      if (p.weekday !== m.day) continue;
      if (i === 0 && p.hour * 60 + p.minute >= s.hour * 60 + s.minute) continue;
      return {
        local: { y: p.year, mo: p.month, d: p.day },
        start: pacificToUtc(p.year, p.month, p.day, s.hour, s.minute),
        end: pacificToUtc(p.year, p.month, p.day, e.hour, e.minute)
      };
    }
    throw new Error("Could not find next occurrence for " + m.id);
  }
  function utcStamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + "00Z";
  }
  function localStamp(l, t, sep) {
    var x = hm(t);
    return sep
      ? l.y + "-" + pad(l.mo) + "-" + pad(l.d) + "T" + pad(x.hour) + ":" + pad(x.minute) + ":00"
      : "" + l.y + pad(l.mo) + pad(l.d) + "T" + pad(x.hour) + pad(x.minute) + "00";
  }
  function query(obj) {
    var q = new URLSearchParams();
    Object.keys(obj).sort().forEach(function (k) { if (obj[k] != null) q.append(k, obj[k]); });
    return q.toString().replace(/\+/g, "%20");
  }
  function title(m) { return "FA meeting — " + m.city; }
  function description(m) {
    var c = m.contacts.map(function (x) { return x.name + " " + x.phone; }).join("; ");
    return [DAY_NAMES[m.day] + " " + m.start + "–" + m.end, venueLabel(m), m.address, c ? "Contacts: " + c : "", "Food Addicts in Recovery Anonymous — Bay Area"].filter(Boolean).join("\n");
  }
  function venueLabel(m) { return m.room ? m.venue + ", " + m.room : m.venue; }
  function location(m) { return venueLabel(m) + ", " + m.address; }

  function calendarLinks(m) {
    var o = nextOccurrence(m);
    return {
      google: "https://calendar.google.com/calendar/render?" + query({
        action: "TEMPLATE", text: title(m), details: description(m), location: location(m),
        dates: utcStamp(o.start) + "/" + utcStamp(o.end), recur: "RRULE:FREQ=WEEKLY;BYDAY=" + RRULE_DAY[m.day]
      }),
      outlook: "https://outlook.live.com/calendar/0/action/compose?" + query({
        path: "/calendar/action/compose", rru: "addevent", startdt: localStamp(o.local, m.start, true),
        enddt: localStamp(o.local, m.end, true), subject: title(m), body: description(m), location: location(m), allday: false
      }),
      yahoo: "https://calendar.yahoo.com/?" + query({
        v: 60, title: title(m), st: utcStamp(o.start), et: utcStamp(o.end), desc: description(m), in_loc: location(m), dur: false
      })
    };
  }
  function icsText(m) {
    var o = nextOccurrence(m);
    function e(s) { return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "CALSCALE:GREGORIAN", "PRODID:norcalfoodaddicts.com", "BEGIN:VEVENT",
      "UID:" + m.id + "@norcalfoodaddicts.com", "DTSTAMP:" + utcStamp(new Date()),
      "DTSTART;TZID=" + TZ + ":" + localStamp(o.local, m.start, false),
      "DTEND;TZID=" + TZ + ":" + localStamp(o.local, m.end, false),
      "RRULE:FREQ=WEEKLY;BYDAY=" + RRULE_DAY[m.day],
      "SUMMARY:" + e(title(m)), "DESCRIPTION:" + e(description(m)), "LOCATION:" + e(location(m)),
      "END:VEVENT", "END:VCALENDAR", ""
    ].join("\r\n");
  }
  function downloadIcs(m) {
    var url = URL.createObjectURL(new Blob([icsText(m)], { type: "text/calendar;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = m.id + ".ics"; a.click();
    URL.revokeObjectURL(url);
  }

  var ext = ' target="_blank" rel="noopener noreferrer"';
  function addCal(m) {
    var l = calendarLinks(m);
    return '<div class="add-cal"><p class="add-cal-label">Add to Calendar</p><div class="add-cal-links">' +
      '<a href="' + esc(l.google) + '"' + ext + '>Google</a>' +
      '<a href="' + esc(l.outlook) + '"' + ext + '>Outlook</a>' +
      '<a href="' + esc(l.yahoo) + '"' + ext + '>Yahoo</a>' +
      '<button type="button" data-ics="' + esc(m.id) + '">Apple</button></div></div>';
  }
  function contacts(m) {
    return '<ul class="contacts">' + m.contacts.map(function (c) {
      var href = telHref(c.phone);
      return "<li>" + esc(c.name) + " " + (href ? '<a href="' + href + '">' + esc(c.phone) + "</a>" : esc(c.phone)) + "</li>";
    }).join("") + "</ul>";
  }
  function row(m) {
    return '<li class="meeting-row"><div class="row-time">' + fmtTime(m.start) + '</div><div class="row-main">' +
      '<div class="row-city">' + esc(m.city) + (m.accessible ? " · Accessible" : "") + "</div>" +
      '<div class="row-venue">' + esc(venueLabel(m)) + '</div><div class="row-address">' + esc(m.address) + "</div>" +
      contacts(m) + '<div class="row-actions"><a class="maps-link" href="' + esc(mapsUrl(m)) + '"' + ext + ">Open in Google Maps</a>" +
      addCal(m) + "</div></div></li>";
  }
  function tableRow(m) {
    return '<tr><td><span class="table-time">' + fmtTime(m.start) + "–" + fmtTime(m.end) + "</span></td>" +
      "<td><strong>" + esc(m.city) + "</strong></td><td>" + esc(venueLabel(m)) + "</td>" +
      '<td><a href="' + esc(mapsUrl(m)) + '"' + ext + ">" + esc(m.address) + "</a></td>" +
      "<td>" + contacts(m) + "</td><td>" + (m.accessible ? "Wheelchair access" : "—") + "</td><td>" + addCal(m) + "</td></tr>";
  }

  var state = { search: "", city: "everywhere", day: "any", time: "any", type: "any" };
  var root = document.getElementById("meeting-finder");

  function init() {
  var cities = Array.from(new Set(MEETINGS.map(function (m) { return m.city; }))).sort(function (a, b) { return a.localeCompare(b); });

  function opt(v, label, cur) { return '<option value="' + esc(v) + '"' + (v === cur ? " selected" : "") + ">" + esc(label) + "</option>"; }
  root.innerHTML =
    '<div class="filter-bar">' +
    '<label class="filter-field filter-search"><span>Search</span><input type="search" name="search" placeholder="City, venue, or address" value=""/></label>' +
    '<label class="filter-field"><span>City</span><select name="city">' + opt("everywhere", "Everywhere", state.city) + cities.map(function (c) { return opt(c, c, state.city); }).join("") + "</select></label>" +
    '<label class="filter-field"><span>Day</span><select name="day">' + opt("any", "Any day", state.day) + DAYS.map(function (d) { return opt(d, DAY_NAMES[d], state.day); }).join("") + "</select></label>" +
    '<label class="filter-field"><span>Time</span><select name="time">' + opt("any", "Any time", state.time) + opt("morning", "Morning") + opt("midday", "Midday") + opt("evening", "Evening") + "</select></label>" +
    '<label class="filter-field"><span>Type</span><select name="type">' + opt("any", "Any type", state.type) + opt("accessible", "Wheelchair access") + "</select></label>" +
    "</div>" +
    '<p class="result-count" aria-live="polite"></p>' +
    '<div class="meeting-list-mobile"></div>' +
    '<div class="meeting-table-wrap"><table class="meeting-table"><thead><tr><th>Time</th><th>Meeting</th><th>Location</th><th>Address</th><th>Contacts</th><th>Types</th><th>Calendar</th></tr></thead><tbody></tbody></table></div>' +
    '<p class="empty" hidden>No meetings match these filters.</p>';

  var countEl = root.querySelector(".result-count");
  var listEl = root.querySelector(".meeting-list-mobile");
  var tbodyEl = root.querySelector("tbody");
  var emptyEl = root.querySelector(".empty");

  function filtered() {
    var q = state.search.trim().toLowerCase();
    return MEETINGS.filter(function (m) {
      return (state.city === "everywhere" || m.city === state.city) &&
        (state.day === "any" || m.day === state.day) &&
        (state.time === "any" || timeBucket(m.start) === state.time) &&
        (state.type !== "accessible" || !!m.accessible) &&
        (!q || (m.city + " " + venueLabel(m) + " " + m.address + " " + m.day).toLowerCase().indexOf(q) !== -1);
    }).sort(function (a, b) { return DAY_ORDER[a.day] - DAY_ORDER[b.day] || a.start.localeCompare(b.start); });
  }

  function render() {
    var list = filtered();
    countEl.textContent = list.length + " meeting" + (list.length === 1 ? "" : "s");
    emptyEl.hidden = list.length !== 0;
    if (state.day === "any") {
      var groups = DAYS.map(function (d) { return [d, list.filter(function (m) { return m.day === d; })]; }).filter(function (g) { return g[1].length; });
      listEl.innerHTML = groups.map(function (g) {
        return '<div class="day-group"><h3 class="day-heading">' + DAY_NAMES[g[0]] + '</h3><ul class="meeting-rows">' + g[1].map(row).join("") + "</ul></div>";
      }).join("");
      tbodyEl.innerHTML = groups.map(function (g) {
        return '<tr class="table-day-row"><td colspan="7">' + DAY_NAMES[g[0]] + "</td></tr>" + g[1].map(tableRow).join("");
      }).join("");
    } else {
      listEl.innerHTML = '<ul class="meeting-rows">' + list.map(row).join("") + "</ul>";
      tbodyEl.innerHTML = list.map(tableRow).join("");
    }
  }

  root.addEventListener("input", function (e) {
    if (e.target.name && e.target.name in state) { state[e.target.name] = e.target.value; render(); }
  });
  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-ics]");
    if (!btn) return;
    var m = MEETINGS.find(function (x) { return x.id === btn.getAttribute("data-ics"); });
    if (m) downloadIcs(m);
  });

  render();
  }

  fetch("meetings.json")
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { MEETINGS = data; init(); })
    .catch(function () {
      root.innerHTML = '<p class="empty">Meeting list could not be loaded. Please refresh the page.</p>';
    });
})();
