"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useDeriveIntent, useIntent } from "@/lib/hooks/intent";
import type { PrIntentRecord } from "@/lib/types";
import { LEVEL_COLORS } from "./constants";
import { confidenceLevel, hasUnfetchedSpec } from "./helpers";
import { s } from "./styles";

function ScopeList({ label, items }: { label: string; items: string[] }) {
  const t = useTranslations("intent");
  return (
    <div style={s.column}>
      <div style={s.listLabel}>{label}</div>
      {items.length === 0 ? (
        <span style={s.none}>{t("none")}</span>
      ) : (
        <ul style={s.list}>
          {items.map((it, i) => (
            <li key={i}>{it}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IntentBody({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("intent");
  const level = confidenceLevel(intent.confidence);
  const sources = intent.sources ?? [];
  const requirements = intent.requirements ?? [];
  return (
    <>
      <p style={s.intentText}>{intent.intent}</p>
      <div style={s.badges}>
        {intent.change_type && <Badge>{t(`changeType.${intent.change_type}`)}</Badge>}
        <span data-intent-confidence={level}>
          <Badge color={LEVEL_COLORS[level].color} bg={LEVEL_COLORS[level].bg}>
            {t(`confidence.${level}`)}
          </Badge>
        </span>
        {intent.basis && (
          <span data-intent-basis={intent.basis}>
            <Badge>{t(`basis.${intent.basis}`)}</Badge>
          </span>
        )}
      </div>
      <span style={s.disclaimer}>{t("disclaimer")}</span>
      {hasUnfetchedSpec(sources) && (
        <div style={s.warning}>
          <Icon.AlertTriangle size={14} />
          <span>{t("specUnverified")}</span>
        </div>
      )}
      <div style={s.columns}>
        <ScopeList label={t("inScope")} items={intent.in_scope} />
        <ScopeList label={t("outOfScope")} items={intent.out_of_scope} />
      </div>
      {requirements.length > 0 && (
        <div>
          <div style={s.listLabel}>{t("requirements")}</div>
          <ul style={s.list}>
            {requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {sources.length > 0 && (
        <div>
          <div style={s.listLabel}>{t("sources")}</div>
          {sources.map((src) => (
            <div key={src.id} style={s.sourceRow} data-intent-source={src.id}>
              <Badge>{t(`sourceKind.${src.kind}`)}</Badge>
              <span className="mono" style={s.sourceRef}>
                {src.ref}
              </span>
              <span style={s.muted}>{src.fetched ? t("fetched") : t("notFetched")}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function IntentCard({ prId }: { prId: string }) {
  const t = useTranslations("intent");
  const { data: intent, isLoading } = useIntent(prId);
  const derive = useDeriveIntent(prId);

  return (
    <section data-intent-card style={s.card}>
      <SectionLabel
        icon="Sparkles"
        right={
          <span data-intent-derive>
            <Button
              size="sm"
              icon={intent ? "RefreshCw" : "Sparkles"}
              loading={derive.isPending}
              disabled={isLoading || derive.isPending}
              onClick={() => derive.mutate(!!intent)}
            >
              {intent ? t("rederive") : t("derive")}
            </Button>
          </span>
        }
      >
        {t("title")}
      </SectionLabel>
      {isLoading ? (
        <Skeleton height={60} />
      ) : intent ? (
        <IntentBody intent={intent} />
      ) : (
        <span style={s.none}>{derive.isPending ? t("loading") : t("empty")}</span>
      )}
      {derive.isError && <span style={s.warning}>{t("error")}</span>}
    </section>
  );
}
