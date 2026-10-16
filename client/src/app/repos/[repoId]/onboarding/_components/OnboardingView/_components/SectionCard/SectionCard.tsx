"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import { s } from "../../styles";

/** Collapsible section: the heading (anchor target, focusable) wraps the toggle button. */
export function SectionCard({
  id,
  sectionKey,
  title,
  children,
}: {
  id: string;
  sectionKey: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(true);
  const bodyId = `${id}-body`;
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;
  return (
    <section style={s.card} data-onboarding-section={sectionKey}>
      <h2 id={id} tabIndex={-1} style={s.cardHeading}>
        <button
          type="button"
          style={s.cardToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <Chevron size={16} aria-hidden />
          {title}
        </button>
      </h2>
      <div id={bodyId} hidden={!open} style={s.cardBody}>
        {children}
      </div>
    </section>
  );
}
