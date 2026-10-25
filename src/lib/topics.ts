export type Topic = {
  slug: string;
  name: string;
  description: string;
  pattern: RegExp;
};

export const topics: Topic[] = [
  {
    slug: "minimum-wage",
    name: "Minimum wage",
    description: "The National Minimum Wage, award floors, and what a 38-hour year comes to.",
    pattern: /minimum wage|national minimum|award wage|award rate/i,
  },
  {
    slug: "take-home",
    name: "Take-home pay",
    description: "Resident tax, the Medicare levy, and what is left from a fortnight.",
    pattern: /take[- ]?home|after[- ]?tax|net pay|income tax|medicare|tax bracket/i,
  },
  {
    slug: "super-and-packaging",
    name: "Super and packaging",
    description: "Super paid on top, salary sacrifice, and salary packaging.",
    pattern: /super|salary sacrifice|salary packaging|salary package|smart ?salary/i,
  },
  {
    slug: "average-pay",
    name: "Average pay",
    description: "Full-time ordinary-time earnings for Australia, states, and industries.",
    pattern: /average|median|awote|ordinary time/i,
  },
  {
    slug: "hourly-conversion",
    name: "Hourly conversion",
    description: "Turn an hourly rate into a week, a fortnight, and a 52-week year.",
    pattern: /hourly|per hour|fortnight|calculator|annual|pro[- ]?rata|38[- ]hour/i,
  },
  {
    slug: "casual-loading",
    name: "Casual loading",
    description: "The 25% casual loading and how it changes the year.",
    pattern: /\bcasual\b/i,
  },
  {
    slug: "job-pay",
    name: "Job pay",
    description: "How to read a job’s hourly rate against a 38-hour Australian year.",
    pattern: /salary|wage|pay/i,
  },
];

export function topicsForKeyword(keyword: string): Topic[] {
  const matched = topics.filter((topic) => topic.pattern.test(keyword));
  if (matched.length) return matched;
  return topics.filter((topic) => topic.slug === "job-pay");
}

export function primaryTopic(keyword: string): Topic {
  return topicsForKeyword(keyword)[0] ?? topics[topics.length - 1]!;
}
