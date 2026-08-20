'use strict';

/**
 * Algeria time utilities.
 *
 * MongoDB/JS Date values remain UTC instants.  These helpers only convert
 * between an instant and the Algeria (Africa/Algiers, UTC+01:00) calendar.
 * Algeria has no DST changes, so UTC+01:00 is stable.
 */
const ALGERIA_OFFSET_MS = 60 * 60 * 1000;
const ALGERIA_TIME_ZONE = 'Africa/Algiers';

function toAlgeriaDate(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) throw new TypeError('Invalid date');
  return new Date(value.getTime() + ALGERIA_OFFSET_MS);
}

function dayKey(date = new Date()) {
  const d = toAlgeriaDate(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function minutesSinceMidnight(date = new Date()) {
  const d = toAlgeriaDate(date);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function startOfAlgeriaDay(date = new Date()) {
  const d = toAlgeriaDate(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ALGERIA_OFFSET_MS);
}

function endOfAlgeriaDay(date = new Date()) {
  return new Date(startOfAlgeriaDay(date).getTime() + 24 * 60 * 60 * 1000);
}

function addAlgeriaDays(date, amount) {
  return new Date(startOfAlgeriaDay(date).getTime() + Number(amount) * 24 * 60 * 60 * 1000);
}

function startOfAlgeriaMonth(date = new Date()) {
  const d = toAlgeriaDate(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - ALGERIA_OFFSET_MS);
}

function algeriaParts(date = new Date()) {
  const d = toAlgeriaDate(date);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

function algeriaDateTimeToUtc(value) {
  // Converts YYYY-MM-DDTHH:mm[:ss] interpreted as Algeria local time to UTC.
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s = '00'] = match;
  const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - ALGERIA_OFFSET_MS;
  const result = new Date(utcMs);
  return Number.isNaN(result.getTime()) ? null : result;
}

module.exports = {
  ALGERIA_OFFSET_MS,
  ALGERIA_TIME_ZONE,
  toAlgeriaDate,
  dayKey,
  minutesSinceMidnight,
  startOfAlgeriaDay,
  endOfAlgeriaDay,
  addAlgeriaDays,
  startOfAlgeriaMonth,
  algeriaParts,
  algeriaDateTimeToUtc,
};
