import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "../../components/ui/dropdown-menu";
import {
  type SessionFilters,
  sessionTypeLabels
} from "../../lib/session-organization";

const typeOptions = ["all", "chat", "code", "work", "agent"] as const;
const activityOptions = ["all", "today", "7d", "30d"] as const;
const groupOptions = ["none", "activity", "type"] as const;

const activityLabels = { all: "All", today: "Today", "7d": "Last 7 days", "30d": "Last 30 days" };
const groupLabels = { none: "None", activity: "Last activity", type: "Type" };

export function SessionFilterMenu(props: {
  filters: SessionFilters;
  onChange: (filters: SessionFilters) => void;
  trigger: "icon" | "button";
}) {
  const update = <Key extends keyof SessionFilters>(key: Key, value: SessionFilters[Key]) => {
    props.onChange({ ...props.filters, [key]: value });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {props.trigger === "icon" ? (
          <Button variant="ghost" size="icon-sm" aria-label="Filter and group recent sessions" title="Filter and group">
            <SlidersHorizontalIcon />
          </Button>
        ) : (
          <Button variant="outline">
            Filter by {props.filters.type === "all" ? "All" : sessionTypeLabels[props.filters.type]}
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 p-2">
        <FilterSubmenu
          label="Type"
          valueLabel={props.filters.type === "all" ? "All" : sessionTypeLabels[props.filters.type]}
          value={props.filters.type}
          options={typeOptions.map((value) => ({ value, label: value === "all" ? "All" : sessionTypeLabels[value] }))}
          onChange={(value) => update("type", value as SessionFilters["type"])}
        />
        <FilterSubmenu
          label="Last activity"
          valueLabel={activityLabels[props.filters.activity]}
          value={props.filters.activity}
          options={activityOptions.map((value) => ({ value, label: activityLabels[value] }))}
          onChange={(value) => update("activity", value as SessionFilters["activity"])}
        />
        <DropdownMenuSeparator className="my-2" />
        <FilterSubmenu
          label="Group by"
          valueLabel={groupLabels[props.filters.groupBy]}
          value={props.filters.groupBy}
          options={groupOptions.map((value) => ({ value, label: groupLabels[value] }))}
          onChange={(value) => update("groupBy", value as SessionFilters["groupBy"])}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterSubmenu(props: {
  label: string;
  valueLabel: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="px-2 py-2 text-base">
        <span>{props.label}</span>
        <span className="ml-auto text-[var(--color-muted)]">{props.valueLabel}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-44 p-1.5">
        <DropdownMenuRadioGroup value={props.value} onValueChange={props.onChange}>
          {props.options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="px-2 py-1.5">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
