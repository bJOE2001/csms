export function shopDate(timezone: string, now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: timezone }).format(now);
}

export function salesPeriods(today: string) {
  const date = new Date(`${today}T00:00:00Z`);
  const shift = (days: number) => {
    const shifted = new Date(date);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return shifted.toISOString().slice(0, 10);
  };
  const yesterday = shift(-1);
  return [
    { id: "today", label: "Today", from: today, to: today },
    { id: "yesterday", label: "Yesterday", from: yesterday, to: yesterday },
    {
      id: "week",
      label: "This week",
      from: shift(-((date.getUTCDay() + 6) % 7)),
      to: today,
    },
    {
      id: "month",
      label: "This month",
      from: `${today.slice(0, 7)}-01`,
      to: today,
    },
  ];
}

export function salesRange(
  params: { period?: string; from?: string; to?: string },
  today: string,
) {
  const periods = salesPeriods(today);
  const preset = periods.find((period) => period.id === params.period);
  if (preset) return { from: preset.from, to: preset.to, period: preset.id };
  const validDate = (value: string | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return today;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : today;
  };
  const from = validDate(params.from),
    to = validDate(params.to);
  return {
    from,
    to,
    period: periods.find((period) => period.from === from && period.to === to)
      ?.id,
  };
}

export function periodDates(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "UTC",
  });
  const start = new Date(`${from}T00:00:00Z`),
    end = new Date(`${to}T00:00:00Z`);
  return from === to
    ? formatter.format(start)
    : formatter.formatRange(start, end);
}
