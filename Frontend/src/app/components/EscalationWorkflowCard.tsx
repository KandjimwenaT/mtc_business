import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";

interface EscalationWorkflowCardProps {
  l1Hours?: number;
  l2Hours?: number;
  l3Hours?: number;
  sampleLabel?: string;
}

export default function EscalationWorkflowCard({
  l1Hours = 24,
  l2Hours = 48,
  l3Hours = 72,
  sampleLabel,
}: EscalationWorkflowCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalation Workflow</CardTitle>
        {sampleLabel ? (
          <p className="text-xs text-slate-500 mt-1">Based on {sampleLabel}</p>
        ) : null}
      </CardHeader>
      <CardContent>
        <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-500 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              0
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-slate-900 text-sm">Level 0</div>
              </div>
              <div className="text-slate-500 text-xs">Admin / Executive</div>
              <div className="text-slate-400 text-xs mt-1">SLA Target &lt; 100%</div>
            </div>
          </div>

          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-blue-100 text-blue-600 font-bold shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              L1
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-blue-200 bg-blue-50 shadow-sm">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-slate-900 text-sm">Level 1</div>
              </div>
              <div className="text-slate-700 text-xs font-medium">Supervisor</div>
              <div className="text-blue-600 text-xs mt-1 font-semibold">
                Trigger: {l1Hours}h after log
              </div>
            </div>
          </div>

          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              L2
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm opacity-60">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-slate-900 text-sm">Level 2</div>
              </div>
              <div className="text-slate-500 text-xs">Management</div>
              <div className="text-slate-400 text-xs mt-1">Trigger: {l2Hours}h after log</div>
            </div>
          </div>

          <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
            <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-100 text-slate-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
              L3
            </div>
            <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded border border-slate-200 bg-white shadow-sm opacity-60">
              <div className="flex items-center justify-between space-x-2 mb-1">
                <div className="font-bold text-slate-900 text-sm">Level 3</div>
              </div>
              <div className="text-slate-500 text-xs">GM CRM</div>
              <div className="text-slate-400 text-xs mt-1">Trigger: {l3Hours}h after log</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
