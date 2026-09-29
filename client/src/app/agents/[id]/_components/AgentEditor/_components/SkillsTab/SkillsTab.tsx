"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TextInput, Badge, Button, IconBtn, Checkbox, EmptyState, Icon, Toggle } from "@devdigest/ui";
import type { Agent, Skill } from "@devdigest/shared";
import { useSkills, useAgentSkills, useSetAgentSkills, useUpdateSkill } from "@/lib/hooks";
import { ImportSkillDrawer } from "@/components/import-skill-drawer";
import {
  toLinkedIds,
  toDisplayOrder,
  filterSkills,
  toggleLinked,
  moveLinked,
  isReorderable,
  reorderLinked,
  applyLinkedOrder,
} from "./helpers";
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
  const updateSkill = useUpdateSkill();
  const [importing, setImporting] = React.useState(false);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [overId, setOverId] = React.useState<string | null>(null);

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
  const baseOrder = rowOrder ?? toDisplayOrder(allSkills, linkedIds).map((sk) => sk.id);
  // Skills created after the order froze (e.g. just imported) land at the end.
  const knownIds = new Set(baseOrder);
  const fullOrder = [...baseOrder, ...allSkills.filter((sk) => !knownIds.has(sk.id)).map((sk) => sk.id)];
  const ordered = fullOrder
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
  const commitOrder = (next: string[]) => {
    setSkills.mutate(next);
    // Linked rows trade slots; unlinked rows never move.
    setRowOrder((prev) => (prev ? applyLinkedOrder(prev, next) : prev));
  };
  const move = (skillId: string, dir: -1 | 1) => {
    if (setSkills.isPending) return;
    commitOrder(moveLinked(linkedIds, skillId, dir));
  };
  const drop = (targetId: string) => {
    const from = dragId;
    setDragId(null);
    setOverId(null);
    if (!from || setSkills.isPending) return;
    const next = reorderLinked(linkedIds, allSkills, from, targetId);
    if (next) commitOrder(next);
  };
  const onImported = (skill: Skill) => {
    setSkills.mutate([...linkedIds, skill.id]);
    setRowOrder((prev) => (prev && !prev.includes(skill.id) ? [...prev, skill.id] : prev));
  };

  return (
    <div style={s.wrap}>
      {importing && <ImportSkillDrawer initialTab="file" onClose={() => setImporting(false)} onImported={onImported} />}
      <div style={s.header}>
        <div style={s.headerRow}>
          <h2 style={s.h2}>{t("skills.title")}</h2>
          <span style={s.count}>{t("skills.enabledCount", { linked: linkedIds.length, total: allSkills.length })}</span>
          <div style={s.headerActions}>
            <Button kind="secondary" size="sm" icon="Upload" onClick={() => setImporting(true)}>
              {t("skills.importSkill")}
            </Button>
          </div>
        </div>
        <p style={s.hint}>{t("skills.orderHint")}</p>
        <p style={s.importedHint}>{t("skills.importedHint")}</p>
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
              const canDrag = isReorderable(sk, linkedIds);
              return (
                <div
                  key={sk.id}
                  data-skill-row
                  data-skill-id={sk.id}
                  draggable={canDrag}
                  onDragStart={(e) => {
                    if (!canDrag) return e.preventDefault();
                    e.dataTransfer?.setData("text/plain", sk.id);
                    setDragId(sk.id);
                  }}
                  onDragOver={(e) => {
                    if (dragId && canDrag) {
                      e.preventDefault();
                      setOverId(sk.id);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    drop(sk.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverId(null);
                  }}
                  style={s.row(canDrag, overId === sk.id && dragId !== sk.id)}
                >
                  <span
                    style={s.handle(canDrag)}
                    title={canDrag ? t("skills.dragHandle") : isLinked ? t("skills.disabledNoDrag") : undefined}
                  >
                    <Icon.Menu size={14} />
                  </span>
                  <Checkbox checked={isLinked} onChange={() => toggle(sk.id)} label={<span style={s.srOnly}>{t("skills.attach", { name: sk.name })}</span>} />
                  <span style={s.name}>{sk.name}</span>
                  <Badge>{sk.type}</Badge>
                  <Toggle
                    on={sk.enabled}
                    onChange={(enabled) => updateSkill.mutate({ id: sk.id, patch: { enabled } })}
                    size={14}
                  />
                  {isLinked && sk.enabled && (
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
