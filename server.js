const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  VersionedTransaction
} = require("@solana/web3.js");

const root = __dirname;
const port = Number(process.env.PORT || 8087);
const rpcUrls = (process.env.SOLANA_RPC_URLS || process.env.SOLANA_RPC_URL || [
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ironforge.network/mainnet?apiKey=01J4NJDYJXSGJYE3AN6VXEB5VR"
].join(","))
  .split(",")
  .map((url) => url.trim())
  .filter(Boolean);
const ORE_PROGRAM_ID = new PublicKey("oreV3EG1i9BEgiAJ8b177Z2S2rMarzak4NMv1kULvWv");
const ENTROPY_PROGRAM_ID = new PublicKey("3jSkUuYBoJzQPMEzTvkDFXCZUBksPamrVhrnHR9igu2X");
const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL");
const ORE_MINT_ADDRESS = new PublicKey("oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp");
const ENTROPY_VAR_ADDRESS = new PublicKey("BWCaDY96Xe4WkFq1M7UiCCRcChsJ3p51L5KrGzhxgm2E");
const ACCOUNT_DATA_OFFSET = 8;
let cachedLiveState = null;
let cachedLiveStateAt = 0;
let liveStateRefresh = null;
const liveStateClients = new Set();
let liveRefreshMs = Number(process.env.LIVE_REFRESH_MS || 3000);
let liveRefreshInFlight = false;
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
  ".wav": "audio/wav",
  ".zkey": "application/octet-stream"
};

process.on("unhandledRejection", (error) => {
  console.error("[unhandledRejection]", error && error.stack ? error.stack : error);
});

process.on("uncaughtException", (error) => {
  console.error("[uncaughtException]", error && error.stack ? error.stack : error);
});

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error("[request]", error && error.stack ? error.stack : error);
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.writeHead(500, jsonHeaders());
    response.end(JSON.stringify({ error: error.message || "Server error" }));
  });
});

server.on("clientError", (error, socket) => {
  console.error("[clientError]", error.message);
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

async function handleRequest(request, response) {
    const parsedUrl = new URL(request.url || "/", `https://${request.headers.host || "127.0.0.1"}`);
    let route = decodeURIComponent(parsedUrl.pathname);
    const query = parsedUrl.search;

    if (request.method === "OPTIONS") {
      response.writeHead(204, corsHeaders());
      response.end();
      return;
    }

    if (route === "/live-state") {
      try {
        const state = await getCachedOreLiveState();
        response.writeHead(200, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        response.end(JSON.stringify(state));
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/wallet/rewards") {
      try {
        const wallet = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get("wallet");
        const rewards = await getWalletRewards(wallet);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(rewards));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/wallet/balance") {
      try {
        const wallet = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get("wallet");
        const balance = await getWalletBalance(wallet);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(balance));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/wallet/build") {
      try {
        const body = await readJsonBody(request);
        const tx = await buildWalletTransaction(body);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(tx));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/wallet/simulate") {
      try {
        const body = await readJsonBody(request);
        const simulation = await simulateWalletTransaction(body);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(simulation));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/chat/send") {
      try {
        const body = await readJsonBody(request);
        const sent = await sendOreChatMessage(body);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(sent));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/auth/login") {
      try {
        const body = await readJsonBody(request);
        const auth = await loginOreWallet(body);
        response.writeHead(200, jsonHeaders());
        response.end(JSON.stringify(auth));
      } catch (error) {
        response.writeHead(400, jsonHeaders());
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/live-state/stream") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*"
      });
      liveStateClients.add(response);
      if (cachedLiveState) {
        response.write(`event: live-state\ndata: ${JSON.stringify(cachedLiveState)}\n\n`);
      }
      request.on("close", () => {
        liveStateClients.delete(response);
      });
      return;
    }

    if (route.startsWith("/ore-api/")) {
      const upstream = `https://api.ore.com/${route.slice("/ore-api/".length)}${query}`;
      try {
        const fetchOptions = {
          method: request.method,
          headers: forwardHeaders(request)
        };
        if (!["GET", "HEAD"].includes(request.method)) {
          fetchOptions.body = Buffer.concat(await readRequestChunks(request));
        }
        const apiResponse = await fetch(upstream, fetchOptions);
        if (route === "/ore-api/connect" && apiResponse.body) {
          response.writeHead(apiResponse.status, {
            "Content-Type": apiResponse.headers.get("content-type") || "text/event-stream",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache"
          });
          const reader = apiResponse.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            response.write(Buffer.from(value));
          }
          response.end();
          return;
        }
        const body = Buffer.from(await apiResponse.arrayBuffer());
        response.writeHead(apiResponse.status, {
          "Content-Type": apiResponse.headers.get("content-type") || "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        response.end(body);
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route.startsWith("/jup-api/")) {
      const upstream = `https://lite-api.jup.ag/${route.slice("/jup-api/".length)}${query}`;
      try {
        const apiResponse = await fetch(upstream);
        const body = Buffer.from(await apiResponse.arrayBuffer());
        response.writeHead(apiResponse.status, {
          "Content-Type": apiResponse.headers.get("content-type") || "application/json",
          "Access-Control-Allow-Origin": "*"
        });
        response.end(body);
      } catch (error) {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: error.message }));
      }
      return;
    }

    if (route === "/") route = "/index.html";

    const file = path.normalize(path.join(root, route));
    if (!file.startsWith(root)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(file, (error, data) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const ext = path.extname(file).toLowerCase();
      response.writeHead(200, {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": ext === ".js" || ext === ".css" || ext === ".html" ? "no-store" : "public, max-age=3600"
      });
      response.end(data);
    });
}

if (require.main === module) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`Ore preview running at http://127.0.0.1:${port}`);
    startLiveStateLoop();
  });
}

