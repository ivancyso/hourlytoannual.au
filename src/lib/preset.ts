import salary from "../../data/salary-index.json";
import { ADULT_MINIMUM_HOURLY, ORDINARY_HOURS, WEEKS_PER_YEAR } from "./pay";

export type Preset = {
  hourly: number;
  hours: number;
  casual: boolean;
  note: string;
};

function industryWeekly(id: string): number | undefined {
  return salary.industries.find((row) => row.id === id)?.weeklyAud;
}

export function presetFromKeyword(keyword: string): Preset {
  const k = keyword.toLowerCase();
  const casual = /\bcasual\b/.test(k);
  let hours = ORDINARY_HOURS;
  const hoursMatch = k.match(/(\d{1,2}(?:\.\d)?)\s*(?:hours|hrs)\b/);
  if (hoursMatch) {
    const parsed = Number(hoursMatch[1]);
    if (parsed >= 1 && parsed <= 80) hours = parsed;
  }

  const hourlyMatch = k.match(
    /\$?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(?:\/\s*h(?:ou)?r|an hour|per hour|p\/h)\b/,
  );
  if (hourlyMatch) {
    return {
      hourly: Number(hourlyMatch[1]),
      hours,
      casual,
      note: "The timesheet starts from the rate written in the question.",
    };
  }

  const annualMatch = k.match(
    /\$?\s*(\d{2,3}(?:,\d{3})+|\d{4,7})\s*(?:a year|per year|per annum|p\.a\.?|salary)/,
  );
  if (annualMatch) {
    const annual = Number(annualMatch[1].replace(/,/g, ""));
    if (annual >= 10_000 && annual <= 2_000_000) {
      return {
        hourly: annual / (hours * WEEKS_PER_YEAR),
        hours,
        casual,
        note: "The hourly cell is that yearly amount spread over the hours shown.",
      };
    }
  }

  const thousands = k.match(/(\d{2,3})\s*k\b/);
  if (thousands) {
    const annual = Number(thousands[1]) * 1000;
    return {
      hourly: annual / (ORDINARY_HOURS * WEEKS_PER_YEAR),
      hours: ORDINARY_HOURS,
      casual,
      note: "The hourly cell is that yearly amount on a 38-hour week.",
    };
  }

  if (/minimum wage|national minimum/.test(k)) {
    return {
      hourly: ADULT_MINIMUM_HOURLY,
      hours,
      casual,
      note: "Starts at the adult National Minimum Wage from 1 July 2026.",
    };
  }

  for (const state of salary.states) {
    if (new RegExp(state.match, "i").test(k)) {
      return {
        hourly: state.weeklyAud / ORDINARY_HOURS,
        hours: ORDINARY_HOURS,
        casual,
        note: `Starts from full-time ordinary-time earnings in ${state.name}, May 2026. That is an average, not a minimum.`,
      };
    }
  }

  for (const industry of salary.industries) {
    if (industry.aliases.some((alias) => k.includes(alias))) {
      const weekly = industryWeekly(industry.id);
      if (weekly) {
        return {
          hourly: weekly / ORDINARY_HOURS,
          hours: ORDINARY_HOURS,
          casual,
          note: `Starts from the ${industry.name} ordinary-time average for May 2026, not a median for one job title.`,
        };
      }
    }
  }

  if (/average|median/.test(k)) {
    return {
      hourly: salary.national.fullTimeOrdinaryWeekly / ORDINARY_HOURS,
      hours: ORDINARY_HOURS,
      casual,
      note: "Starts from Australian full-time ordinary-time earnings, May 2026.",
    };
  }

  return {
    hourly: ADULT_MINIMUM_HOURLY,
    hours,
    casual,
    note: "Starts at the adult National Minimum Wage. Change the rate if the job pays more.",
  };
}
