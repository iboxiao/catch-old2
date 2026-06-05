import type { Card, Rank, RoundKind, RoundResult, SplitSubmission, Suit } from "./types";

export const suits: Suit[] = ["spades", "hearts", "clubs", "diamonds"];
export const ranks: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const singleRankValue: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

const highRankValue: Record<Rank, number> = {
  A: 14,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
};

const tenHalfValue: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 0.5,
  Q: 0.5,
  K: 0.5,
};

const suitValue: Record<Suit, number> = {
  diamonds: 1,
  clubs: 2,
  hearts: 3,
  spades: 4,
};

const suitText: Record<Suit, string> = {
  spades: "黑桃",
  hearts: "红桃",
  clubs: "梅花",
  diamonds: "方片",
};

const rankText: Record<Rank, string> = {
  A: "A",
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "J",
  Q: "Q",
  K: "K",
};

export function cardText(card: Card) {
  return `${suitText[card.suit]}${rankText[card.rank]}`;
}

export function buildDeck(): Card[] {
  return suits.flatMap((suit) => ranks.map((rank) => ({ id: `${suit}-${rank}`, suit, rank })));
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function compareRankValue(left: number[], right: number[]) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sameRankValue(left: number[], right: number[]) {
  return compareRankValue(left, right) === 0;
}

function findTopAndSecond<T extends { rankValue: number[]; excluded?: boolean }>(entries: T[]) {
  const eligible = entries.filter((entry) => !entry.excluded).sort((a, b) => compareRankValue(b.rankValue, a.rankValue));
  const topValue = eligible[0]?.rankValue;
  const secondValue = topValue ? eligible.find((entry) => !sameRankValue(entry.rankValue, topValue))?.rankValue : undefined;
  return {
    isTop: (entry: T) => Boolean(topValue && !entry.excluded && sameRankValue(entry.rankValue, topValue)),
    isSecond: (entry: T) => Boolean(secondValue && !entry.excluded && sameRankValue(entry.rankValue, secondValue)),
  };
}

export function evaluateSingle(cards: Card[]) {
  const card = cards[0];
  return {
    label: cardText(card),
    rankValue: [singleRankValue[card.rank], suitValue[card.suit]],
    isBust: false,
  };
}

export function evaluateTenHalf(cards: Card[]) {
  const total = cards.reduce((sum, card) => sum + tenHalfValue[card.rank], 0);
  const isBust = total > 10.5;
  return {
    label: isBust ? `${total}点 爆牌` : `${total}点`,
    rankValue: [isBust ? -1 : total * 2],
    isBust,
  };
}

function straightHighValue(values: number[]) {
  const sorted = [...values].sort((a, b) => b - a);
  const key = sorted.join(",");
  if (key === "14,13,12") return 14;
  if (key === "14,3,2") return 3;
  if (sorted[0] - sorted[1] === 1 && sorted[1] - sorted[2] === 1) return sorted[0];
  return 0;
}

export function evaluateThreeCard(cards: Card[]) {
  const values = cards.map((card) => highRankValue[card.rank]).sort((a, b) => b - a);
  const ranksOnly = cards.map((card) => card.rank).sort().join(",");
  const is235 = ranksOnly === "2,3,5";
  const sameSuit = cards.every((card) => card.suit === cards[0].suit);
  const straight = straightHighValue(values);
  const counts = new Map<number, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1));
  const countEntries = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (is235) {
    return { label: "235特殊最小", rankValue: [0], isBust: false };
  }

  if (countEntries[0][1] === 3) {
    return { label: `豹子 ${cardText(cards[0]).slice(2)}`, rankValue: [7, countEntries[0][0]], isBust: false };
  }

  if (sameSuit && straight) {
    return { label: `同花顺 ${straightLabel(straight)}`, rankValue: [6, straight], isBust: false };
  }

  if (straight) {
    return { label: `顺子 ${straightLabel(straight)}`, rankValue: [5, straight], isBust: false };
  }

  if (sameSuit) {
    return { label: `同花 ${values.map(valueText).join(" ")}`, rankValue: [4, ...values], isBust: false };
  }

  if (countEntries[0][1] === 2) {
    const pair = countEntries[0][0];
    const kicker = countEntries.find((entry) => entry[1] === 1)?.[0] ?? 0;
    return { label: `对子 ${valueText(pair)}`, rankValue: [3, pair, kicker], isBust: false };
  }

  return { label: `散牌 ${values.map(valueText).join(" ")}`, rankValue: [2, ...values], isBust: false };
}