module.exports = { handleRequest };

function corsHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...extra
  };
}

function jsonHeaders() {
  return corsHeaders({ "Content-Type": "application/json" });
}

async function sendOreChatMessage(body) {
  const text = String(body.text || body.message || "").trim();
  const wallet = String(body.wallet || body.authority || "").trim();
  const username = String(body.username || body.name || "").trim() || shortenAddress(wallet);
  const id = toU64Number(body.id || body.message_id || makeMessageId());
  const ts = toU64Number(body.ts || body.created_at || Math.floor(Date.now() / 1000));
  if (!text) throw new Error("Enter a chat message first");
  if (!wallet) throw new Error("Connect wallet before chatting");

  const payload = {
    id,
    ts,
    text,
    message: text,
    username,
    authority: wallet
  };
  const routes = [
    "https://ore-bsm.onrender.com/chat/send",
    "https://api.ore.com/chat/send"
  ];
  let lastError = "";

  for (const upstream of routes) {
    try {
      console.log(`[chat/send] ${upstream} wallet=${wallet}`);
      const apiResponse = await fetchWithTimeout(upstream, {
        method: "POST",
        headers: chatSendHeaders(body),
        body: JSON.stringify(payload)
      }, 12000);
      const responseText = await apiResponse.text();
      if (apiResponse.ok) {
        return {
          route: upstream,
          status: apiResponse.status,
          response: parseJsonMaybe(responseText)
        };
      }
      lastError = `${upstream} ${apiResponse.status}: ${responseText.slice(0, 240)}`;
      console.error(`[chat/send] ${lastError}`);
    } catch (error) {
      lastError = `${upstream}: ${error.message}`;
      console.error(`[chat/send] ${lastError}`);
    }
  }

  throw new Error(lastError || "Ore chat send failed");
}

function chatSendHeaders(body) {
  const headers = { "Content-Type": "application/json" };
  const token = body.token || body.jwt || body.access_token || body.discord_access_token || body.authorization;
  if (token) headers.Authorization = String(token).startsWith("Bearer ") ? String(token) : `Bearer ${token}`;
  return headers;
}

