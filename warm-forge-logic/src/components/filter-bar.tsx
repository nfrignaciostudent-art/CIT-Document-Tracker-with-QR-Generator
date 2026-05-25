import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statusOrder, type DocStatus } from "@/lib/dashboard-utils";

export function FilterBar({
  query,
  onQuery,
  status,
  onStatus,
}: {
  query: string;
  onQuery: (v: string) => void;
  status: DocStatus | "all";
  onStatus: (v: DocStatus | "all") => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-3 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search by display ID, name, or owner…"
          className="h-10 rounded-xl bg-muted/40 pl-9"
        />
      </div>
      <Select value={status} onValueChange={(v) => onStatus(v as DocStatus | "all")}>
        <SelectTrigger className="h-10 w-full rounded-xl sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {statusOrder().map((s) => (
            <SelectItem key={s} value={s}>
              {s}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
