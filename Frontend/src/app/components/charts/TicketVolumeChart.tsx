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
import { ThemeIcon } from "../theme-icon";
import chartIcon from "../../../assets/New Theme Icon/chart-no-axes-combined.svg";
import arrowRightIcon from "../../../assets/New Theme Icon/arrow-right.svg";

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "14 days", value: 14 },
  { label: "30 days", value: 30 },
] as const;

const BAR_WIDTH = 44;

type TicketVolumeChartProps = {
  tickets: TicketRecord[];
  className?: string;
  title?: string;
  onViewTickets?: () => void;
};

function VolumeTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload as TicketVolumeDay | undefined;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md">
      <p className="text-xs font-medium text-slate-500">{getTicketVolumeTooltipLabel(row.date)}</p>
      <p className="mt-1 text-sm text-slate-900">
        <span className="font-semibold text-sky-700">{row.opened}</span> opened
      </p>
      <p className="text-sm text-slate-900">
        <span className="font-semibold text-[#60a5fa]">{row.resolved}</span> resolved
      </p>
    </div>
  );
}

export default function TicketVolumeChart({ tickets, className, title, onViewTickets }: TicketVolumeChartProps) {
  const [periodDays, setPeriodDays] = useState<(typeof PERIOD_OPTIONS)[number]["value"]>(14);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chartData = useMemo(
    () => buildTicketVolumeChartData(tickets, periodDays),
    [tickets, periodDays],
  );

  const chartWidth = Math.max(chartData.length * BAR_WIDTH, 280);
  const hasActivity = chartData.some((row) => row.opened > 0 || row.resolved > 0);
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

  const periodToggle = (
    <div className="flex w-fit gap-0.5 rounded-lg bg-slate-100 p-[3px]">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => setPeriodDays(option.value)}
          className={cn(
            "whitespace-nowrap rounded-md px-2 py-[5px] text-xs transition-colors",
            periodDays === option.value
              ? "bg-white font-semibold text-slate-800 outline outline-1 outline-slate-200"
              : "font-normal text-slate-500 hover:text-slate-700",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {title ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="whitespace-nowrap text-base font-normal text-slate-800">{title}</h3>
          {periodToggle}
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {periodToggle}
          <span className="text-xs text-slate-500">{rangeLabel}</span>
        </div>
      )}

      {title ? <p className="text-xs text-slate-500">{rangeLabel}</p> : null}

      {hasActivity ? (
        <div ref={scrollRef} className={cn("overflow-x-auto pb-1", title ? "h-40" : "h-[220px] sm:h-[300px]")}>
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
                <Bar dataKey="opened" name="Opened" fill="#0369a1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="resolved" name="Resolved" fill="#60a5fa" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="flex h-32 flex-col items-center justify-center gap-1.5 rounded-lg bg-slate-100 px-4 text-center">
          <ThemeIcon src={chartIcon} className="h-5 w-5 text-slate-400" />
          <p className="text-xs font-semibold text-slate-800">No ticket activity shown</p>
          <p className="text-xs text-slate-500">No opened or resolved activity is displayed for this period.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-sky-700" />
            Opened
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-blue-400" />
            Resolved
          </span>
        </div>
        {onViewTickets ? (
          <button type="button" onClick={onViewTickets} className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700">
            View tickets
            <ThemeIcon src={arrowRightIcon} className="h-3.5 w-3.5 text-sky-700" />
          </button>
        ) : chartData.length > 7 && hasActivity ? (
          <span className="text-slate-400">Scroll horizontally to explore earlier dates</span>
        ) : null}
      </div>

      <p className="text-[10px] font-normal text-slate-500">
        Opened counts tickets created that day. Resolved counts tickets closed that day.
      </p>
    </div>
  );
}