async function loginOreWallet(body) {
  const message = String(body.message || "");
  const messageB64 = String(body.message_b64 || body.b64 || "");
  const signature = String(body.signature || "");
  const signatureBs58 = String(body.signature_bs58 || body.signatureBase58 || "");
  const pubkey = String(body.client_pubkey || body.pubkey || body.authority || body.wallet || "");
  if (!message || !signature || !pubkey) throw new Error("Missing wallet auth message, signature, or pubkey");
  const encodedMessage = messageB64 || Buffer.from(message, "utf8").toString("base64");

  const payloads = [
    { message: encodedMessage, signature: signatureBs58 || signature, client_pubkey: pubkey },
    { message: encodedMessage, signature, client_pubkey: pubkey },
    { message: encodedMessage, signature: signatureBs58 || signature, client_pubkey: pubkey, pubkey },
    { message: encodedMessage, signature, client_pubkey: pubkey, pubkey },
    { message, signature: signatureBs58 || signature, client_pubkey: pubkey },
    { message, signature, client_pubkey: pubkey }
  ];
  let lastError = "";

  for (const payload of payloads) {
    try {
      console.log(`[auth/login] pubkey=${pubkey} keys=${Object.keys(payload).join(",")}`);
      const apiResponse = await fetchWithTimeout("https://ore-bsm.onrender.com/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, 12000);
      const responseText = await apiResponse.text();
      if (apiResponse.ok) return parseJsonMaybe(responseText);
      lastError = `auth/login ${apiResponse.status}: ${responseText.slice(0, 240)}`;
      console.error(`[auth/login] ${lastError}`);
    } catch (error) {
      lastError = `auth/login: ${error.message}`;
      console.error(`[auth/login] ${lastError}`);
    }
  }

  throw new Error(lastError || "Ore wallet auth failed");
}

function parseJsonMaybe(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch (_) {
    return text;
  }
}

function shortenAddress(address) {
  address = String(address || "");
  return address.length > 10 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
}

function makeMessageId() {
  return Date.now();
}

function toU64Number(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : makeMessageId();
}

function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timeout));
}

async function readRequestChunks(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks;
}

async function readJsonBody(request) {
  const chunks = await readRequestChunks(request);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

function forwardHeaders(request) {
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    if (!value) continue;
    if (["host", "connection", "content-length"].includes(key.toLowerCase())) continue;
    headers[key] = value;
  }
  return headers;
}

async function getCachedOreLiveState() {
  if (cachedLiveState && Date.now() - cachedLiveStateAt < 2500) return cachedLiveState;
  try {
    return await refreshOreLiveState();
  } catch (error) {
    if (cachedLiveState) {
      return {
        ...cachedLiveState,
        stale: true,
        staleReason: error.message
      };
    }
    throw error;
  }
}

async function refreshOreLiveState() {
  const next = await getOreLiveState();
  cachedLiveState = next;
  cachedLiveStateAt = Date.now();
  broadcastLiveState(next);
  return next;
}

function startLiveStateLoop() {
  if (liveStateRefresh) return;
  scheduleLiveStateRefresh(100);
}

function scheduleLiveStateRefresh(delay = liveRefreshMs) {
  if (liveStateRefresh) clearTimeout(liveStateRefresh);
  liveStateRefresh = setTimeout(async () => {
    if (liveRefreshInFlight) {
      scheduleLiveStateRefresh(liveRefreshMs);
      return;
    }
    liveRefreshInFlight = true;
    try {
      await refreshOreLiveState();
      liveRefreshMs = Number(process.env.LIVE_REFRESH_MS || 3000);
      scheduleLiveStateRefresh(liveRefreshMs);
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      const isRateLimited = /429|too many requests|rate/i.test(message);
      liveRefreshMs = Math.min(isRateLimited ? liveRefreshMs * 2 : liveRefreshMs + 1000, 30000);
      console.warn(`Live state refresh failed (${message}). Retrying in ${liveRefreshMs}ms`);
      scheduleLiveStateRefresh(liveRefreshMs);
    } finally {
      liveRefreshInFlight = false;
    }
  }, delay);
}

function broadcastLiveState(state) {
  const payload = `event: live-state\ndata: ${JSON.stringify(state)}\n\n`;
  for (const client of liveStateClients) {
    client.write(payload);
  }
}

function readU64(buffer, offset) {
  return Number(buffer.readBigUInt64LE(offset));
}

function readU64Big(buffer, offset) {
  return buffer.readBigUInt64LE(offset);
}

function readI128(buffer, offset) {
  let value = 0n;
  for (let index = 0; index < 16; index += 1) {
    value |= BigInt(buffer[offset + index]) << BigInt(index * 8);
  }
  return value & (1n << 127n) ? value - (1n << 128n) : value;
}

