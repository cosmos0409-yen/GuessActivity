// @vitest-environment jsdom
//
// 決賽大廳：從選拔賽帶過來的前 3 名，點一下就能帶入挑戰者姓名。
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import Lobby from "./Lobby";

afterEach(cleanup);

const baseProps = { emblemSrc: "", title: "決賽", onOpenSettings: () => {} };

describe("Lobby 的決賽名單", () => {
  it("點名字會帶入輸入框，送出後用這個名字開始", () => {
    const onStart = vi.fn();
    render(<Lobby {...baseProps} onStart={onStart} finalists={["阿明", "小華", "大雄"]} />);
    fireEvent.click(screen.getByRole("button", { name: /小華/ }));
    expect((screen.getByLabelText("參賽者名字") as HTMLInputElement).value).toBe("小華");
    fireEvent.click(screen.getByRole("button", { name: "開始新的一場" }));
    expect(onStart).toHaveBeenCalledWith("小華");
  });

  it("已經挑戰過的人標上「已挑戰」", () => {
    render(<Lobby {...baseProps} onStart={() => {}} finalists={["阿明", "小華"]} playedNames={["阿明"]} />);
    expect(screen.getByRole("button", { name: /阿明/ }).textContent).toContain("已挑戰");
    expect(screen.getByRole("button", { name: /小華/ }).textContent).not.toContain("已挑戰");
  });

  it("沒有名單時不顯示名單區塊", () => {
    render(<Lobby {...baseProps} onStart={() => {}} />);
    expect(screen.queryByLabelText("選拔賽晉級名單")).toBeNull();
  });
});
