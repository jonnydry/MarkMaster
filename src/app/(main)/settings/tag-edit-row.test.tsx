// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TagEditRow } from "./tag-edit-row";
import type { TagWithCount } from "@/types";

const TAG: TagWithCount = {
  id: "tag-1",
  name: "TypeScript",
  color: "#1d9bf0",
  _count: { bookmarks: 2 },
};

const DUPLICATE_ERROR = "A tag with that name already exists";

function Editor({
  taken = [],
  closeOnSave = true,
}: {
  taken?: string[];
  closeOnSave?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [shownName, setShownName] = useState(TAG.name);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);
  const [receipt, setReceipt] = useState("no save");

  const onSave = (tagId: string, name: string, color: string) => {
    if (taken.includes(name)) {
      setError(DUPLICATE_ERROR);
      return;
    }
    setError(null);
    setShownName(name);
    setReceipt(`${tagId} ${name} ${color}`);
    setSaved((count) => count + 1);
    if (closeOnSave) setOpen(false);
  };

  return (
    <div>
      <button type="button">Outside</button>
      {error ? <p role="alert">{error}</p> : null}
      {open ? (
        <TagEditRow
          tag={TAG}
          index={0}
          initialName={TAG.name}
          initialColor={TAG.color}
          onSave={onSave}
          onCancel={() => {
            setShownName(TAG.name);
            setOpen(false);
          }}
        />
      ) : (
        <p>{shownName}</p>
      )}
      <p>{saved} saved</p>
      <p>{receipt}</p>
    </div>
  );
}

async function replaceName(next: string) {
  const user = userEvent.setup();
  const input = screen.getByRole("textbox");
  await user.clear(input);
  if (next) await user.type(input, next);
  return user;
}

function pressLikeIos(control: HTMLElement) {
  const input = screen.getByRole("textbox");
  input.focus();
  let blurred = false;
  const onBlur = () => {
    blurred = true;
  };
  input.addEventListener("blur", onBlur);
  fireEvent.pointerDown(control);
  fireEvent.pointerUp(control);
  const mouseDownAllowed = fireEvent.mouseDown(control);
  input.removeEventListener("blur", onBlur);
  expect(mouseDownAllowed).toBe(false);
  expect(blurred).toBe(false);
  expect(input).toHaveFocus();
}

describe("TagEditRow", () => {
  it("saves the typed name when focus leaves the row", async () => {
    render(<Editor />);
    const user = await replaceName("TypeScript Kept");

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByText("TypeScript Kept")).toBeInTheDocument();
    expect(screen.getByText("tag-1 TypeScript Kept #1d9bf0")).toBeInTheDocument();
    expect(screen.getByText("1 saved")).toBeInTheDocument();
  });

  it("restores the original name on Escape and does not save", async () => {
    render(<Editor />);
    const user = await replaceName("Temporary");

    await user.keyboard("{Escape}");

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    expect(screen.getByText("no save")).toBeInTheDocument();
  });

  it("closes without saving when the trimmed name is unchanged", async () => {
    render(<Editor />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("textbox"));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("closes without saving when the trimmed name is empty", async () => {
    render(<Editor />);
    const user = await replaceName("");

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("keeps the editor open and shows the duplicate error when Save is clicked", async () => {
    render(<Editor taken={["React"]} />);
    const user = await replaceName("React");

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("alert")).toHaveTextContent(DUPLICATE_ERROR);
    expect(screen.getByRole("textbox")).toHaveValue("React");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("keeps the editor open and shows the same duplicate error when focus leaves", async () => {
    render(<Editor taken={["React"]} />);
    const user = await replaceName("React");

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByRole("alert")).toHaveTextContent(DUPLICATE_ERROR);
    expect(screen.getByRole("textbox")).toHaveValue("React");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("stays in edit when focus moves to a color swatch", async () => {
    render(<Editor />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Select color Cyan" }));

    expect(screen.getByRole("textbox")).toHaveValue("TypeScript");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select color Cyan" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });

  it("saves once when a blur is followed by a Save click", async () => {
    render(<Editor closeOnSave={false} />);
    await replaceName("TypeScript Kept");

    fireEvent.blur(screen.getByRole("textbox"), { relatedTarget: null });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("1 saved")).toBeInTheDocument();
    expect(screen.getByText("tag-1 TypeScript Kept #1d9bf0")).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("TypeScript Kept");
  });

  it("saves once on the iOS press order for Save", async () => {
    render(<Editor />);
    await replaceName("TypeScript Kept");
    const save = screen.getByRole("button", { name: "Save" });

    pressLikeIos(save);
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    fireEvent.click(save);

    expect(screen.getByText("1 saved")).toBeInTheDocument();
    expect(screen.getByText("tag-1 TypeScript Kept #1d9bf0")).toBeInTheDocument();
  });

  it("restores the original name on the iOS press order for Cancel", async () => {
    render(<Editor />);
    await replaceName("TypeScript Kept");
    const cancel = screen.getByRole("button", { name: "Cancel" });

    pressLikeIos(cancel);
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    fireEvent.click(cancel);

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    expect(screen.getByText("no save")).toBeInTheDocument();
  });

  it("keeps the editor open and the new color on the iOS press order for a swatch", async () => {
    render(<Editor />);
    await replaceName("TypeScript Kept");
    const swatch = screen.getByRole("button", { name: "Select color Cyan" });

    pressLikeIos(swatch);
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    fireEvent.click(swatch);

    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("TypeScript Kept");
    expect(screen.getByRole("textbox")).toHaveFocus();
    expect(swatch).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("0 saved")).toBeInTheDocument();
    expect(screen.getByText("no save")).toBeInTheDocument();
  });

  it("saves a color-only change when focus leaves the row", async () => {
    render(<Editor />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Select color Cyan" }));
    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.getByText("tag-1 TypeScript #06b6d4")).toBeInTheDocument();
    expect(screen.getByText("1 saved")).toBeInTheDocument();
  });

  it("ignores a second save while the first request is still in flight", async () => {
    let resolveSave: () => void = () => {};
    const calls: string[] = [];
    render(
      <TagEditRow
        tag={TAG}
        index={0}
        initialName={TAG.name}
        initialColor={TAG.color}
        onCancel={() => {}}
        onSave={(tagId, name, color) => {
          calls.push(`${tagId} ${name} ${color}`);
          return new Promise<void>((resolve) => {
            resolveSave = resolve;
          });
        }}
      />
    );
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "TypeScript Kept" } });
    fireEvent.blur(input, { relatedTarget: null });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(calls).toEqual(["tag-1 TypeScript Kept #1d9bf0"]);
    resolveSave();
    await act(async () => {
      await Promise.resolve();
    });
  });

  it("still cancels from the Cancel button after the name changes", async () => {
    render(<Editor />);
    const user = await replaceName("TypeScript Kept");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("TypeScript")).toBeInTheDocument();
    expect(screen.getByText("0 saved")).toBeInTheDocument();
  });
});
