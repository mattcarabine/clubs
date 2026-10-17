// The design system. Import from "~/components"; see CLAUDE.md "Visual design".
export { AppShell, crestUrl, NAV_ITEMS } from "./app-shell";
export { BarChart, type BarDatum } from "./charts/bar-chart";
export {
  ChartFrame,
  ChartLegend,
  type LegendEntry,
  MAX_SERIES,
  SERIES_COLORS,
} from "./charts/chart-frame";
export { LineChart, type LineSeries } from "./charts/line-chart";
export { Sparkline } from "./charts/sparkline";
export {
  StackedColumnChart,
  type StackedColumnSeries,
} from "./charts/stacked-column-chart";
export {
  DataTable,
  type DataTableColumn,
  type DataTableSort,
  numberColumn,
} from "./data-table";
export { DnfBadge } from "./dnf-badge";
export { EmptyState } from "./empty-state";
export { FilterBar } from "./filter-bar";
export { FormGuide } from "./form-guide";
export { HeadToHeadBar, type HeadToHeadRecord } from "./head-to-head-bar";
export { PageHeader, SectionHeading } from "./headings";
export { LastUpdatedBadge } from "./last-updated-badge";
export { MatchScoreBar } from "./match-score-bar";
export { OutcomeBadge } from "./outcome-badge";
export { PlayerChip } from "./player-chip";
export { ScoreBar, type ScoreBarSide } from "./score-bar";
export { LoadingState, Skeleton } from "./skeleton";
export { type StatDelta, StatGrid, StatTile } from "./stat-tile";
export { Ticker, type TickerItem } from "./ticker";
