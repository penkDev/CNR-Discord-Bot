const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MINUTES_PER_DAY = 24 * 60;
const MINUTES_PER_WEEK = 7 * MINUTES_PER_DAY;

export function convertSecondsToHms(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${hours}h ${minutes}m ${seconds}s`;
}

/**
 * Port of the Python convert_time and seconds_remaining_to_human_readable.
 * The remaining minutes are intentionally treated as seconds and divided by 60 again,
 * which is what the original bot displayed.
 */
export function restartCountdown(timeString) {
  const parts = typeof timeString === 'string' ? timeString.trim().split(/\s+/) : [];
  const clock = parts[1]?.split(':');
  const dayIndex = WEEKDAYS.indexOf(parts[0]);
  if (parts.length !== 2 || dayIndex === -1 || clock?.length !== 2 || !clock.every((part) => /^\d+$/.test(part))) {
    return 'N/A';
  }
  const [hour, minute] = clock.map(Number);
  const current = dayIndex * MINUTES_PER_DAY + hour * 60 + minute;
  const target = WEEKDAYS.indexOf('Saturday') * MINUTES_PER_DAY + 23 * 60 + 59;
  let remaining = target - current;
  if (remaining < 0) remaining += MINUTES_PER_WEEK;
  const minutes = Math.floor(remaining / 60);
  return `${Math.floor(minutes / 60)}h, ${minutes % 60}m`;
}
