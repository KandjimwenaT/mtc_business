import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { TicketRecord } from "../../api/ticketApi";
import {
  buildTicketVolumeChartData,
  getTicketVolumeTooltipLabel,
  type TicketVolumeDay,
} from "../../utils/ticketVolumeChart";
import { cn } from "../ui-components";

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
] as const;

const BAR_WIDTH = 44;

type TicketVolumeChartProps = {
  tickets: TicketRecord[];
  className?: string;
};

function VolumeTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as TicketVolumeDay | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-500">{getTicketVolumeTooltipLabel(row.date)}</p>
      <p className="mt-1 text-sm text-slate-900">
        <span className="font-semibold text-[#0072CE]">{row.opened}</span> opened
      </p>
      <p className="text-sm text-slate-900">
        <span className="font-semibold text-[#60a5fa]">{row.resolved}</span> resolved
      </p>
    </div>
  );
}

export default function TicketVolumeChart({ tickets, className }: TicketVolumeChartProps) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIOD_OPTIONS)[number]["value"]>(14);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(
    () => buildTicketVolumeChartData(tickets, periodDays),
    [tickets, periodDays],
  );

  const chartWidth = Math.max(chartData.length * BAR_WIDTH, 280);
  const rangeLabel =
    chartData.length > 0
      ? `${getTicketVolumeTooltipLabel(chartData[0].date)} – ${getTicketVolumeTooltipLabel(
          chartData[chartData.length - 1].date,
        )}`
      : "";

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollLeft = node.scrollWidth;
  }, [periodDays, chartData.length]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriodDays(option.value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                periodDays === option.value
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <span className="text-xs text-slate-500">{rangeLabel}</span>
      </div>

      <p className="text-xs text-slate-400">
        Opened counts tickets created that day. Resolved counts tickets closed that day.
      </p>

      <div ref={scrollRef} className="h-[220px] sm:h-[300px] overflow-x-auto pb-1">
        <div style={{ width: chartWidth, height: "100%" }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={2} barCategoryGap="16%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="label"
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                interval={0}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip cursor={{ fill: "rgba(226, 232, 240, 0.4)" }} content={<VolumeTooltip />} />
              <Bar dataKey="opened" name="Opened" fill="#0072CE" radius={[4, 4, 0, 0]} />
              <Bar dataKey="resolved" name="Resolved" fill="#60a5fa" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#0072CE]" />
            Opened
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#60a5fa]" />
            Resolved
          </span>
        </div>
        {chartData.length > 7 ? (
          <span className="text-slate-400">Scroll horizontally to explore earlier dates</span>
        ) : null}
      </div>
    </div>
  );
}
