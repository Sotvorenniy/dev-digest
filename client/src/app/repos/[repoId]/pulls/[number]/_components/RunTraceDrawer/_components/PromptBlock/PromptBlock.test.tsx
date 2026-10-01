import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { PromptBlock } from "./PromptBlock";

afterEach(cleanup);

function renderBlock(tokens?: number | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <PromptBlock label="Skills (dynamic)" text="body" color="red" tokens={tokens} />
    </NextIntlClientProvider>,
  );
}

describe("PromptBlock token badge", () => {
  it("shows ~N tok next to the label when tokens is a number", () => {
    renderBlock(123);
    expect(screen.getByText("~123 tok")).toBeInTheDocument();
  });

  it("shows ~0 tok for zero (0 is a real count, not missing)", () => {
    renderBlock(0);
    expect(screen.getByText("~0 tok")).toBeInTheDocument();
  });

  it.each([null, undefined])("hides the badge when tokens is %s", (v) => {
    renderBlock(v);
    expect(screen.queryByText(/tok$/)).not.toBeInTheDocument();
  });
});
