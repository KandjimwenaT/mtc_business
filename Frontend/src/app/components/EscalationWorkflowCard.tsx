import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface EscalationWorkflowCardProps {
  l1Hours?: number;
  l2Hours?: number;
  l3Hours?: number;
  sampleLabel?: string;
  /** 0–3. When set, that step is marked as the ticket's current place. */
  currentLevel?: number;
  ticketLabel?: string;
  selectionNote?: string;
  /** Single column under a ticket, instead of the side-by-side timeline. */
  stacked?: boolean;
}

const STEPS = [
  { level: 0, marker: "0", title: "Level 0", owner: "Admin / Executive" },
  { level: 1, marker: "L1", title: "Level 1", owner: "Supervisor" },
  { level: 2, marker: "L2", title: "Level 2", owner: "Management" },
  { level: 3, marker: "L3", title: "Level 3", owner: "GM" },
] as const;

export default function EscalationWorkflowCard({
  l1Hours = 24,
  l2Hours = 48,
  l3Hours = 72,
  sampleLabel,
  currentLevel,
  ticketLabel,
  selectionNote,
  stacked = false,
}: EscalationWorkflowCardProps) {
  const hoursFor = (level: number) => {
    if (level === 1) return l1Hours;
    if (level === 2) return l2Hours;
    if (level === 3) return l3Hours;
    return null;
  };

  const tracking = currentLevel != null && Number.isFinite(currentLevel);
  const activeLevel = tracking ? Math.min(3, Math.max(0, Math.round(currentLevel))) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalation Workflow</CardTitle>
        {ticketLabel ? (
          <p className="text-xs text-slate-700 mt-1 font-medium">{ticketLabel}</p>
        ) : null}
        {selectionNote ? (
          <p className="text-xs text-slate-500 mt-1">{selectionNote}</p>
        ) : sampleLabel ? (
          <p className="text-xs text-slate-500 mt-1">Based on {sampleLabel}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className={stacked
          ? "space-y-3"
          : "space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent"
        }>
          {STEPS.map((step) => {
            const isCurrent = activeLevel === step.level;
            const isPassed = activeLevel != null && step.level < activeLevel;
            const isUpcoming = activeLevel != null && step.level > activeLevel;
            const staticActive = !tracking && step.level <= 1;
            const faded = isUpcoming || (!tracking && !staticActive);
            const trigger = hoursFor(step.level);

            return (
              <div
                key={step.level}
                className={stacked
                  ? "flex items-center gap-3"
                  : "relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group"
                }
              >
                <div
                  className={`flex items-center justify-center w-10 h-10 rounded-full border border-white shadow shrink-0 z-10 font-bold ${
                    stacked ? "" : "md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2"
                  } ${
                    isCurrent
                      ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : isPassed
                        ? "bg-red-600 text-white"
                        : staticActive
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {step.marker}
                </div>
                <div
                  className={`${stacked ? "min-w-0 flex-1" : "w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)]"} p-4 rounded border shadow-sm ${
                    isCurrent
                      ? "border-blue-300 bg-blue-50"
                      : isPassed
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 bg-white"
                  } ${faded ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="font-bold text-slate-900 text-sm">{step.title}</div>
                    {isCurrent ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Current</span>
                    ) : isPassed ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700">Breached</span>
                    ) : null}
                  </div>
                  <div className={`text-xs ${isCurrent ? "text-slate-700 font-medium" : isPassed ? "text-red-800" : "text-slate-500"}`}>
                    {step.owner}
                  </div>
                  <div className={`text-xs mt-1 ${isCurrent ? "text-blue-600 font-semibold" : isPassed ? "text-red-600 font-semibold" : "text-slate-400"}`}>
                    {trigger == null ? "Before the first escalation" : `Trigger: ${trigger}h after log`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
