"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput, Badge, IconBtn, Checkbox, EmptyState } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills } from "@/lib/hooks";
import { toLinkedIds, toDisplayOrder, filterSkills, toggleLinked, moveLinked } from "./helpers";
import { s } from "./styles";

/** Skills tab — attach/detach workspace skills and order the linked ones
 *  (prompt-assembly order). Full-replace endpoint: every toggle/reorder sends
 *  the whole next ordered id list. */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const [filter, setFilter] = React.useState("");

  const { data: skills } = useSkills();
  const { data: links } = useAgentSkills(agent.id);
  const setSkills = useSetAgentSkills(agent.id);

  const allSkills = skills ?? [];
  const linkedIds = toLinkedIds(links ?? []);
  const linkedSet = new Set(linkedIds);

  // Row order freezes on first load: a checkbox toggle must not jump the row
  // to the top/bottom mid-click (disorienting, invites a misclick on the next
  // item). Only the explicit up/down arrows move a row after that.
  const [rowOrder, setRowOrder] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    if (rowOrder === null && skills && links) {
      setRowOrder(toDisplayOrder(allSkills, linkedIds).map((sk) => sk.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skills, links]);

  const bySkillId = new Map(allSkills.map((sk) => [sk.id, sk]));
  const ordered = (rowOrder ?? toDisplayOrder(allSkills, linkedIds).map((sk) => sk.id))
    .map((id) => bySkillId.get(id))
    .filter((sk): sk is (typeof allSkills)[number] => !!sk);
  const visible = filterSkills(ordered, filter);

  const toggle = (skillId: string) => {
    if (setSkills.isPending) return;
    const wasLinked = linkedIds.includes(skillId);
    setSkills.mutate(toggleLinked(linkedIds, skillId));
    // Detach: row stays put, just greys out — no jump.
    // Attach: the API appends it after the last already-linked skill, so move
    // the row there too — the one jump that's expected, not a startling one.
    if (!wasLinked) {
      setRowOrder((prev) => {
        if (!prev) return prev;
        const withoutIt = prev.filter((id) => id !== skillId);
        let insertAt = 0;
        withoutIt.forEach((id, i) => {
          if (linkedIds.includes(id)) insertAt = i + 1;
        });
        return [...withoutIt.slice(0, insertAt), skillId, ...withoutIt.slice(insertAt)];
      });
    }
  };
  const move = (skillId: string, dir: -1 | 1) => {
    if (setSkills.isPending) return;
    const neighborId = linkedIds[linkedIds.indexOf(skillId) + dir];
    setSkills.mutate(moveLinked(linkedIds, skillId, dir));
    // Mirror the swap in the frozen row order so the two rows visibly trade
    // places — the arrow's whole point is a visible move, unlike a toggle.
    if (neighborId) {
      setRowOrder((prev) => {
        if (!prev) return prev;
        const a = prev.indexOf(skillId);
        const b = prev.indexOf(neighborId);
        if (a < 0 || b < 0) return prev;
        const next = [...prev];
        [next[a], next[b]] = [next[b]!, next[a]!];
        return next;
      });
    }
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerRow}>
          <h2 style={s.h2}>{t("skills.title")}</h2>
          <span style={s.count}>{t("skills.enabledCount", { linked: linkedIds.length, total: allSkills.length })}</span>
        </div>
        <p style={s.hint}>{t("skills.orderHint")}</p>
      </div>

      {allSkills.length === 0 ? (
        <EmptyState icon="Sparkles" title={t("skills.emptyTitle")} />
      ) : (
        <>
          <div style={s.filter}>
            <TextInput value={filter} onChange={setFilter} placeholder={t("skills.filterPlaceholder")} />
          </div>
          <div style={s.list}>
            {visible.map((sk) => {
              const isLinked = linkedSet.has(sk.id);
              const idx = linkedIds.indexOf(sk.id);
              return (
                <div key={sk.id} style={s.row}>
                  <Checkbox checked={isLinked} onChange={() => toggle(sk.id)} />
                  <span style={s.name}>{sk.name}</span>
                  <Badge>{sk.type}</Badge>
                  {isLinked && (
                    <div style={s.reorder}>
                      {idx > 0 && (
                        <IconBtn icon="ArrowUp" label={t("skills.moveUp")} size={24} onClick={() => move(sk.id, -1)} />
                      )}
                      {idx < linkedIds.length - 1 && (
                        <IconBtn
                          icon="ArrowDown"
                          label={t("skills.moveDown")}
                          size={24}
                          onClick={() => move(sk.id, 1)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
