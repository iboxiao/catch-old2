import express from "express";
import { createServer } from "http";
import next from "next";
import { Server } from "socket.io";
import {
  buildDeck,
  makeAutoSplit,
  scoreRound,
  shuffle,
  splitCardsByKind,
  validateSplit,
} from "../src/shared/rules";
import type {
  Card,
  ClientToServerEvents,
  PlayerPublic,
  RoomPhase,
  RoomSnapshot,
  RoundKind,
  RoundResult,
  ServerToClientEvents,
  SplitSubmission,
} from "../src/shared/types";

type PlayerState = {
  playerId: string;
  socketId?: string;
  nickname: string;
  cupCount: number;
  secondPlaceCount: number;
  bustCount: number;
  wins: number;
  connected: boolean;
  ready: boolean;
  hand: Card[];
  submission?: SplitSubmission;
};

type RoomState = {
  roomId: string;
  hostId: string;
  phase: RoomPhase;
  roundIndex: number;
  players: Map<string, PlayerState>;
  deck: Card[];
  deadlineAt?: number;
  timer?: NodeJS.Timeout;
  roundResults: RoundResult[];
};

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();
const rooms = new Map<string, RoomState>();
const socketRooms = new Map<string, { roomId: string; playerId: string }>();

function createId(prefix: string, size = 8) {
  return `${prefix}_${Math.random().toString(36).slice(2, 2 + size)}`;
}

function createRoomId() {
  let roomId = "";
  do {
    roomId = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(roomId));
  return roomId;
}

function publicPlayer(player: PlayerState, room: RoomState): PlayerPublic {
  return {
    playerId: player.playerId,
    nickname: player.nickname,
    cupCount: player.cupCount,
    secondPlaceCount: player.secondPlaceCount,
    bustCount: player.bustCount,
    wins: player.wins,
    connected: player.connected,
    ready: player.ready,
    submitted: Boolean(player.submission),
    isHost: player.playerId === room.hostId,
  };
}

function snapshot(room: RoomState, viewerId: string, error?: string): RoomSnapshot {
  const viewer = room.players.get(viewerId);
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    phase: room.phase,
    roundIndex: room.roundIndex,
    players: [...room.players.values()].map((player) => publicPlayer(player, room)),
    hand: viewer?.hand ?? [],
    mySubmission: viewer?.submission,
    deadlineAt: room.deadlineAt,
    roundResults: room.roundResults,
    error,
  };
}

function emitRoom(io: Server<ClientToServerEvents, ServerToClientEvents>, room: RoomState) {
  for (const player of room.players.values()) {
    if (player.socketId) {
      io.to(player.socketId).emit("roomState", snapshot(room, player.playerId));
    }
  }
}

function ackError(ack: unknown, error: string) {
  if (typeof ack === "function") {
    ack({ ok: false, error });
  }
}

function findRoomAndPlayer(socketId: string, roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return { error: "房间不存在。" };
  const current = socketRooms.get(socketId);
  if (!current || current.roomId !== roomId) return { error: "你还没有加入这个房间。" };
  const player = room.players.get(current.playerId);
  if (!player) return { error: "玩家不存在。" };
  return { room, player };
}

function canStart(room: RoomState) {
  const players = [...room.players.values()];
  return room.phase === "lobby" && players.length >= 3 && players.length <= 8 && players.every((player) => player.ready);
}

function clearRoomTimer(room: RoomState) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = undefined;
  }
}

function deal(room: RoomState) {
  const deck = shuffle(buildDeck());
  room.deck = deck;
  let cursor = 0;
  for (const player of room.players.values()) {
    player.hand = deck.slice(cursor, cursor + 6);
    player.submission = undefined;
    player.ready = false;
    cursor += 6;
  }
}

function allSubmitted(room: RoomState) {
  return [...room.players.values()].every((player) => Boolean(player.submission));
}

function autoSubmitMissing(room: RoomState) {
  for (const player of room.players.values()) {
    if (!player.submission) {
      player.submission = makeAutoSplit(player.hand);
    }
  }
}

