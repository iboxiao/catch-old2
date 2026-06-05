export type Suit = "spades" | "hearts" | "clubs" | "diamonds";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  id: string;
  suit: Suit;
  rank: Rank;
};

export type SplitSubmission = {
  single: string[];
  tenHalf: string[];
  threeCard: string[];
};

export type PlayerPublic = {
  playerId: string;
  nickname: string;
  cupCount: number;
  secondPlaceCount: number;
  bustCount: number;
  wins: number;
  connected: boolean;
  ready: boolean;
  submitted: boolean;
  isHost: boolean;
};

export type RoomPhase = "lobby" | "splitting" | "revealing" | "roundComplete" | "gameOver";

export type RoundKind = "single" | "tenHalf" | "threeCard";

export type RoundPlayerResult = {
  playerId: string;
  nickname: string;
  cards: Card[];
  label: string;
  rankValue: number[];
  isTop: boolean;
  isSecond: boolean;
  isBust?: boolean;
  penalty: number;
};

export type RoundResult = {
  kind: RoundKind;
  title: string;
  penaltyCups: number;
  players: RoundPlayerResult[];
  secondPlayerIds: string[];
  bustPlayerIds: string[];
};

export type RoomSnapshot = {
  roomId: string;
  hostId: string;
  phase: RoomPhase;
  roundIndex: number;
  players: PlayerPublic[];
  hand: Card[];
  mySubmission?: SplitSubmission;
  deadlineAt?: number;
  roundResults: RoundResult[];
  error?: string;
};

export type ClientToServerEvents = {
  createRoom: (payload: { nickname: string }, ack: Ack<{ roomId: string; playerId: string; snapshot: RoomSnapshot }>) => void;
  joinRoom: (payload: { roomId: string; nickname: string; playerId?: string }, ack: Ack<{ roomId: string; playerId: string; snapshot: RoomSnapshot }>) => void;
  ready: (payload: { roomId: string; ready: boolean }, ack?: Ack<{ snapshot: RoomSnapshot }>) => void;
  startGame: (payload: { roomId: string }, ack?: Ack<{ snapshot: RoomSnapshot }>) => void;
  submitSplit: (payload: { roomId: string; split: SplitSubmission }, ack?: Ack<{ snapshot: RoomSnapshot }>) => void;
  revealNext: (payload: { roomId: string }, ack?: Ack<{ snapshot: RoomSnapshot }>) => void;
  playAgain: (payload: { roomId: string }, ack?: Ack<{ snapshot: RoomSnapshot }>) => void;
};

export type ServerToClientEvents = {
  roomState: (snapshot: RoomSnapshot) => void;
  toast: (payload: { message: string }) => void;
};

export type Ack<T> = (response: { ok: true } & T | { ok: false; error: string }) => void;

