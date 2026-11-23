import { Badge } from "./ui-components";

export function availabilityLabel(status: string | null | undefined) {
  return status === "out_of_office" ? "Out of office" : "Available";
}

export function AvailabilityBadge({ status }: { status: string | null | undefined }) {
  const out = status === "out_of_office";
  return (
    <Badge variant={out ? "danger" : "success"} className="text-xs">
      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${out ? "bg-red-600" : "bg-green-600"}`} />
      {availabilityLabel(status)}
    </Badge>
  );
}