function formatUnits(raw, decimals) {
  const value = BigInt(raw || 0);
  if (value === 0n) return "0";
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function readPubkey(buffer, offset) {
  return new PublicKey(buffer.subarray(offset, offset + 32)).toBase58();
}

function roundPda(roundId) {
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(BigInt(roundId));
  return PublicKey.findProgramAddressSync([Buffer.from("round"), id], ORE_PROGRAM_ID)[0];
}

function singletonPda(seed) {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], ORE_PROGRAM_ID)[0];
}

function minerPda(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from("miner"), authority.toBuffer()], ORE_PROGRAM_ID)[0];
}

function automationPda(authority) {
  return PublicKey.findProgramAddressSync([Buffer.from("automation"), authority.toBuffer()], ORE_PROGRAM_ID)[0];
}

function associatedTokenAddress(owner, mint) {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

async function firstConnection() {
  if (!rpcUrls.length) throw new Error("No Solana RPC endpoints configured");
  return new Connection(rpcUrls[0], "confirmed");
}

async function buildWalletTransaction(body) {
  const action = String(body.action || "");
  const signer = new PublicKey(body.wallet);
  const connection = await firstConnection();
  const transaction = new Transaction();
  let checkpointRoundId = null;

  if (action === "deploy") {
    const liveState = await getCachedOreLiveState();
    const lamports = solToLamports(body.amountSol);
    const squares = Array.isArray(body.squares) ? body.squares.map(Number) : [];
    const minerState = await getMinerState(connection, signer);
    if (minerState && minerState.roundId !== liveState.board.roundId) {
      checkpointRoundId = minerState.roundId;
      transaction.add(buildCheckpointInstruction(signer, minerState.roundId));
    }
    transaction.add(buildDeployInstruction(signer, lamports, liveState.board.roundId, squares));
  } else if (action === "claim-sol") {
    const minerState = await getMinerState(connection, signer);
    const boardState = await getBoardState(connection);
    if (minerState && boardState && minerState.roundId < boardState.roundId) {
      checkpointRoundId = minerState.roundId;
      transaction.add(buildCheckpointInstruction(signer, minerState.roundId));
    }
    transaction.add(buildClaimSolInstruction(signer));
  } else if (action === "claim-ore") {
    transaction.add(buildCreateAssociatedTokenIdempotentInstruction(signer, signer, ORE_MINT_ADDRESS));
    transaction.add(buildClaimOreInstruction(signer));
  } else {
    throw new Error("Unknown wallet action");
  }

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = signer;
  transaction.recentBlockhash = blockhash;

  return {
    action,
    checkpointRoundId,
    transaction: transaction.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64"),
    blockhash,
    lastValidBlockHeight
  };
}

async function simulateWalletTransaction(body) {
  const built = await buildWalletTransaction(body);
  const connection = await firstConnection();
  const transaction = Transaction.from(Buffer.from(built.transaction, "base64"));
  const simulationTransaction = new VersionedTransaction(transaction.compileMessage());
  const result = await connection.simulateTransaction(simulationTransaction, {
    sigVerify: false,
    replaceRecentBlockhash: true
  });
  return {
    ...built,
    simulation: result.value
  };
}

function buildDeployInstruction(signer, lamports, roundId, squares) {
  if (!lamports || lamports < 1) throw new Error("Enter a deploy amount greater than 0 SOL");
  if (!squares.length) throw new Error("Choose at least one block before deploying");
  if (squares.some((index) => index < 0 || index > 24 || !Number.isInteger(index))) {
    throw new Error("Block choices must be between 1 and 25");
  }

  const boardAddress = singletonPda("board");
  const data = Buffer.alloc(13);
  data[0] = 6;
  data.writeBigUInt64LE(BigInt(lamports), 1);
  data.writeUInt32LE(squares.reduce((mask, index) => mask | (1 << index), 0), 9);

  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: signer, isSigner: false, isWritable: true },
      { pubkey: automationPda(signer), isSigner: false, isWritable: true },
      { pubkey: boardAddress, isSigner: false, isWritable: true },
      { pubkey: singletonPda("config"), isSigner: false, isWritable: true },
      { pubkey: minerPda(signer), isSigner: false, isWritable: true },
      { pubkey: roundPda(roundId), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ORE_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ENTROPY_VAR_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: ENTROPY_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data
  });
}

function buildClaimSolInstruction(signer) {
  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: singletonPda("board"), isSigner: false, isWritable: true },
      { pubkey: minerPda(signer), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ORE_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([3])
  });
}

