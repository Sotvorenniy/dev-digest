"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { formatCost, formatTokensTotal } from "./helpers";
import { s } from "./styles";

/**
 * What a review run (or a whole PR) cost in USD.
 *
 * Two variants because the number lands in two different shapes:
 *   `cell`   — the PR list's COST column: one aggregate figure per PR.
 *   `inline` — a run row on the PR timeline: "9 119 tok · $0.0013", sitting
 *              under the timestamp.
 *
 * An unknown cost always renders "—", never "$0.00": an unpriced model slug and
 * a run that never reached the model are both "we don't know", and showing them
 * as free would be a lie. A genuinely free model (price 0) still renders "$0.00"
 * — that one IS a fact.
 */
export function RunCostBadge({
  variant,
  usd,
  tokensIn = null,
  tokensOut = null,
  title,
}: {
  variant: "cell" | "inline";
  usd: number | null | undefined;
  /** `inline` only — omitted, the badge shows the cost alone. */
  tokensIn?: number | null;
  tokensOut?: number | null;
  title?: string;
}) {
  const t = useTranslations("prReview");
  const known = usd != null;
  const cost = formatCost(usd);

  if (variant === "cell") {
    return (
      <span
        className="mono"
        style={s.cell(known)}
        title={title ?? (known ? t("cost.title") : t("cost.unknown"))}
      >
        {cost}
      </span>
    );
  }

  // The cost slot always renders — "—" when unknown, so it is never confused
  // with a free run. Only the token half disappears when there is no usage.
  const tokens = formatTokensTotal(tokensIn, tokensOut);
  return (
    <span style={s.inline} title={known ? undefined : t("cost.unknown")}>
      {tokens ? `${t("cost.tokens", { tokens })} · ` : null}
      {cost}
    </span>
  );
}

export default RunCostBadge;
