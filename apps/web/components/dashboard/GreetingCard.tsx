"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Sunrise, Sunset } from "lucide-react";

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

function getTimeOfDay(date: Date): TimeOfDay {
  const hour = date.getHours();
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

const GREETING_TEXT: Record<TimeOfDay, string> = {
  morning: "Good Morning,",
  afternoon: "Good Afternoon,",
  evening: "Good Evening,",
  night: "Good Night,",
};

// Shown until the viewer's clock is known (server render + first client render).
const NEUTRAL_GREETING = "Hello,";

// A small icon for the time of day, as tall as the text beside it (1em). Left out until the viewer's clock is known.
const ICON_CLASS = "mr-2 inline-block shrink-0 align-[-0.12em]";
function GreetingIcon({ timeOfDay }: { timeOfDay: TimeOfDay | null }) {
  if (timeOfDay === null) return null;
  if (timeOfDay === "night") return <Moon size="1em" className={ICON_CLASS} color="var(--status-info-fg)" fill="var(--status-info-fg)" />;
  if (timeOfDay === "morning") return <Sunrise size="1em" className={ICON_CLASS} color="var(--kpi-warn)" />;
  if (timeOfDay === "afternoon") return <Sun size="1em" className={ICON_CLASS} color="var(--kpi-warn)" fill="var(--kpi-warn)" />;
  return <Sunset size="1em" className={ICON_CLASS} color="var(--kpi-warn)" />;
}

// The name is filled with a blue-to-purple gradient (the theme's own chart colours, so it also works in dark mode).
const NAME_GRADIENT = {
  backgroundImage: "linear-gradient(90deg, var(--chart-1), var(--chart-5))",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
} as const;

/**
 * The dashboard greeting: one line of plain text above the numbers, e.g. "[sun] Good Afternoon, Dhruv Singla".
 * The greeting follows the viewer's local time (morning, afternoon, evening, night). Setu's greeting made hydration-safe.
 * Setu computed the time of day with `new Date()` in the render body; for a "use client" component that runs
 * once on the server (server clock/timezone) and again on hydration (the viewer's), and whenever the two land
 * in different parts of the day the greeting text diverges — "Hydration failed because the server rendered
 * text...". Here the time of day is resolved AFTER mount, in an effect, so the server and the first client
 * render both emit the same neutral greeting, and the viewer then sees the greeting for THEIR local time
 * (a server-supplied hour would hydrate cleanly but be wrong for anyone in another timezone).
 * Same approach as CalendarCard.
 */
export function GreetingCard({ name }: { name: string }) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);

  useEffect(() => {
    setTimeOfDay(getTimeOfDay(new Date()));
  }, []);

  // A long name (or a name with no spaces) wraps onto at most two lines and then ellipsises,
  // instead of running out of the page; the full name stays available on hover.
  return (
    <h1
      title={name}
      className="line-clamp-2 min-w-0 text-[1.625rem] font-bold leading-tight tracking-tight text-[var(--text-heading)] [overflow-wrap:anywhere]"
    >
      <GreetingIcon timeOfDay={timeOfDay} />
      {timeOfDay ? GREETING_TEXT[timeOfDay] : NEUTRAL_GREETING} <span style={NAME_GRADIENT}>{name}</span>
    </h1>
  );
}
