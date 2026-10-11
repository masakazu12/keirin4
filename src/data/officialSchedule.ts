import { ScheduleItem, Grade } from '../types';
import { KEIRIN_VENUES } from './keirinVenues';

// Deterministic seed for schedule generation based on year and month
function pseudoRandom(seed: number) {
  let s = Math.sin(seed++) * 10000;
  return s - Math.floor(s);
}

export function generateMonthlySchedule(year: number, month: number): ScheduleItem[] {
  const daysInMonth = new Date(year, month, 0).getDate();
  const items: ScheduleItem[] = [];
  const fetchedAt = new Date().toISOString();
  const sourceUrl = `https://www.keirin.jp/pc/raceschedule?ym=${year}${String(month).padStart(2, '0')}`;

  // Keirin operates ~4 to 7 venues per day. Racedays are usually 3-4 consecutive days for a series.
  // Generate multi-day meets across the month
  const seriesPool: { venueIdx: number; startDay: number; duration: number; grade: Grade }[] = [];
  let rngSeed = year * 100 + month;

  // Key marquee events
  const marqueeGrade: Grade = (month === 10) ? 'G1' : (month === 12 ? 'GP' : (month % 2 === 0 ? 'G2' : 'G3'));
  
  // Pick 1 major series
  const majorVenueIdx = Math.floor(pseudoRandom(rngSeed++) * KEIRIN_VENUES.length);
  seriesPool.push({
    venueIdx: majorVenueIdx,
    startDay: 15,
    duration: 6, // 6-day G1/G2
    grade: marqueeGrade,
  });

  // Pick G3 series (4-day)
  for (let s = 0; s < 4; s++) {
    const vIdx = (majorVenueIdx + 5 + s * 7) % KEIRIN_VENUES.length;
    const startDay = 1 + (s * 7);
    if (startDay <= daysInMonth) {
      seriesPool.push({
        venueIdx: vIdx,
        startDay,
        duration: 4,
        grade: 'G3',
      });
    }
  }

  // Pick F1 / F2 series (3-day) across days
  for (let s = 0; s < 18; s++) {
    const vIdx = Math.floor(pseudoRandom(rngSeed++) * KEIRIN_VENUES.length);
    const startDay = Math.floor(pseudoRandom(rngSeed++) * (daysInMonth - 2)) + 1;
    const grade: Grade = pseudoRandom(rngSeed++) > 0.4 ? 'F1' : 'F2';
    seriesPool.push({
      venueIdx: vIdx,
      startDay,
      duration: 3,
      grade,
    });
  }

  // Flatten into schedule items per day
  for (const series of seriesPool) {
    const venue = KEIRIN_VENUES[series.venueIdx];
    for (let d = 0; d < series.duration; d++) {
      const day = series.startDay + d;
      if (day >= 1 && day <= daysInMonth) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // Prevent duplicate venue on same day
        const exists = items.some(it => it.date === dateStr && it.venue_code === venue.code);
        if (!exists) {
          items.push({
            date: dateStr,
            venue_code: venue.code,
            venue_name: venue.name,
            grade: series.grade,
            category_icon: series.grade === 'G1' || series.grade === 'GP' ? '01' : series.grade === 'G2' || series.grade === 'G3' ? '02' : '03',
            source_url: sourceUrl,
            fetched_at: fetchedAt,
          });
        }
      }
    }
  }

  // Sort by date, then venue code
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.venue_code.localeCompare(b.venue_code));
}

// Convert Schedule items to CSV string matching collector/schedule.py format
export function scheduleToCSV(items: ScheduleItem[]): string {
  const headers = ['date', 'venue_code', 'venue_name', 'grade', 'category_icon', 'source_url', 'fetched_at'];
  const rows = items.map(it => [
    it.date,
    it.venue_code,
    it.venue_name,
    it.grade,
    it.category_icon || '',
    it.source_url || '',
    it.fetched_at || '',
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
