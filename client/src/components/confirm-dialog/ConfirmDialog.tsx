/* ConfirmDialog — shared destructive/confirm modal (title, body, confirm,
   cancel, and the Modal's own X close button). Used for skill delete, agent
   delete and skill-version restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
          <Button kind={danger ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && <div style={s.body}>{body}</div>}
    </Modal>
  );
}
