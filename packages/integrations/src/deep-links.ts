export function generateHotelDeepLink(
  hotelName: string,
  checkIn: string,
  checkOut: string,
  guests: number,
): string {
  // Simple Booking.com fallback search URL
  const query = encodeURIComponent(hotelName);
  return `https://www.booking.com/searchresults.html?ss=${query}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${guests}`;
}

export function generateRailDeepLink(fromStation: string, toStation: string, date: string): string {
  // ConfirmTkt search format fallback
  return `https://www.confirmtkt.com/train-tickets/${fromStation}-to-${toStation}?date=${date}`;
}

export function generateFlightDeepLink(origin: string, dest: string, date: string): string {
  // Skyscanner flight fallback
  // e.g. https://www.skyscanner.net/transport/flights/lond/nyca/231201/
  const from = origin.slice(0, 4).toLowerCase();
  const to = dest.slice(0, 4).toLowerCase();
  const formattedDate = date.replace(/-/g, "").slice(2); // YYMMDD
  return `https://www.skyscanner.net/transport/flights/${from}/${to}/${formattedDate}/`;
}

export function generateExperienceDeepLink(experienceName: string, location: string): string {
  // GetYourGuide generic search
  const query = encodeURIComponent(`${experienceName} ${location}`);
  return `https://www.getyourguide.com/s?q=${query}`;
}