function startRound(io: Server<ClientToServerEvents, ServerToClientEvents>, room: RoomState) {
  clearRoomTimer(room);
  room.phase = "splitting";
  room.roundIndex = 0;
  room.roundResults = [];
  room.deadlineAt = Date.now() + 120_000;
  deal(room);
  room.timer = setTimeout(() => {
    autoSubmitMissing(room);
    revealNextRound(room);
    emitRoom(io, room);
  }, 120_000);
}

function kindForNextRound(roundIndex: number): RoundKind {
  if (roundIndex === 0) return "single";
  if (roundIndex === 1) return "tenHalf";
  return "threeCard";
}

function revealNextRound(room: RoomState) {
  if (room.phase === "splitting") {
    clearRoomTimer(room);
    autoSubmitMissing(room);
    room.deadlineAt = undefined;
    room.phase = "revealing";
  }

  if (room.phase !== "revealing" || room.roundIndex >= 3) return;

  const kind = kindForNextRound(room.roundIndex);
  const submissions = [...room.players.values()].map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    cards: splitCardsByKind(player.hand, player.submission ?? makeAutoSplit(player.hand), kind),
  }));

  const result = scoreRound(kind, submissions);
  room.roundResults.push(result);
  room.roundIndex += 1;
  applyRoundResult(room, result);

  if ([...room.players.values()].some((player) => player.cupCount >= 100)) {
    room.phase = "gameOver";
    awardWinners(room);
  } else if (room.roundIndex >= 3) {
    room.phase = "roundComplete";
  }
}

function applyRoundResult(room: RoomState, result: RoundResult) {
  for (const scored of result.players) {
    const player = room.players.get(scored.playerId);
    if (!player) continue;
    player.cupCount += scored.penalty;
    if (scored.isSecond) player.secondPlaceCount += 1;
    if (scored.isBust) player.bustCount += 1;
  }
}

function awardWinners(room: RoomState) {
  const lowestCupCount = Math.min(...[...room.players.values()].map((player) => player.cupCount));
  for (const player of room.players.values()) {
    if (player.cupCount === lowestCupCount) {
      player.wins += 1;
    }
  }
}

