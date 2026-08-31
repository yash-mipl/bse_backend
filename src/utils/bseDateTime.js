const KOLKATA_TIMEZONE = 'Asia/Kolkata';

/**
 * Build BSE request timestamp fields using Indian market time (Asia/Kolkata).
 * @returns {{ Hr: string, Min: string, Sec: string, Tradedt: string }}
 */
export function getKolkataBseTimestamps(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: KOLKATA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '0';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const hour = Number.parseInt(get('hour'), 10);
  const minute = Number.parseInt(get('minute'), 10);
  const second = Number.parseInt(get('second'), 10);

  return {
    Hr: String(hour === 24 ? 0 : hour),
    Min: String(minute),
    Sec: '0',
    Tradedt: `${year}${month}${day}`,
  };
}

/**
 * Validate optional time filters from the frontend.
 * Returns normalized filters or null when none provided.
 * @param {unknown} filters
 * @returns {{ Hr: string, Min: string, Sec: string, Tradedt: string } | null}
 */
export function resolveBseTimeFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return null;
  }

  const { Hr, Min, Sec, Tradedt } = filters;

  if (Hr === undefined && Min === undefined && Sec === undefined && Tradedt === undefined) {
    return null;
  }

  if (Hr === undefined || Min === undefined || Sec === undefined || Tradedt === undefined) {
    throw new Error('All time filter fields (Hr, Min, Sec, Tradedt) are required.');
  }

  const isValidField = (value) => typeof value === 'string' || typeof value === 'number';

  if (!isValidField(Hr) || !isValidField(Min) || !isValidField(Sec) || !isValidField(Tradedt)) {
    throw new Error('Invalid time filter format.');
  }

  const hr = String(Hr);
  const min = String(Min);
  const sec = String(Sec);
  const tradedt = String(Tradedt);

  if (!/^\d{8}$/.test(tradedt)) {
    throw new Error('Tradedt must be in YYYYMMDD format.');
  }

  const hour = Number.parseInt(hr, 10);
  const minute = Number.parseInt(min, 10);
  const second = Number.parseInt(sec, 10);

  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    throw new Error('Hr must be between 0 and 23.');
  }

  if (Number.isNaN(minute) || minute < 0 || minute > 59) {
    throw new Error('Min must be between 0 and 59.');
  }

  if (Number.isNaN(second) || second < 0 || second > 59) {
    throw new Error('Sec must be between 0 and 59.');
  }

  return {
    Hr: hr,
    Min: min,
    Sec: sec,
    Tradedt: tradedt,
  };
}
