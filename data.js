window.TRIP_DATA = {
  tripName: "Cali26",
  startDate: "2026-09-05",
  endDate: "2026-09-19",
  people: ["Phil", "Charli", "Pätti", "Steffi"],
  flights: [
    {
      type: "Hinflug",
      date: "2026-09-05",
      from: "Berlin (BER)",
      to: "Los Angeles (LAX)",
      depart: "10:40",
      arrive: "18:25",
      airline: "Aer Lingus",
      details: "1 Stopp · 16 Std. 45 Min. · Economy · EI333, EI69"
    },
    {
      type: "Rückflug",
      date: "2026-09-19",
      from: "Los Angeles (LAX)",
      to: "Berlin (BER)",
      depart: "20:10",
      arrive: "21:05 +1",
      airline: "Aer Lingus",
      details: "1 Stopp · 15 Std. 55 Min. · Economy · EI68, EI336"
    }
  ],
  car: {
    title: "Mietwagen",
    note: "Abholung direkt am Flughafen LAX. Hauptverkehrsmittel zwischen LA, Las Vegas und San Diego."
  },
  accommodations: [
    { id: "san-gabriel-house", city: "San Gabriel", name: "Gästehaus in San Gabriel", start: "2026-09-05", end: "2026-09-12", checkin: "15:00", checkout: "11:00", lat: 34.0961, lng: -118.1058 },
    { id: "las-vegas-condo", city: "Las Vegas", name: "Eigentumswohnung in Las Vegas", start: "2026-09-12", end: "2026-09-15", checkin: "16:00", checkout: "11:00", lat: 36.1716, lng: -115.1391 },
    { id: "san-diego-house", city: "San Diego", name: "Haus in San Diego", start: "2026-09-15", end: "2026-09-19", checkin: "15:00", checkout: "11:00", lat: 32.7157, lng: -117.1611 }
  ],
  categories: {
    food: { label: "Food", icon: "🍔", color: "#ef4444" },
    sightseeing: { label: "Sehenswürdigkeiten", icon: "🌴", color: "#22c55e" },
    photo: { label: "Fotospots", icon: "📸", color: "#8b5cf6" },
    shopping: { label: "Shopping", icon: "🛍️", color: "#ec4899" },
    activity: { label: "Aktivitäten", icon: "🎡", color: "#f59e0b" },
    bar: { label: "Bars & Cafés", icon: "☕", color: "#06b6d4" },
    stay: { label: "Unterkünfte", icon: "🏠", color: "#111827" },
    travel: { label: "Flug & Mietwagen", icon: "✈️", color: "#2563eb" }
  },
  spots: [
    { id: "lax", name: "Los Angeles Airport LAX", category: "travel", lat: 33.9416, lng: -118.4085, note: "Ankunft, Rückflug und Mietwagen-Abholung." },
    { id: "san-gabriel-house", name: "Gästehaus San Gabriel", category: "stay", lat: 34.0961, lng: -118.1058, note: "Unterkunft 05.09.–12.09. · Check-in ab 15:00 · Check-out bis 11:00" },
    { id: "las-vegas-condo", name: "Eigentumswohnung Las Vegas", category: "stay", lat: 36.1716, lng: -115.1391, note: "Unterkunft 12.09.–15.09. · Check-in ab 16:00 · Check-out bis 11:00" },
    { id: "san-diego-house", name: "Haus San Diego", category: "stay", lat: 32.7157, lng: -117.1611, note: "Unterkunft 15.09.–19.09. · Check-in ab 15:00 · Check-out bis 11:00" },
    { id: "santa-monica-pier", name: "Santa Monica Pier", category: "sightseeing", lat: 34.0101, lng: -118.4962, note: "Klassiker am Wasser. Perfekt zum Ankommen." },
    { id: "venice-beach", name: "Venice Beach", category: "sightseeing", lat: 33.9850, lng: -118.4695, note: "Boardwalk, Strand, Street-Vibe." },
    { id: "muscle-beach", name: "Muscle Beach", category: "photo", lat: 33.9855, lng: -118.4729, note: "Guter kurzer Foto-/Video-Stopp." },
    { id: "griffith", name: "Griffith Observatory", category: "photo", lat: 34.1184, lng: -118.3004, note: "Abends stark wegen Skyline und Sonnenuntergang." },
    { id: "hollywood-sign", name: "Hollywood Sign View", category: "photo", lat: 34.1341, lng: -118.3215, note: "Fotospot für Hollywood Sign." },
    { id: "walk-of-fame", name: "Hollywood Walk of Fame", category: "sightseeing", lat: 34.1016, lng: -118.3269, note: "Kann man mit Hollywood verbinden." },
    { id: "rodeo-drive", name: "Rodeo Drive", category: "shopping", lat: 34.0697, lng: -118.4031, note: "Schauen, Fotos, Luxus-Vibe." },
    { id: "the-grove", name: "The Grove", category: "shopping", lat: 34.0720, lng: -118.3570, note: "Shopping + Food in einem." },
    { id: "in-n-out", name: "In-N-Out Burger", category: "food", lat: 34.0928, lng: -118.3287, note: "Double-Double testen." },
    { id: "tacos-1986", name: "Tacos 1986", category: "food", lat: 34.0455, lng: -118.2560, note: "Taco-Spot für zwischendurch." },
    { id: "daikokuya", name: "Daikokuya Ramen", category: "food", lat: 34.0501, lng: -118.2401, note: "Ramen in Little Tokyo." },
    { id: "universal", name: "Universal Studios Hollywood", category: "activity", lat: 34.1381, lng: -118.3534, note: "Ganzer Tag einplanen." },
    { id: "getty", name: "Getty Center", category: "activity", lat: 34.0780, lng: -118.4741, note: "Architektur, Aussicht, Museum." },
    { id: "grand-central", name: "Grand Central Market", category: "food", lat: 34.0505, lng: -118.2482, note: "Viele Food-Optionen an einem Ort." },
    { id: "melrose", name: "Melrose Avenue", category: "shopping", lat: 34.0837, lng: -118.3614, note: "Streetwear, Stores, Fotos." },
    { id: "rooftop", name: "Perch LA", category: "bar", lat: 34.0489, lng: -118.2511, note: "Rooftop-Bar mit Downtown-Blick." }
  ],
  itinerary: [
    { date: "2026-09-05", title: "Ankunft in LA", summary: "BER nach LAX, Mietwagen abholen und nach San Gabriel fahren.", route: ["lax", "san-gabriel-house"] },
    { date: "2026-09-06", title: "Santa Monica & Venice", summary: "Erster voller Tag am Wasser, entspannt starten.", route: ["santa-monica-pier", "venice-beach", "muscle-beach"] },
    { date: "2026-09-07", title: "Hollywood & Griffith", summary: "Klassische LA-Spots und abends Aussicht.", route: ["walk-of-fame", "in-n-out", "hollywood-sign", "griffith"] },
    { date: "2026-09-08", title: "Shopping & Food", summary: "Rodeo, The Grove und gute Foodspots.", route: ["rodeo-drive", "the-grove", "melrose", "grand-central"] },
    { date: "2026-09-09", title: "Universal Studios", summary: "Ein Tag für Universal. Danach nur noch entspannt essen.", route: ["universal", "daikokuya"] },
    { date: "2026-09-10", title: "Getty & Downtown Abend", summary: "Museum, Aussicht und abends Rooftop.", route: ["getty", "tacos-1986", "rooftop"] },
    { date: "2026-09-11", title: "Flex Day LA", summary: "Freier Tag für spontane Spots in der Nähe.", route: ["san-gabriel-house"] },
    { date: "2026-09-12", title: "Unterkunftswechsel nach Las Vegas", summary: "Check-out San Gabriel, Roadtrip nach Las Vegas, Check-in ab 16:00.", route: ["san-gabriel-house", "las-vegas-condo"] },
    { date: "2026-09-13", title: "Las Vegas Tag", summary: "Vegas-Tag. Spots werden später ergänzt.", route: ["las-vegas-condo"] },
    { date: "2026-09-14", title: "Las Vegas Flex Day", summary: "Zeit für weitere Vegas-Spots oder Umgebung.", route: ["las-vegas-condo"] },
    { date: "2026-09-15", title: "Weiter nach San Diego", summary: "Check-out Las Vegas, Fahrt nach San Diego, Check-in ab 15:00.", route: ["las-vegas-condo", "san-diego-house"] },
    { date: "2026-09-16", title: "San Diego Tag", summary: "San Diego Spots werden später ergänzt.", route: ["san-diego-house"] },
    { date: "2026-09-17", title: "San Diego Flex Day", summary: "Strand, Food oder spontane Spots in der Nähe.", route: ["san-diego-house"] },
    { date: "2026-09-18", title: "Letzter voller Tag", summary: "Letzte Spots, Packen, entspannter Abschluss.", route: ["san-diego-house"] },
    { date: "2026-09-19", title: "Rückflug", summary: "Check-out bis 11:00, Fahrt nach LAX, Rückflug um 20:10.", route: ["san-diego-house", "lax"] }
  ]
};
