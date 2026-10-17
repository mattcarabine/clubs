/**
 * The stats read model: every page's numbers come from here (see README.md).
 *
 * Loaders import from "~/stats". Components that only need the filter or a
 * formula import "~/stats/filter" or "~/stats/formulas" directly, so the
 * client bundle never pulls in the query modules.
 */
export * from "./club-snapshot";
export * from "./convert";
export * from "./filter";
export * from "./formulas";
export * from "./matches";
export * from "./opponents";
export * from "./scope";
export * from "./snapshots";
export * from "./squad";
export * from "./summaries";
export * from "./top-performers";
