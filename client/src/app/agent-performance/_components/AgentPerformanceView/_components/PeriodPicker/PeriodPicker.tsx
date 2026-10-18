"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { customRangeToPeriod, periodToDateInputs, presetPeriod, toDateInput, type CustomRangeError, type UiPeriod } from "../../helpers";
import { s } from "../../styles";

const ERROR_ID = "agent-performance-period-error";

/** 1 day / 30 days presets plus a custom start–end range. An invalid custom range shows
 *  an error and selects nothing, so no request is made. */
export function PeriodPicker({ period, onSelect }: { period: UiPeriod; onSelect: (p: UiPeriod) => void }) {
  const t = useTranslations("agentPerformance");
  const [customOpen, setCustomOpen] = React.useState(period.range === "custom");
  const initial = period.range === "custom" ? periodToDateInputs(period) : { start: "", end: "" };
  const [start, setStart] = React.useState(initial.start);
  const [end, setEnd] = React.useState(initial.end);
  const [error, setError] = React.useState<CustomRangeError | null>(null);

  // Re-seed from the URL period when it changes (e.g. browser Back) — adjusted during
  // render instead of a remount, so keyboard focus stays on the picker.
  const periodKey = `${period.range}:${period.from}:${period.to}`;
  const [syncedKey, setSyncedKey] = React.useState(periodKey);
  if (syncedKey !== periodKey) {
    setSyncedKey(periodKey);
    setCustomOpen(period.range === "custom");
    setStart(initial.start);
    setEnd(initial.end);
    setError(null);
  }
  const today = toDateInput(new Date());

  const pickPreset = (range: "1d" | "30d") => {
    setCustomOpen(false);
    setError(null);
    onSelect(presetPeriod(range, Date.now()));
  };

  const apply = () => {
    const result = customRangeToPeriod(start, end, new Date());
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setError(null);
    onSelect(result.period);
  };

  const showCustom = customOpen;

  return (
    <div data-period-picker style={s.picker}>
      <div style={s.pickerRow} role="group" aria-label={t("period.label")}>
        <Button kind="secondary" size="sm" active={period.range === "1d"} aria-pressed={period.range === "1d"} onClick={() => pickPreset("1d")}>
          {t("period.oneDay")}
        </Button>
        <Button kind="secondary" size="sm" active={period.range === "30d"} aria-pressed={period.range === "30d"} onClick={() => pickPreset("30d")}>
          {t("period.thirtyDays")}
        </Button>
        <Button kind="secondary" size="sm" active={showCustom} aria-pressed={showCustom} onClick={() => setCustomOpen((v) => !v)}>
          {t("period.custom")}
        </Button>
      </div>
      {showCustom && (
        <div style={s.pickerRow}>
          <label style={s.dateField}>
            {t("period.start")}
            <input
              type="date"
              value={start}
              max={today}
              onChange={(e) => setStart(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
              style={{ ...s.dateInput, ...(error ? s.dateInputInvalid : null) }}
            />
          </label>
          <label style={s.dateField}>
            {t("period.end")}
            <input
              type="date"
              value={end}
              max={today}
              onChange={(e) => setEnd(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ERROR_ID : undefined}
              style={{ ...s.dateInput, ...(error ? s.dateInputInvalid : null) }}
            />
          </label>
          <Button kind="primary" size="sm" onClick={apply}>
            {t("period.apply")}
          </Button>
        </div>
      )}
      {error && (
        <p id={ERROR_ID} role="alert" style={s.pickerError}>
          {t(`period.errors.${error}`)}
        </p>
      )}
    </div>
  );
}