function buildCheckpointInstruction(signer, roundId) {
  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: singletonPda("board"), isSigner: false, isWritable: true },
      { pubkey: minerPda(signer), isSigner: false, isWritable: true },
      { pubkey: roundPda(roundId), isSigner: false, isWritable: true },
      { pubkey: singletonPda("treasury"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([2])
  });
}

function buildClaimOreInstruction(signer) {
  const treasury = singletonPda("treasury");
  return new TransactionInstruction({
    programId: ORE_PROGRAM_ID,
    keys: [
      { pubkey: signer, isSigner: true, isWritable: true },
      { pubkey: singletonPda("board"), isSigner: false, isWritable: true },
      { pubkey: minerPda(signer), isSigner: false, isWritable: true },
      { pubkey: ORE_MINT_ADDRESS, isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(signer, ORE_MINT_ADDRESS), isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: associatedTokenAddress(treasury, ORE_MINT_ADDRESS), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ORE_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([4])
  });
}

function buildCreateAssociatedTokenIdempotentInstruction(payer, owner, mint) {
  return new TransactionInstruction({
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedTokenAddress(owner, mint), isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
    ],
    data: Buffer.from([1])
  });
}

function solToLamports(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 1_000_000_000);
}

async function getWalletRewards(wallet) {
  const authority = new PublicKey(wallet);
  const minerAddress = minerPda(authority);
  const connection = await firstConnection();
  const [account, treasuryAccount, boardAccount] = await Promise.all([
    connection.getAccountInfo(minerAddress),
    connection.getAccountInfo(singletonPda("treasury")),
    connection.getAccountInfo(singletonPda("board"))
  ]);

  if (!account) {
    return {
      wallet: authority.toBase58(),
      minerAddress: minerAddress.toBase58(),
      exists: false,
      rewardsSol: 0,
      rewardsSolExact: "0",
      rewardsOre: 0,
      rewardsOreExact: "0",
      refinedOre: 0,
      refinedOreExact: "0",
      lifetimeDeployedSol: 0
    };
  }

  const miner = decodeMiner(account.data);
  const treasury = treasuryAccount ? decodeTreasury(treasuryAccount.data) : null;
  const board = boardAccount ? decodeBoard(boardAccount.data) : null;
  const pendingRound = board && miner.roundId > 0 && miner.roundId < board.roundId
    ? await getRoundState(connection, miner.roundId)
    : null;
  const pendingRewardsSolRaw = computePendingRoundSolRaw(miner, pendingRound);
  const rewardsSolRaw = BigInt(miner.rewardsSolRaw || 0) + pendingRewardsSolRaw;
  const computedRefinedOreRaw = computeRefinedOreRaw(miner, treasury);
  return {
    wallet: authority.toBase58(),
    minerAddress: minerAddress.toBase58(),
    exists: true,
    ...miner,
    storedRewardsSolRaw: miner.rewardsSolRaw,
    storedRewardsSol: miner.rewardsSol,
    storedRewardsSolExact: miner.rewardsSolExact,
    pendingRewardsSolRaw: pendingRewardsSolRaw.toString(),
    pendingRewardsSol: Number(pendingRewardsSolRaw) / 1_000_000_000,
    pendingRewardsSolExact: formatUnits(pendingRewardsSolRaw, 9),
    pendingCheckpointRoundId: pendingRewardsSolRaw > 0n && pendingRound ? pendingRound.id : null,
    rewardsSolRaw: rewardsSolRaw.toString(),
    rewardsSol: Number(rewardsSolRaw) / 1_000_000_000,
    rewardsSolExact: formatUnits(rewardsSolRaw, 9),
    refinedOreRaw: computedRefinedOreRaw.toString(),
    refinedOre: Number(computedRefinedOreRaw) / 100_000_000_000,
    refinedOreExact: formatUnits(computedRefinedOreRaw, 11)
  };
}

async function getMinerState(connection, authority) {
  const account = await connection.getAccountInfo(minerPda(authority));
  return account ? decodeMiner(account.data) : null;
}

async function getBoardState(connection) {
  if (cachedLiveState && cachedLiveState.board) return cachedLiveState.board;
  const account = await connection.getAccountInfo(singletonPda("board"));
  return account ? decodeBoard(account.data) : null;
}

