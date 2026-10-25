export const ORDINARY_HOURS = 38;
export const WEEKS_PER_YEAR = 52;
export const SUPER_RATE = 0.12;
export const SUPER_MAX_BASE = 270_830;
export const CASUAL_LOADING = 0.25;
export const ADULT_MINIMUM_HOURLY = 26.44;
export const ADULT_CASUAL_HOURLY = 33.05;
export const MEDICARE_LOWER = 28_011;
export const MEDICARE_RATE = 0.02;

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

export function incomeTax(taxable: number): number {
  if (!Number.isFinite(taxable) || taxable <= 18_200) return 0;
  if (taxable <= 45_000) return (taxable - 18_200) * 0.15;
  if (taxable <= 135_000) return 4_020 + (taxable - 45_000) * 0.3;
  if (taxable <= 190_000) return 31_020 + (taxable - 135_000) * 0.37;
  return 51_370 + (taxable - 190_000) * 0.45;
}

export function medicareLevy(taxable: number): number {
  if (!Number.isFinite(taxable) || taxable <= MEDICARE_LOWER) return 0;
  const full = taxable * MEDICARE_RATE;
  const shade = (taxable - MEDICARE_LOWER) * 0.1;
  return Math.min(full, shade);
}

export type DayCell = {
  label: string;
  hours: number;
  pay: number;
  extra: boolean;
};

export type Quote = {
  valid: boolean;
  baseHourly: number;
  rate: number;
  casual: boolean;
  hoursPerWeek: number;
  ordinaryHours: number;
  overtimeHours: number;
  days: DayCell[];
  weeklyGross: number;
  fortnightGross: number;
  annualGross: number;
  ordinaryAnnual: number;
  overtimeAnnual: number;
  superAnnual: number;
  tax: number;
  medicare: number;
  takeHome: number;
  fortnightTakeHome: number;
  fortnightTax: number;
  fortnightMedicare: number;
  fortnightSuper: number;
  minimumHourly: number;
  comparedWithMinimum: number;
};

export function quote(baseHourly: number, hoursPerWeek: number, casual: boolean): Quote {
  const safeHourly = Number.isFinite(baseHourly) ? Math.min(Math.max(0, baseHourly), 10_000) : 0;
  const safeHours = Number.isFinite(hoursPerWeek) ? Math.min(Math.max(0, hoursPerWeek), 80) : 0;
  const rate = casual ? safeHourly * (1 + CASUAL_LOADING) : safeHourly;
  const ordinaryHours = Math.min(safeHours, ORDINARY_HOURS);
  const overtimeHours = Math.max(0, safeHours - ORDINARY_HOURS);
  const dayHours = ordinaryHours / DAY_LABELS.length;
  const days: DayCell[] = DAY_LABELS.map((label) => ({
    label,
    hours: dayHours,
    pay: dayHours * rate,
    extra: false,
  }));
  days.push({
    label: "Extra",
    hours: overtimeHours,
    pay: overtimeHours * rate,
    extra: true,
  });

  const ordinaryAnnual = rate * ordinaryHours * WEEKS_PER_YEAR;
  const overtimeAnnual = rate * overtimeHours * WEEKS_PER_YEAR;
  const annualGross = ordinaryAnnual + overtimeAnnual;
  const weeklyGross = safeHours > 0 ? annualGross / WEEKS_PER_YEAR : 0;
  const fortnightGross = weeklyGross * 2;
  const superAnnual = Math.min(ordinaryAnnual, SUPER_MAX_BASE) * SUPER_RATE;
  const tax = incomeTax(annualGross);
  const medicare = medicareLevy(annualGross);
  const takeHome = annualGross - tax - medicare;
  const minimumHourly = casual ? ADULT_CASUAL_HOURLY : ADULT_MINIMUM_HOURLY;

  return {
    valid: safeHourly > 0 && safeHours > 0,
    baseHourly: safeHourly,
    rate,
    casual,
    hoursPerWeek: safeHours,
    ordinaryHours,
    overtimeHours,
    days,
    weeklyGross,
    fortnightGross,
    annualGross,
    ordinaryAnnual,
    overtimeAnnual,
    superAnnual,
    tax,
    medicare,
    takeHome,
    fortnightTakeHome: takeHome / 26,
    fortnightTax: tax / 26,
    fortnightMedicare: medicare / 26,
    fortnightSuper: superAnnual / 26,
    minimumHourly,
    comparedWithMinimum: minimumHourly > 0 ? rate / minimumHourly : 0,
  };
}

export function aud(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function hoursLabel(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

export function bandQuote(baseHourly: number, casual: boolean, hours: number): Quote {
  return quote(baseHourly, hours, casual);
}
