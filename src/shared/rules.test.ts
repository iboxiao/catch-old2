import { describe, expect, it } from "vitest";
import { evaluateTenHalf, evaluateThreeCard, scoreRound } from "./rules";
import type { Card } from "./types";

function c(id: string, rank: Card["rank"], suit: Card["suit"] = "spades"): Card {
  return { id, rank, suit };
}

describe("round scoring", () => {
  it("finds all players in the second rank group for single cards", () => {
    const result = scoreRound("single", [
      { playerId: "a", nickname: "A", cards: [c("a", "K", "spades")] },
      { playerId: "e", nickname: "E", cards: [c("e", "K", "hearts")] },
      { playerId: "b", nickname: "B", cards: [c("b", "Q", "hearts")] },
      { playerId: "c", nickname: "C", cards: [c("c", "Q", "clubs")] },
      { playerId: "d", nickname: "D", cards: [c("d", "9", "spades")] },
    ]);

    expect(result.secondPlayerIds).toEqual(["b", "c"]);
    expect(result.players.find((player) => player.playerId === "b")?.penalty).toBe(1);
    expect(result.players.find((player) => player.playerId === "c")?.penalty).toBe(1);
  });

  it("penalizes ten-half busts and excludes them from second-place calculation", () => {
    const result = scoreRound("tenHalf", [
      { playerId: "a", nickname: "A", cards: [c("a1", "10"), c("a2", "K")] },
      { playerId: "b", nickname: "B", cards: [c("b1", "10"), c("b2", "Q")] },
      { playerId: "c", nickname: "C", cards: [c("c1", "9"), c("c2", "A")] },
      { playerId: "d", nickname: "D", cards: [c("d1", "9"), c("d2", "3")] },
    ]);

    expect(result.secondPlayerIds).toEqual(["c"]);
    expect(result.players.find((player) => player.playerId === "d")?.isBust).toBe(true);
    expect(result.players.find((player) => player.playerId === "d")?.penalty).toBe(2);
  });

  it("treats tied top ten-half totals as first place and the next total as second", () => {
    const result = scoreRound("tenHalf", [
      { playerId: "a", nickname: "A", cards: [c("a1", "10"), c("a2", "Q")] },
      { playerId: "b", nickname: "B", cards: [c("b1", "10"), c("b2", "J")] },
      { playerId: "c", nickname: "C", cards: [c("c1", "9"), c("c2", "A")] },
      { playerId: "d", nickname: "D", cards: [c("d1", "8"), c("d2", "2")] },
      { playerId: "e", nickname: "E", cards: [c("e1", "7"), c("e2", "3")] },
    ]);

    expect(result.secondPlayerIds).toEqual(["c", "d", "e"]);
    expect(result.players.find((player) => player.playerId === "c")?.penalty).toBe(2);
    expect(result.players.find((player) => player.playerId === "d")?.penalty).toBe(2);
    expect(result.players.find((player) => player.playerId === "e")?.penalty).toBe(2);
  });

  it("handles special three-card ordering", () => {
    expect(evaluateThreeCard([c("1", "A"), c("2", "K", "hearts"), c("3", "Q", "clubs")]).label).toContain("顺子");
    expect(evaluateThreeCard([c("1", "A"), c("2", "2", "hearts"), c("3", "3", "clubs")]).label).toContain("顺子");
    expect(evaluateThreeCard([c("1", "2"), c("2", "3"), c("3", "5")]).rankValue[0]).toBe(0);
  });

  it("evaluates ten-half face cards as 0.5", () => {
    expect(evaluateTenHalf([c("1", "10"), c("2", "K")]).isBust).toBe(false);
    expect(evaluateTenHalf([c("1", "10"), c("2", "Q")]).label).toBe("10.5点");
  });
});