async function getRoundState(connection, roundId) {
  const account = await connection.getAccountInfo(roundPda(roundId));
  return account ? decodeRound(account.data) : null;
}

async function getWalletBalance(wallet) {
  const authority = new PublicKey(wallet);
  const connection = await firstConnection();
  const lamports = await connection.getBalance(authority, "confirmed");
  return {
    wallet: authority.toBase58(),
    lamports,
    sol: lamports / 1_000_000_000
  };
}

function decodeMiner(data) {
  const o = ACCOUNT_DATA_OFFSET;
  const deployedOffset = o + 32;
  const cumulativeOffset = deployedOffset + 25 * 8;
  const checkpointFeeOffset = cumulativeOffset + 25 * 8;
  const checkpointIdOffset = checkpointFeeOffset + 8;
  const lastClaimOreAtOffset = checkpointIdOffset + 8;
  const lastClaimSolAtOffset = lastClaimOreAtOffset + 8;
  const rewardsFactorOffset = lastClaimSolAtOffset + 8;
  const rewardsSolOffset = rewardsFactorOffset + 16;
  const rewardsSolRaw = readU64Big(data, rewardsSolOffset);
  const rewardsOreRaw = readU64Big(data, rewardsSolOffset + 8);
  const refinedOreRaw = readU64Big(data, rewardsSolOffset + 16);

  return {
    authority: readPubkey(data, o),
    deployed: Array.from({ length: 25 }, (_, index) => readU64(data, deployedOffset + index * 8)),
    rewardsFactorRaw: readI128(data, rewardsFactorOffset).toString(),
    rewardsSolRaw: rewardsSolRaw.toString(),
    rewardsOreRaw: rewardsOreRaw.toString(),
    refinedOreRaw: refinedOreRaw.toString(),
    rewardsSol: Number(rewardsSolRaw) / 1_000_000_000,
    rewardsSolExact: formatUnits(rewardsSolRaw, 9),
    rewardsOre: Number(rewardsOreRaw) / 100_000_000_000,
    rewardsOreExact: formatUnits(rewardsOreRaw, 11),
    refinedOre: Number(refinedOreRaw) / 100_000_000_000,
    refinedOreExact: formatUnits(refinedOreRaw, 11),
    roundId: readU64(data, rewardsSolOffset + 24),
    lifetimeRewardsSol: readU64(data, rewardsSolOffset + 32) / 1_000_000_000,
    lifetimeRewardsOre: readU64(data, rewardsSolOffset + 40) / 100_000_000_000,
    lifetimeDeployedSol: readU64(data, rewardsSolOffset + 48) / 1_000_000_000
  };
}

function computeRefinedOreRaw(miner, treasury) {
  const stored = BigInt(miner.refinedOreRaw || 0);
  if (!treasury) return stored;
  const diff = BigInt(treasury.minerRewardsFactorRaw || 0) - BigInt(miner.rewardsFactorRaw || 0);
  if (diff <= 0n) return stored;
  const pending = (diff * BigInt(miner.rewardsOreRaw || 0)) >> 48n;
  return stored + pending;
}

function computePendingRoundSolRaw(miner, round) {
  if (!round || round.id !== miner.roundId) return 0n;
  const winningSquare = getWinningSquare(round);
  if (winningSquare === null) return 0n;
  const userDeployed = BigInt(miner.deployed[winningSquare] || 0);
  const winningSquareDeployed = BigInt(round.deployed[winningSquare] || 0);
  const totalWinnings = BigInt(round.totalWinnings || 0);
  if (userDeployed <= 0n || winningSquareDeployed <= 0n || totalWinnings <= 0n) return 0n;
  return (totalWinnings * userDeployed) / winningSquareDeployed;
}

function getWinningSquare(round) {
  if (!round.slotHash || /^0+$/.test(round.slotHash) || /^f+$/i.test(round.slotHash)) return null;
  const hash = Buffer.from(round.slotHash, "hex");
  if (hash.length < 32) return null;
  const rng =
    hash.readBigUInt64LE(0) ^
    hash.readBigUInt64LE(8) ^
    hash.readBigUInt64LE(16) ^
    hash.readBigUInt64LE(24);
  return Number(rng % 25n);
}

