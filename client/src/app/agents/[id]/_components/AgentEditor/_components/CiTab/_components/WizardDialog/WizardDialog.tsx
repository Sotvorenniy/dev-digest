/* WizardDialog — own dialog shell: modal role, focus trap, Escape to close. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { s } from "../../styles";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function WizardDialog({
  step,
  titleId,
  title,
  onClose,
  children,
  footer,
}: {
  /** Changing it re-focuses the dialog: the focused button of the old step unmounts. */
  step: number;
  titleId: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  const t = useTranslations("ci");
  const boxRef = React.useRef<HTMLDivElement>(null);

  // The one legitimate DOM sync: focus the first control on mount and on every step change.
  React.useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const first = box.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box).focus();
  }, [step]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(boxRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === boxRef.current || !boxRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div style={s.overlay} data-ci-wizard-overlay>
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={s.dialog}
        onKeyDown={onKeyDown}
        data-ci-wizard
      >
        <div style={s.dialogHead}>
          <h2 id={titleId} style={s.dialogTitle}>{title}</h2>
          <Button kind="ghost" size="sm" icon="X" aria-label={t("wizard.close")} onClick={onClose} data-ci-wizard-close />
        </div>
        <div style={s.dialogBody}>{children}</div>
        <div style={s.dialogFoot}>{footer}</div>
      </div>
    </div>
  );
}
