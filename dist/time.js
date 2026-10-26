/* 使用北京时间的日历边界，身处不同时区也不会改变纪念日。 */
(function (root) {
  'use strict';
  const DAY = 86400000;
  const OFFSET = 8 * 3600000;
  function dateParts(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('请输入完整日期');
    const parts = value.split('-').map(Number);
    const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (parts[0] < 1900 || parts[0] > 2100 || check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2]) throw new Error('日期无效');
    return parts;
  }
  function atShanghaiMidnight(value) {
    const [year, month, day] = dateParts(value);
    return Date.UTC(year, month - 1, day) - OFFSET;
  }
  function timeParts(value) {
    if (typeof value !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('请输入有效的时分');
    return value.split(':').map(Number);
  }
  function atShanghaiTime(date, time = '00:00') {
    const [hours, minutes] = timeParts(time);
    return atShanghaiMidnight(date) + (hours * 60 + minutes) * 60000;
  }
  function clock(now, startDate, startTime = '00:00') {
    const delta = now - atShanghaiTime(startDate, startTime);
    const seconds = Math.floor(Math.abs(delta) / 1000);
    return { future: delta < 0, days: Math.floor(seconds / 86400), hours: Math.floor(seconds / 3600) % 24, minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 };
  }
  function anniversary(now, startDate) {
    const [startYear, month, day] = dateParts(startDate);
    const chinaNow = new Date(now + OFFSET);
    const today = Date.UTC(chinaNow.getUTCFullYear(), chinaNow.getUTCMonth(), chinaNow.getUTCDate());
    let year = Math.max(startYear, chinaNow.getUTCFullYear());
    const dateFor = (y) => Date.UTC(y, month - 1, Math.min(day, new Date(Date.UTC(y, month, 0)).getUTCDate()));
    let target = dateFor(year);
    if (target < today) target = dateFor(++year);
    const targetDate = new Date(target).toISOString().slice(0, 10);
    return { days: Math.round((target - today) / DAY), date: targetDate, years: year - startYear, today: target === today, futureStart: year === startYear };
  }
  function todayShanghai(now = Date.now()) { return new Date(now + OFFSET).toISOString().slice(0, 10); }
  const api = { dateParts, timeParts, atShanghaiMidnight, atShanghaiTime, clock, anniversary, todayShanghai };
  root.UniverseTime = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