async function getOreLiveState() {
  let lastError;
  for (const rpcUrl of rpcUrls) {
    try {
      return await getOreLiveStateFromRpc(rpcUrl);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No Solana RPC endpoints configured");
}

async function getOreLiveStateFromRpc(rpcUrl) {
  const connection = new Connection(rpcUrl, "confirmed");
  const boardAddress = singletonPda("board");
  const treasuryAddress = singletonPda("treasury");
  const [boardAccount, treasuryAccount, currentSlot] = await Promise.all([
    connection.getAccountInfo(boardAddress),
    connection.getAccountInfo(treasuryAddress),
    connection.getSlot("confirmed")
  ]);

  if (!boardAccount) throw new Error("Ore board account not found");
  if (!treasuryAccount) throw new Error("Ore treasury account not found");

  const board = decodeBoard(boardAccount.data);
  const roundAddress = roundPda(board.roundId);
  const previousRoundAddress = board.roundId > 0 ? roundPda(board.roundId - 1) : null;
  const [roundAccount, previousRoundAccount] = await Promise.all([
    connection.getAccountInfo(roundAddress),
    previousRoundAddress ? connection.getAccountInfo(previousRoundAddress) : Promise.resolve(null)
  ]);
  if (!roundAccount) throw new Error(`Ore round account ${board.roundId} not found`);

  const round = decodeRound(roundAccount.data);
  const previousRound = previousRoundAccount ? decodeRound(previousRoundAccount.data) : null;
  const treasury = decodeTreasury(treasuryAccount.data);
  const slotsRemaining = Math.max(0, board.endSlot - currentSlot);

  return {
    rpcUrl,
    currentSlot,
    boardAddress: boardAddress.toBase58(),
    roundAddress: roundAddress.toBase58(),
    treasuryAddress: treasuryAddress.toBase58(),
    board,
    round,
    previousRound,
    treasury,
    slotsRemaining,
    secondsRemaining: Math.ceil(slotsRemaining * 0.4),
    updatedAt: Date.now()
  };
}

function decodeBoard(data) {
  const o = ACCOUNT_DATA_OFFSET;
  return {
    discriminator: data[0],
    roundId: readU64(data, o),
    startSlot: readU64(data, o + 8),
    endSlot: readU64(data, o + 16),
    epochId: readU64(data, o + 24)
  };
}

function decodeRound(data) {
  const o = ACCOUNT_DATA_OFFSET;
  const deployedOffset = o + 8;
  const slotHashOffset = deployedOffset + 25 * 8;
  const countOffset = slotHashOffset + 32;
  const expiresOffset = countOffset + 25 * 8;
  const motherlodeOffset = expiresOffset + 8;
  const rentPayerOffset = motherlodeOffset + 8;
  const topMinerOffset = rentPayerOffset + 32;
  const topMinerRewardOffset = topMinerOffset + 32;
  const totalDeployedOffset = topMinerRewardOffset + 8;

  return {
    discriminator: data[0],
    id: readU64(data, o),
    deployed: Array.from({ length: 25 }, (_, index) => readU64(data, deployedOffset + index * 8)),
    slotHash: data.subarray(slotHashOffset, slotHashOffset + 32).toString("hex"),
    count: Array.from({ length: 25 }, (_, index) => readU64(data, countOffset + index * 8)),
    expiresAt: readU64(data, expiresOffset),
    motherlode: readU64(data, motherlodeOffset),
    rentPayer: readPubkey(data, rentPayerOffset),
    topMiner: readPubkey(data, topMinerOffset),
    topMinerReward: readU64(data, topMinerRewardOffset),
    totalDeployed: readU64(data, totalDeployedOffset),
    totalMiners: readU64(data, totalDeployedOffset + 8),
    totalVaulted: readU64(data, totalDeployedOffset + 16),
    totalWinnings: readU64(data, totalDeployedOffset + 24)
  };
}

function decodeTreasury(data) {
  const o = ACCOUNT_DATA_OFFSET;
  return {
    discriminator: data[0],
    balance: readU64(data, o),
    motherlode: readU64(data, o + 16),
    minerRewardsFactorRaw: readI128(data, o + 24).toString(),
    totalRefined: readU64(data, o + 64),
    totalUnclaimed: readU64(data, o + 80)
  };
}