nextApp.prepare().then(() => {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });

  app.get("/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.all("*", (request, response) => nextHandler(request, response));

  io.on("connection", (socket) => {
    socket.on("createRoom", ({ nickname }, ack) => {
      const roomId = createRoomId();
      const playerId = createId("p");
      const player: PlayerState = {
        playerId,
        socketId: socket.id,
        nickname: nickname.trim() || "玩家",
        cupCount: 0,
        secondPlaceCount: 0,
        bustCount: 0,
        wins: 0,
        connected: true,
        ready: false,
        hand: [],
      };
      const room: RoomState = {
        roomId,
        hostId: playerId,
        phase: "lobby",
        roundIndex: 0,
        players: new Map([[playerId, player]]),
        deck: [],
        roundResults: [],
      };
      rooms.set(roomId, room);
      socketRooms.set(socket.id, { roomId, playerId });
      socket.join(roomId);
      ack({ ok: true, roomId, playerId, snapshot: snapshot(room, playerId) });
      emitRoom(io, room);
    });

    socket.on("joinRoom", ({ roomId, nickname, playerId: reconnectPlayerId }, ack) => {
      const room = rooms.get(roomId);
      if (!room) {
        ack({ ok: false, error: "房间不存在。" });
        return;
      }
      if (!reconnectPlayerId && room.players.size >= 8) {
        ack({ ok: false, error: "房间已满。" });
        return;
      }
      if (!reconnectPlayerId && room.phase !== "lobby") {
        ack({ ok: false, error: "游戏已经开始，暂不支持中途加入。" });
        return;
      }

      const existing = reconnectPlayerId ? room.players.get(reconnectPlayerId) : undefined;
      const player =
        existing ??
        ({
          playerId: createId("p"),
          nickname: nickname.trim() || "玩家",
          cupCount: 0,
          secondPlaceCount: 0,
          bustCount: 0,
          wins: 0,
          connected: true,
          ready: false,
          hand: [],
        } satisfies PlayerState);

      player.socketId = socket.id;
      player.connected = true;
      player.nickname = nickname.trim() || player.nickname;
      room.players.set(player.playerId, player);
      socketRooms.set(socket.id, { roomId, playerId: player.playerId });
      socket.join(roomId);
      ack({ ok: true, roomId, playerId: player.playerId, snapshot: snapshot(room, player.playerId) });
      emitRoom(io, room);
    });

    socket.on("ready", ({ roomId, ready }, ack) => {
      const found = findRoomAndPlayer(socket.id, roomId);
      if (!found.room || !found.player) {
        ackError(ack, found.error ?? "操作失败。");
        return;
      }
      if (found.room.phase !== "lobby") {
        ackError(ack, "只有房间等待中可以准备。");
        return;
      }
      found.player.ready = ready;
      ack?.({ ok: true, snapshot: snapshot(found.room, found.player.playerId) });
      emitRoom(io, found.room);
    });

    socket.on("startGame", ({ roomId }, ack) => {
      const found = findRoomAndPlayer(socket.id, roomId);
      if (!found.room || !found.player) {
        ackError(ack, found.error ?? "操作失败。");
        return;
      }
      if (found.room.hostId !== found.player.playerId) {
        ackError(ack, "只有房主可以开始。");
        return;
      }
      if (!canStart(found.room)) {
        ackError(ack, "需要 3-8 名玩家全部准备后开始。");
        return;
      }
      startRound(io, found.room);
      ack?.({ ok: true, snapshot: snapshot(found.room, found.player.playerId) });
      emitRoom(io, found.room);
    });

    socket.on("submitSplit", ({ roomId, split }, ack) => {
      const found = findRoomAndPlayer(socket.id, roomId);
      if (!found.room || !found.player) {
        ackError(ack, found.error ?? "操作失败。");
        return;
      }
      if (found.room.phase !== "splitting") {
        ackError(ack, "当前不能提交分牌。");
        return;
      }
      const error = validateSplit(found.player.hand, split);
      if (error) {
        ackError(ack, error);
        return;
      }
      found.player.submission = split;
      if (allSubmitted(found.room)) {
        revealNextRound(found.room);
      }
      ack?.({ ok: true, snapshot: snapshot(found.room, found.player.playerId) });
      emitRoom(io, found.room);
    });

    socket.on("revealNext", ({ roomId }, ack) => {
      const found = findRoomAndPlayer(socket.id, roomId);
      if (!found.room || !found.player) {
        ackError(ack, found.error ?? "操作失败。");
        return;
      }
      if (found.room.hostId !== found.player.playerId) {
        ackError(ack, "只有房主可以亮下一轮。");
        return;
      }
      if (found.room.phase === "splitting" && !allSubmitted(found.room)) {
        ackError(ack, "还有玩家未提交分牌。");
        return;
      }
      if (!["splitting", "revealing"].includes(found.room.phase)) {
        ackError(ack, "当前不能亮牌。");
        return;
      }
      revealNextRound(found.room);
      ack?.({ ok: true, snapshot: snapshot(found.room, found.player.playerId) });
      emitRoom(io, found.room);
    });

    socket.on("playAgain", ({ roomId }, ack) => {
      const found = findRoomAndPlayer(socket.id, roomId);
      if (!found.room || !found.player) {
        ackError(ack, found.error ?? "操作失败。");
        return;
      }
      if (found.room.hostId !== found.player.playerId) {
        ackError(ack, "只有房主可以开始下一局。");
        return;
      }
      if (!["roundComplete", "gameOver"].includes(found.room.phase)) {
        ackError(ack, "当前不能再来一局。");
        return;
      }
      if (found.room.phase === "gameOver") {
        for (const player of found.room.players.values()) {
          player.cupCount = 0;
          player.secondPlaceCount = 0;
          player.bustCount = 0;
          player.ready = false;
          player.submission = undefined;
          player.hand = [];
        }
        found.room.phase = "lobby";
        found.room.roundIndex = 0;
        found.room.roundResults = [];
      } else {
        startRound(io, found.room);
      }
      ack?.({ ok: true, snapshot: snapshot(found.room, found.player.playerId) });
      emitRoom(io, found.room);
    });

    socket.on("disconnect", () => {
      const current = socketRooms.get(socket.id);
      if (!current) return;
      const room = rooms.get(current.roomId);
      const player = room?.players.get(current.playerId);
      if (room && player) {
        player.connected = false;
        player.socketId = undefined;
        emitRoom(io, room);
      }
      socketRooms.delete(socket.id);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`Catch The Second is running at http://${hostname}:${port}`);
  });
});

