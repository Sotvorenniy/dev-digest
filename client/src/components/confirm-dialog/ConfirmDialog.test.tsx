import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/common.json";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(cleanup);

function setup() {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <NextIntlClientProvider locale="en" messages={{ common: messages }}>
      <ConfirmDialog title="Delete it?" body="Really?" confirmLabel="Delete" danger onConfirm={onConfirm} onCancel={onCancel} />
    </NextIntlClientProvider>,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders a dialog with title and body", () => {
    setup();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Delete it?")).toBeInTheDocument();
    expect(screen.getByText("Really?")).toBeInTheDocument();
  });

  it("confirm calls onConfirm only", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("cancel and the X button both call onCancel", () => {
    const { onConfirm, onCancel } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
