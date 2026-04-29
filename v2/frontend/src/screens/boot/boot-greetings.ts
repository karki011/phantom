// Author: Subash Karki

interface GreetingBucket {
  startHour: number;
  endHour: number;
  lines: string[];
}

const buckets: GreetingBucket[] = [
  {
    startHour: 5,
    endHour: 8,
    lines: [
      'Early start. The best hunters rise before the world wakes.',
      'Dawn detected. Neural pathways sharpening.',
      'The early operator catches the cleanest builds.',
      'Pre-dawn protocols online. The streets are still yours.',
      'First light. Compilers warming.',
      'Sunrise window. Signal clear, channels open.',
      'Quiet hours fading. Ship before the noise arrives.',
      'Cold boot, sharp mind. Advantage acquired.',
      'The grid is empty. Move while it lasts.',
      'Operator online ahead of schedule. Noted.',
      'Dawn patrol engaged. No witnesses, no friction.',
      'Birds and build servers. The only company you need.',
    ],
  },
  {
    startHour: 8,
    endHour: 12,
    lines: [
      'Morning protocols engaged. Ready to hunt.',
      'A fresh cycle begins. What will you build today?',
      'Systems warm. Coffee recommended.',
      'Standard ops window open. Pick your target.',
      'Morning shift initialized. Output expected.',
      'The day is provisioned. Allocate it well.',
      'Inbox can wait. The terminal cannot.',
      'Caffeine detected, focus pending.',
      'Daylight protocols active. Move with intent.',
      'Fresh buffer, empty queue. Begin.',
      'Standups end, real work starts.',
      'The world is waking. You are already three steps ahead.',
    ],
  },
  {
    startHour: 12,
    endHour: 14,
    lines: [
      'Midday checkpoint. Energy reserves holding.',
      'Afternoon shift initiated. Momentum is everything.',
      'Lunch is a suggestion. Shipping is the law.',
      'Halfway through. Hold the line.',
      'Sun is high. Standards stay higher.',
      'Refuel detected. Resume operations.',
      'Midday recalibration. Course correct, then push.',
      'Twelve hundred hours. The day pivots on what you do next.',
      'Half the day burned, half the wins ahead.',
      'Solar peak. So is the focus window.',
      'Cycle midpoint. Every commit counts double from here.',
      'Brief downtime over. Re-engage.',
    ],
  },
  {
    startHour: 14,
    endHour: 17,
    lines: [
      'Deep focus window detected. Distractions suppressed.',
      'The afternoon push. Ship something great.',
      'Peak operational hours. All systems at your command.',
      'The post-lunch lull is a myth. Disprove it.',
      'Quiet hours, loud output.',
      'Prime time. Run your hardest task.',
      'Afternoon protocols locked in. No interruptions tolerated.',
      'The 3pm window. Where careers compound.',
      'Calendar clear, terminal open. Strike.',
      'Deep work sanctioned. Slack notifications muted by decree.',
      'You found the flow state. Do not announce it.',
      'High-bandwidth hours. Spend them on the hard problem.',
    ],
  },
  {
    startHour: 17,
    endHour: 21,
    lines: [
      'Evening session. The quiet hours produce the best code.',
      'Night approaches. Some operators do their best work in the dark.',
      'Golden hour. The system is yours.',
      'Daylight retreating. Focus advancing.',
      'Standups long over. Real engineering begins.',
      'After hours, no audience. Just the work.',
      'The good ideas tend to arrive when the office empties.',
      'Twilight protocols engaged. Lower the lights, raise the standard.',
      'Most operators are off the clock. You are not most operators.',
      'Sundown shift. The compiler does not care what time it is.',
      'Calls done, channels quiet. Window open.',
      'Evening window detected. Protect it.',
    ],
  },
  {
    startHour: 21,
    endHour: 5,
    lines: [
      'Late night detected. Respect the grind, Operator.',
      'The world sleeps. We do not.',
      'Night ops. Running dark. All systems quiet.',
      'Burning the midnight oil. The system stands with you.',
      'Hours past curfew. Productivity off the books.',
      'Graveyard shift online. No one watching but the linter.',
      'Dark mode is not a setting. It is a lifestyle.',
      'The grid is asleep. The work is not.',
      'Night cycle engaged. Caffeine levels critical.',
      'Stars out. Terminal up. Standard operating procedure.',
      'After-hours protocols. Discretion advised.',
      'Quiet city, loud keyboard.',
      'The hour is suspect. The output is not.',
      'Midnight window. Where the legends ship.',
    ],
  },
];

const findBucket = (hour: number): GreetingBucket => {
  for (const bucket of buckets) {
    const { startHour, endHour } = bucket;
    if (startHour < endHour) {
      if (hour >= startHour && hour < endHour) return bucket;
    } else if (hour >= startHour || hour < endHour) {
      return bucket;
    }
  }
  return buckets[buckets.length - 1];
};

export function getGreeting(name?: string): string {
  const hour = new Date().getHours();
  const bucket = findBucket(hour);
  const line = bucket.lines[Math.floor(Math.random() * bucket.lines.length)];
  const firstName = name?.trim().split(/\s+/)[0];
  return firstName ? `Welcome back, ${firstName}. ${line}` : line;
}