function straightLabel(value: number) {
  if (value === 14) return "AKQ";
  if (value === 3) return "A23";
  return `高牌${valueText(value)}`;
}

function valueText(value: number) {
  if (value === 14) return "A";
  if (value === 13) return "K";
  if (value === 12) return "Q";
  if (value === 11) return "J";
  return String(value);
}

export function scoreRound(
  kind: RoundKind,
  submissions: Array<{ playerId: string; nickname: string; cards: Card[] }>,
): RoundResult {
  const penaltyCups = kind === "single" ? 1 : kind === "tenHalf" ? 2 : 3;
  const title = kind === "single" ? "第一轮 单牌比大小" : kind === "tenHalf" ? "第二轮 十点半" : "第三轮 飘三叶";
  const evaluated = submissions.map((submission) => {
    const score =
      kind === "single"
        ? evaluateSingle(submission.cards)
        : kind === "tenHalf"
          ? evaluateTenHalf(submission.cards)
          : evaluateThreeCard(submission.cards);
    return {
      ...submission,
      ...score,
      excluded: score.isBust,
    };
  });
  const placement = findTopAndSecond(evaluated);

  const players = evaluated
    .map((entry) => {
      const isSecond = placement.isSecond(entry);
      const penalty = (entry.isBust ? 2 : 0) + (isSecond ? penaltyCups : 0);
      return {
        playerId: entry.playerId,
        nickname: entry.nickname,
        cards: entry.cards,
        label: entry.label,
        rankValue: entry.rankValue,
        isTop: placement.isTop(entry),
        isSecond,
        isBust: entry.isBust,
        penalty,
      };
    })
    .sort((a, b) => compareRankValue(b.rankValue, a.rankValue));

  return {
    kind,
    title,
    penaltyCups,
    players,
    secondPlayerIds: players.filter((player) => player.isSecond).map((player) => player.playerId),
    bustPlayerIds: players.filter((player) => player.isBust).map((player) => player.playerId),
  };
}

export function validateSplit(hand: Card[], split: SplitSubmission) {
  const ids = new Set(hand.map((card) => card.id));
  const submittedIds = [...split.single, ...split.tenHalf, ...split.threeCard];
  if (split.single.length !== 1 || split.tenHalf.length !== 2 || split.threeCard.length !== 3) {
    return "请按 1 张、2 张、3 张完成分牌。";
  }
  if (new Set(submittedIds).size !== 6) {
    return "每张牌只能使用一次。";
  }
  if (submittedIds.some((id) => !ids.has(id))) {
    return "提交中包含不属于你的牌。";
  }
  return undefined;
}

export function makeAutoSplit(hand: Card[]): SplitSubmission {
  return {
    single: hand.slice(0, 1).map((card) => card.id),
    tenHalf: hand.slice(1, 3).map((card) => card.id),
    threeCard: hand.slice(3, 6).map((card) => card.id),
  };
}

export function splitCardsByKind(cards: Card[], split: SplitSubmission, kind: RoundKind) {
  const ids = kind === "single" ? split.single : kind === "tenHalf" ? split.tenHalf : split.threeCard;
  return ids.map((id) => {
    const card = cards.find((candidate) => candidate.id === id);
    if (!card) throw new Error(`Missing card ${id}`);
    return card;
  });
}

