import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const mutate = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useCreateSkill: () => ({ mutate, isPending: false }),
}));

import { FileTab } from "./FileTab";

afterEach(() => {
  cleanup();
  mutate.mockClear();
});

function renderTab(props: Partial<React.ComponentProps<typeof FileTab>> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>
        <FileTab onDone={vi.fn()} {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const BODY = "# PR Quality Rubric\n\nChecks that a PR is small and tested.\n\n- rule one";

describe("FileTab import preview", () => {
  it("shows no preview until there is a body", () => {
    renderTab();
    expect(screen.queryByText("Parsed skill")).not.toBeInTheDocument();
  });

  it("shows the parsed name, description and disabled note once a body is pasted", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), { target: { value: BODY } });
    expect(screen.getByText("Parsed skill")).toBeInTheDocument();
    expect(screen.getByText("pr-quality-rubric")).toBeInTheDocument();
    // once in the parsed-description row, once inside the rendered markdown body
    expect(screen.getAllByText("Checks that a PR is small and tested.")).toHaveLength(2);
    expect(screen.getByText(/created disabled/)).toBeInTheDocument();
  });

  it("saves with source imported_file, the chosen type and the derived description", () => {
    renderTab();
    fireEvent.change(screen.getByPlaceholderText(/Describe the rule/), { target: { value: BODY } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "security" } });
    fireEvent.click(screen.getByRole("button", { name: /Import skill/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual({
      name: "pr-quality-rubric",
      description: "Checks that a PR is small and tested.",
      type: "security",
      body: BODY,
      source: "imported_file",
    });
  });
});
