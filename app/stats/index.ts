/**
 * The stats read model: every page's numbers come from here (see README.md).
 *
 * Loaders import from "~/stats". Components that only need the filter or a
 * formula import "~/stats/filter" or "~/stats/formulas" directly, so the
 * client bundle never pulls in the query modules.
 */
export * from "./campaigns";
export * from "./campaigns-query";
export * from "./club-snapshot";
export * from "./coaching-brief";
export * from "./comparison";
export * from "./comparison-params";
export * from "./convert";
export * from "./divisions";
export * from "./ea-totals";
export * from "./filter";
export * from "./formulas";
export * from "./matches";
export * from "./opponents";
export * from "./outcome-split";
export * from "./outcome-split-query";
export * from "./player";
export * from "./player-profile";
export * from "./positions";
export * from "./recent-change";
export * from "./scope";
export * from "./seasons";
export * from "./session-brief";
export * from "./sessions";
export * from "./sessions-query";
export * from "./skill-rating";
export * from "./snapshots";
export * from "./source";
export * from "./squad";
export * from "./summaries";
export * from "./top-performers";
export * from "./trends";
export * from "./win-chance";
export * from "./win-chance-query";
