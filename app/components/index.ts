// The design system. Import from "~/components"; see CLAUDE.md "Visual design".
export { AppShell, crestUrl, NAV_ITEMS } from "./app-shell";
export { BarChart, type BarDatum } from "./charts/bar-chart";
export {
  ChartFrame,
  ChartLegend,
  type LegendEntry,
  MAX_SERIES,
  SERIES_COLORS,
  type SeriesColor,
} from "./charts/chart-frame";
export { LineChart, type LineSeries } from "./charts/line-chart";
export { Sparkline } from "./charts/sparkline";
export {
  StackedColumnChart,
  type StackedColumnSeries,
} from "./charts/stacked-column-chart";
export { Chip, ChipGroup, chipClassName } from "./chip";
export {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  numberColumn,
  type RowSelection,
} from "./data-table";
export { DnfBadge } from "./dnf-badge";
export { EmptyState } from "./empty-state";
export { FilterBar } from "./filter-bar";
export { FormGuide } from "./form-guide";
export { HeadToHeadBar, type HeadToHeadRecord } from "./head-to-head-bar";
export { PageHeader, SectionHeading } from "./headings";
export { LastUpdatedBadge } from "./last-updated-badge";
export { LondonTime } from "./london-time";
export { MatchScoreBar } from "./match-score-bar";
export { OutcomeBadge } from "./outcome-badge";
export { PlayerChip } from "./player-chip";
export {
  EA_POSITIONS_DISABLED,
  PositionGroupPicker,
} from "./position-group-picker";
export { BackLink, isNotFound, RouteError } from "./route-error";
export {
  LINKED_ROW,
  LINKED_ROW_HEADER,
  ROW_HEADER_LINK,
  useRowLink,
} from "./row-link";
export { ScoreBar, type ScoreBarSide } from "./score-bar";
export { ScrollRail } from "./scroll-rail";
export { LoadingState, Skeleton } from "./skeleton";
export { type StatDelta, StatGrid, StatTile } from "./stat-tile";
export { Ticker, type TickerItem } from "./ticker";
