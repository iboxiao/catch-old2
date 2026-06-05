"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type {
  Card,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
  SplitSubmission,
} from "@/src/shared/types";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type GroupKey = keyof SplitSubmission;

const emptySplit: SplitSubmission = {
  single: [],
  tenHalf: [],
  threeCard: [],
};

const groupMeta: Array<{ key: GroupKey; title: string; limit: number; hint: string }> = [
  { key: "single", title: "第一轮", limit: 1, hint: "单牌比大小" },
  { key: "tenHalf", title: "第二轮", limit: 2, hint: "十点半" },
  { key: "threeCard", title: "第三轮", limit: 3, hint: "飘三叶" },
];

export default function Home() {
  const [socket, setSocket] = useState<GameSocket>();
  const [snapshot, setSnapshot] = useState<RoomSnapshot>();
  const [playerId, setPlayerId] = useState("");
  const [createNickname, setCreateNickname] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<SplitSubmission>(emptySplit);
  const [draggingCard, setDraggingCard] = useState("");
  const [selectedCard, setSelectedCard] = useState("");
  const [now, setNow] = useState(Date.now());
  const lastHandKey = useRef("");

  useEffect(() => {
    const nextSocket: GameSocket = io();
    nextSocket.on("roomState", (state) => {
      setSnapshot(state);
      if (state.error) setMessage(state.error);
    });
    nextSocket.on("toast", ({ message: toast }) => setMessage(toast));
    setSocket(nextSocket);

    const savedNickname = window.localStorage.getItem("catch-second:nickname");
    const savedPlayerId = window.localStorage.getItem("catch-second:playerId");
    const savedRoomId = window.localStorage.getItem("catch-second:roomId");
    if (savedNickname) {
      setCreateNickname(savedNickname);
      setJoinNickname(savedNickname);
    }
    if (savedPlayerId) setPlayerId(savedPlayerId);
    if (savedRoomId) setRoomIdInput(savedRoomId);

    return () => {
      nextSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (snapshot?.mySubmission) {
      setDraft(snapshot.mySubmission);
      return;
    }

    if (snapshot?.phase === "splitting" && snapshot.hand.length === 6) {
      const handKey = snapshot.hand.map((card) => card.id).join("|");
      if (handKey !== lastHandKey.current) {
        lastHandKey.current = handKey;
        setDraft(emptySplit);
        setSelectedCard("");
      }
    }
  }, [snapshot?.phase, snapshot?.hand, snapshot?.mySubmission]);

  const me = snapshot?.players.find((player) => player.playerId === playerId);
  const isHost = Boolean(me?.isHost);
  const secondsLeft = snapshot?.deadlineAt ? Math.max(0, Math.ceil((snapshot.deadlineAt - now) / 1000)) : 0;
  const assignedIds = new Set([...draft.single, ...draft.tenHalf, ...draft.threeCard]);
  const unassignedCards = useMemo(
    () => snapshot?.hand.filter((card) => !assignedIds.has(card.id)) ?? [],
    [snapshot?.hand, draft],
  );
  const canSubmit = draft.single.length === 1 && draft.tenHalf.length === 2 && draft.threeCard.length === 3;

  function saveSession(nextRoomId: string, nextPlayerId: string, nextNickname: string) {
    window.localStorage.setItem("catch-second:roomId", nextRoomId);
    window.localStorage.setItem("catch-second:playerId", nextPlayerId);
    window.localStorage.setItem("catch-second:nickname", nextNickname);
    setRoomIdInput(nextRoomId);
    setPlayerId(nextPlayerId);
  }

  function handleAck<T extends { snapshot?: RoomSnapshot; roomId?: string; playerId?: string }>(
    response: ({ ok: true } & T) | { ok: false; error: string },
    usedNickname: string,
  ) {
    if (!response.ok) {
      setMessage(response.error);
      return;
    }
    if (response.snapshot) setSnapshot(response.snapshot);
    if (response.roomId && response.playerId) saveSession(response.roomId, response.playerId, usedNickname.trim());
    setMessage("");
  }

  function createRoom() {
    if (!socket) return;
    const usedNickname = createNickname.trim();
    if (!usedNickname) {
      setMessage("创建房间需要先填写昵称。");
      return;
    }
    socket.emit("createRoom", { nickname: usedNickname }, (response) => handleAck(response, usedNickname));
  }

  function joinRoom() {
    if (!socket || !roomIdInput.trim()) return;
    const usedNickname = joinNickname.trim();
    if (!usedNickname || !roomIdInput.trim()) {
      setMessage("加入房间需要填写昵称和房间号。");
      return;
    }
    socket.emit(
      "joinRoom",
      { roomId: roomIdInput.trim(), nickname: usedNickname, playerId: playerId || undefined },
      (response) => handleAck(response, usedNickname),
    );
  }

  function emitSimple(event: "ready" | "startGame" | "submitSplit" | "revealNext" | "playAgain", payload: unknown) {
    if (!socket) return;
    const currentNickname = me?.nickname ?? createNickname.trim() ?? joinNickname.trim() ?? "玩家";
    if (event === "ready") socket.emit("ready", payload as { roomId: string; ready: boolean }, (response) => handleAck(response, currentNickname));
    if (event === "startGame") socket.emit("startGame", payload as { roomId: string }, (response) => handleAck(response, currentNickname));
    if (event === "submitSplit") socket.emit("submitSplit", payload as { roomId: string; split: SplitSubmission }, (response) => handleAck(response, currentNickname));
    if (event === "revealNext") socket.emit("revealNext", payload as { roomId: string }, (response) => handleAck(response, currentNickname));
    if (event === "playAgain") socket.emit("playAgain", payload as { roomId: string }, (response) => handleAck(response, currentNickname));
  }

  function moveCard(cardId: string, group: GroupKey | "hand") {
    setDraft((current) => {
      const next: SplitSubmission = {
        single: current.single.filter((id) => id !== cardId),
        tenHalf: current.tenHalf.filter((id) => id !== cardId),
        threeCard: current.threeCard.filter((id) => id !== cardId),
      };
      if (group !== "hand") {
        const limit = groupMeta.find((item) => item.key === group)?.limit ?? 0;
        if (next[group].length < limit) next[group] = [...next[group], cardId];
      }
      return next;
    });
  }

  function handleCardTap(cardId: string, currentGroup: GroupKey | "hand") {
    if (snapshot?.mySubmission) return;
    if (currentGroup !== "hand") {
      moveCard(cardId, "hand");
      setSelectedCard("");
      return;
    }
    setSelectedCard((current) => (current === cardId ? "" : cardId));
  }

  function moveSelectedTo(group: GroupKey | "hand") {
    if (!selectedCard || snapshot?.mySubmission) return;
    moveCard(selectedCard, group);
    setSelectedCard("");
  }

  function cardById(cardId: string) {
    return snapshot?.hand.find((card) => card.id === cardId);
  }

  return (
    <main className="min-h-screen bg-paper pb-[env(safe-area-inset-bottom)]">
      <section className="border-b border-black/10 bg-felt text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-4 sm:px-4 md:flex-row md:items-end md:justify-between md:py-5">
          <div>
            <p className="text-sm text-white/70">Catch The Second</p>
            <h1 className="text-2xl font-bold tracking-normal sm:text-3xl">捉老二</h1>
          </div>
          {snapshot && (
            <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
              <span className="rounded bg-white/12 px-3 py-2">房间 {snapshot.roomId}</span>
              <span className="rounded bg-white/12 px-3 py-2">{phaseText(snapshot.phase)}</span>
              {snapshot.phase === "splitting" && <span className="rounded bg-coral px-3 py-2">{secondsLeft}s</span>}
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-5 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          {!snapshot && (
            <div className="rounded border border-black/10 bg-white p-4 shadow-sm sm:p-5">
              <h2 className="text-xl font-bold">进入游戏</h2>
              <div className="mt-4 space-y-4">
                <div>
                  <div className="mb-2 text-sm font-bold text-black/65">创建房间</div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                    <input
                      className="h-12 rounded border border-black/15 px-3 text-base outline-none focus:border-felt"
                      placeholder="昵称（必填）"
                      value={createNickname}
                      maxLength={16}
                      onChange={(event) => setCreateNickname(event.target.value)}
                    />
                    <button className="h-12 rounded bg-felt px-5 font-bold text-white disabled:opacity-40" disabled={!createNickname.trim()} onClick={createRoom}>
                      创建房间
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-bold text-black/65">加入房间</div>
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:gap-3">
                    <input
                      className="h-12 rounded border border-black/15 px-3 text-base outline-none focus:border-felt"
                      placeholder="昵称（必填）"
                      value={joinNickname}
                      maxLength={16}
                      onChange={(event) => setJoinNickname(event.target.value)}
                    />
                    <input
                      className="h-12 rounded border border-black/15 px-3 text-base outline-none focus:border-felt"
                      placeholder="房间号（必填）"
                      value={roomIdInput}
                      maxLength={6}
                      onChange={(event) => setRoomIdInput(event.target.value.replace(/\D/g, ""))}
                    />
                    <button
                      className="h-12 rounded bg-ink px-5 font-bold text-white disabled:opacity-40"
                      disabled={!joinNickname.trim() || !roomIdInput.trim()}
                      onClick={joinRoom}
                    >
                      加入房间
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {snapshot?.phase === "lobby" && (
            <div className="rounded border border-black/10 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">房间 {snapshot.roomId}</h2>
                  <p className="mt-1 text-sm text-black/60">3-8 人全部准备后，房主可以开始。</p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:flex">
                  <button
                    className="h-11 rounded bg-brass px-4 font-bold text-white"
                    onClick={() => emitSimple("ready", { roomId: snapshot.roomId, ready: !me?.ready })}
                  >
                    {me?.ready ? "取消准备" : "准备"}
                  </button>
                  {isHost && (
                    <button
                      className="rounded bg-felt px-4 py-2 font-bold text-white disabled:opacity-40"
                      disabled={snapshot.players.length < 3 || !snapshot.players.every((player) => player.ready)}
                      onClick={() => emitSimple("startGame", { roomId: snapshot.roomId })}
                    >
                      开始
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {snapshot?.phase === "splitting" && (
            <div className="space-y-4">
              <div className="rounded border border-black/10 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold">拖拽分牌</h2>
                  <span className="rounded bg-coral px-3 py-2 text-sm font-bold text-white">{secondsLeft}s</span>
                </div>
                <p className="mt-2 text-sm text-black/55">手机上先点选一张手牌，再点下面轮次区域；点已分组的牌可收回。</p>
                <DropZone
                  title="手牌区"
                  selected={selectedCard.length > 0}
                  onTap={() => moveSelectedTo("hand")}
                  onDropCard={(cardId) => moveCard(cardId, "hand")}
                >
                  {unassignedCards.map((card) => (
                    <PlayingCard
                      key={card.id}
                      card={card}
                      selected={selectedCard === card.id}
                      onTap={() => handleCardTap(card.id, "hand")}
                      onDragStart={() => setDraggingCard(card.id)}
                    />
                  ))}
                </DropZone>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {groupMeta.map((group) => (
                  <DropZone
                    key={group.key}
                    title={group.title}
                    hint={`${group.hint} · ${draft[group.key].length}/${group.limit}`}
                    selected={selectedCard.length > 0}
                    onTap={() => moveSelectedTo(group.key)}
                    onDropCard={(cardId) => moveCard(cardId, group.key)}
                    active={draggingCard.length > 0}
                  >
                    {draft[group.key].map((cardId) => {
                      const card = cardById(cardId);
                      return card ? (
                        <PlayingCard
                          key={card.id}
                          card={card}
                          selected={false}
                          onTap={() => handleCardTap(card.id, group.key)}
                          onDragStart={() => setDraggingCard(card.id)}
                        />
                      ) : null;
                    })}
                  </DropZone>
                ))}
              </div>

              <div className="sticky bottom-0 -mx-3 border-t border-black/10 bg-paper/95 px-3 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
                <button
                  className="h-12 w-full rounded bg-felt px-5 font-bold text-white disabled:opacity-40 sm:w-auto"
                  disabled={!canSubmit || Boolean(snapshot.mySubmission)}
                  onClick={() => emitSimple("submitSplit", { roomId: snapshot.roomId, split: draft })}
                >
                  {snapshot.mySubmission ? "已提交，等待亮牌" : "提交分牌"}
                </button>
              </div>
            </div>
          )}

          {(snapshot?.phase === "revealing" || snapshot?.phase === "roundComplete" || snapshot?.phase === "gameOver") && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded border border-black/10 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
                <div>
                  <h2 className="text-xl font-bold">{snapshot.phase === "gameOver" ? "游戏结束" : "亮牌结算"}</h2>
                  <p className="mt-1 text-sm text-black/60">累计杯数达到 100 杯时，整场游戏结束。</p>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex">
                  {isHost && snapshot.phase === "revealing" && snapshot.roundIndex < 3 && (
                    <button
                      className="rounded bg-felt px-4 py-2 font-bold text-white"
                      onClick={() => emitSimple("revealNext", { roomId: snapshot.roomId })}
                    >
                      亮下一轮
                    </button>
                  )}
                  {isHost && snapshot.phase === "roundComplete" && (
                    <button
                      className="rounded bg-brass px-4 py-2 font-bold text-white"
                      onClick={() => emitSimple("playAgain", { roomId: snapshot.roomId })}
                    >
                      再来一局
                    </button>
                  )}
                  {isHost && snapshot.phase === "gameOver" && (
                    <button
                      className="rounded bg-ink px-4 py-2 font-bold text-white"
                      onClick={() => emitSimple("playAgain", { roomId: snapshot.roomId })}
                    >
                      重开房间
                    </button>
                  )}
                </div>
              </div>

              {snapshot.roundResults.map((result) => (
                <div key={result.kind} className="rounded border border-black/10 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold">{result.title}</h3>
                    <span className="text-sm text-black/60">第二名 +{result.penaltyCups}杯</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {result.players.map((player) => (
                      <div
                        key={player.playerId}
                        className={`rounded border p-3 ${
                          player.isSecond
                            ? "border-coral bg-coral/10"
                            : player.isTop
                              ? "border-felt bg-felt/10"
                              : "border-black/10 bg-white"
                        }`}
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="font-bold">
                              {player.nickname}
                              {player.isTop && <span className="ml-2 text-felt">第一档</span>}
                              {player.isSecond && <span className="ml-2 text-coral">第二名</span>}
                              {player.isBust && <span className="ml-2 text-coral">爆牌</span>}
                            </div>
                            <div className="mt-1 text-sm text-black/60">{player.label}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {player.cards.map((card) => (
                              <MiniCard key={card.id} card={card} />
                            ))}
                          </div>
                          <div className="text-right font-bold">{player.penalty > 0 ? `+${player.penalty}杯` : "0杯"}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {message && <div className="rounded border border-coral bg-coral/10 p-3 text-sm text-coral">{message}</div>}
          {snapshot && (
            <div className="rounded border border-black/10 bg-white p-4 shadow-sm">
              <h2 className="font-bold">战绩面板</h2>
              <div className="mt-3 space-y-2">
                {snapshot.players
                  .slice()
                  .sort((a, b) => a.cupCount - b.cupCount)
                  .map((player) => (
                    <div key={player.playerId} className="rounded border border-black/10 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 font-bold">
                          <span className="truncate">{player.nickname}</span>
                          {player.isHost && <span className="ml-1 text-xs text-brass">房主</span>}
                        </div>
                        <span className={player.connected ? "text-xs text-felt" : "text-xs text-black/40"}>
                          {player.connected ? "在线" : "离线"}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-1 text-center text-xs">
                        <Stat label="杯" value={player.cupCount} />
                        <Stat label="第二" value={player.secondPlaceCount} />
                        <Stat label="爆牌" value={player.bustCount} />
                        <Stat label="胜局" value={player.wins} />
                      </div>
                      {snapshot.phase === "lobby" && (
                        <div className="mt-2 text-xs text-black/60">{player.ready ? "已准备" : "未准备"}</div>
                      )}
                      {snapshot.phase === "splitting" && (
                        <div className="mt-2 text-xs text-black/60">{player.submitted ? "已提交" : "分牌中"}</div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function DropZone({
  title,
  hint,
  children,
  active,
  selected,
  onTap,
  onDropCard,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  active?: boolean;
  selected?: boolean;
  onTap?: () => void;
  onDropCard: (cardId: string) => void;
}) {
  return (
    <div
      className={`min-h-[148px] rounded border border-dashed p-3 transition sm:min-h-[156px] ${
        active || selected ? "border-felt bg-felt/5" : "border-black/15 bg-white"
      }`}
      onClick={(event) => {
        if (event.target === event.currentTarget) onTap?.();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const cardId = event.dataTransfer.getData("text/plain");
        if (cardId) onDropCard(cardId);
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-bold">{title}</h3>
        {hint && <span className="text-xs text-black/55">{hint}</span>}
      </div>
      <div
        className="flex min-h-[98px] flex-wrap gap-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) onTap?.();
        }}
      >
        {children}
      </div>
    </div>
  );
}

function PlayingCard({
  card,
  selected,
  onTap,
  onDragStart,
}: {
  card: Card;
  selected: boolean;
  onTap: () => void;
  onDragStart: () => void;
}) {
  return (
    <div
      draggable
      onClick={(event) => {
        event.stopPropagation();
        onTap();
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", card.id);
        onDragStart();
      }}
      className={`relative h-[116px] w-[83px] cursor-grab select-none transition sm:h-[128px] sm:w-[92px] ${
        selected ? "-translate-y-1 rounded-[9px] ring-4 ring-brass" : ""
      }`}
    >
      <img
        src={cardAsset(card)}
        alt={cardAlt(card)}
        draggable={false}
        className="h-full w-full rounded-[8px] object-contain shadow-[0_8px_18px_rgba(23,32,38,0.16)]"
      />
    </div>
  );
}

function MiniCard({ card }: { card: Card }) {
  return (
    <img
      src={cardAsset(card)}
      alt={cardAlt(card)}
      draggable={false}
      className="h-[68px] w-[49px] rounded-[6px] object-contain shadow-[0_5px_12px_rgba(23,32,38,0.14)] sm:h-[76px] sm:w-[54px]"
    />
  );
}

function suitSymbol(suit: Card["suit"]) {
  return {
    spades: "♠",
    hearts: "♥",
    clubs: "♣",
    diamonds: "♦",
  }[suit];
}

function cardAsset(card: Card) {
  return `/cards/${card.suit}-${card.rank}.svg`;
}

function cardAlt(card: Card) {
  return `${card.rank}${suitSymbol(card.suit)}`;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded bg-black/[0.04] px-1 py-2">
      <div className="font-bold">{value}</div>
      <div className="text-black/55">{label}</div>
    </div>
  );
}

function phaseText(phase: RoomSnapshot["phase"]) {
  const map: Record<RoomSnapshot["phase"], string> = {
    lobby: "等待准备",
    splitting: "分牌中",
    revealing: "亮牌中",
    roundComplete: "本局结束",
    gameOver: "游戏结束",
  };
  return map[phase];
}
