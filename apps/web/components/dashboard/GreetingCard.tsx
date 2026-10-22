"use client";

import { useEffect, useState } from "react";
import { Moon, Sunrise, Sun, Sunset } from "lucide-react";

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
const NEUTRAL_LINE = "Here's where things stand today.";

function GreetingIcon({ timeOfDay }: { timeOfDay: TimeOfDay | null }) {
  if (timeOfDay === null) return <Sun size={18} color="#FDE68A" />;
  if (timeOfDay === "night") return <Moon size={18} color="#C7D2FE" fill="#C7D2FE" />;
  if (timeOfDay === "morning") return <Sunrise size={18} color="#FDE68A" />;
  if (timeOfDay === "afternoon") return <Sun size={18} color="#FDE68A" fill="#FDE68A" />;
  return <Sunset size={18} color="#FDBA74" />;
}

const WORKSPACE_LINE: Record<TimeOfDay, string> = {
  morning: "Here's where things stand today.",
  afternoon: "Here's how things are tracking.",
  evening: "Here's a look before you wrap up.",
  night: "Everything's quiet — here's the snapshot.",
};

/**
 * Setu's greeting card, made hydration-safe. Setu computed the time of day
 * with `new Date()` in the render body; for a "use client" component that runs
 * once on the server (server clock/timezone) and again on hydration (the
 * viewer's), and whenever the two land in different parts of the day the
 * greeting text diverges — "Hydration failed because the server rendered
 * text...". Here the time of day is resolved AFTER mount, in an effect, so the
 * server and the first client render both emit the same neutral greeting, and
 * the viewer then sees the greeting for THEIR local time (a server-supplied
 * hour would hydrate cleanly but be wrong for anyone in another timezone).
 * Same approach as CalendarCard.
 */
export function GreetingCard({ name }: { name: string }) {
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(null);

  useEffect(() => {
    setTimeOfDay(getTimeOfDay(new Date()));
  }, []);

  return (
    <div
      className="
        flex h-full min-h-[5.5rem] w-full flex-col justify-between gap-1.5 rounded-[1rem]
        border border-white/10 bg-[var(--accent-solid)] p-[clamp(0.625rem,3.5cqi,0.875rem)]
      "
      style={{ boxShadow: "var(--card-shadow)", containerType: "inline-size" }}
    >
      <p className="flex items-center gap-1.5 text-[clamp(0.8125rem,4cqi,0.9375rem)] text-white/70">
        <GreetingIcon timeOfDay={timeOfDay} />
        {timeOfDay ? GREETING_TEXT[timeOfDay] : NEUTRAL_GREETING}
      </p>
      {/* A long name (or a name with no spaces) wraps onto at most two lines
          and then ellipsises, instead of running out of the card; the full
          name stays available on hover. */}
      <p
        title={name}
        className="line-clamp-2 min-w-0 text-[clamp(1.125rem,7cqi,1.5rem)] font-semibold leading-tight tracking-tight text-white [overflow-wrap:anywhere]"
      >
        {name}
      </p>
      <p className="text-[clamp(0.75rem,4cqi,0.875rem)] text-white/60">{timeOfDay ? WORKSPACE_LINE[timeOfDay] : NEUTRAL_LINE}</p>
    </div>
  );
}
