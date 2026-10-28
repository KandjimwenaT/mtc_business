import { ThemeIcon } from "./theme-icon";
import alarmClockIcon from "../../assets/New Theme Icon/alarm-clock.svg";
import arrowRightLightIcon from "../../assets/New Theme Icon/arrow-right-1.svg";

export function BreachedSlaBanner({
  count,
  loading = false,
  onReview,
}: {
  count: number;
  loading?: boolean;
  onReview: () => void;
}) {
  const needsAttention = !loading && count > 0;
  const tone = needsAttention
    ? {
        panel: "border-rose-200 bg-red-50",
        accent: "text-rose-700",
        chip: "border-rose-200 text-rose-700",
        chipLabel: "Needs attention",
      }
    : {
        panel: "border-emerald-200 bg-emerald-50",
        accent: "text-emerald-700",
        chip: "border-emerald-200 text-emerald-700",
        chipLabel: "All clear",
      };

  return (
    <div className={`flex flex-col gap-3 rounded-xl border px-5 py-4 sm:flex-row sm:items-center ${tone.panel}`}>
      <div className="flex size-9 items-center justify-center rounded-lg bg-white">
        <ThemeIcon src={alarmClockIcon} className={`h-5 w-5 ${tone.accent}`} />
      </div>
      <p className={`text-3xl font-normal tabular-nums ${tone.accent}`}>{loading ? "—" : count.toLocaleString()}</p>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-800">Breached SLAs</p>
        <p className="mt-1 text-xs text-slate-500">
          {needsAttention ? "Open tickets past their SLA deadline" : "No open tickets past their SLA deadline"}
        </p>
      </div>
      {!loading && (
        <span className={`w-fit rounded-md border px-2 py-[5px] text-[10px] font-semibold ${tone.chip}`}>
          {tone.chipLabel}
        </span>
      )}
      <button
        type="button"
        onClick={onReview}
        className="inline-flex h-9 items-center gap-2 rounded-lg bg-sky-700 px-3 text-xs font-semibold text-white"
      >
        Review breached SLAs
        <ThemeIcon src={arrowRightLightIcon} className="h-4 w-4 text-white" />
      </button>
    </div>
  );
}
