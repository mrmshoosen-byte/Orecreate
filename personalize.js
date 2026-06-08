(function () {
  const DONATION_ADDRESS = "5b5om8qu2WrLepZ9ooTZB3Fh4WJNH7gDkEieWyHSb3uU";
  const STORAGE_KEY = "ore.personalization.v1";
  const PRESETS = {
    neon: {
      name: "Neon",
      pageBg: "#05020d",
      blockBg: "#050505",
      selectedBlockBg: "#1d4ed8",
      deployedBlockBorder: "#00f5ff",
      pickedBlockBorder: "#ffffff",
      eliminatedBlockBg: "#6b7280",
      winningBlockBg: "#f4b23a",
      blockBorder: "#ff2bd6",
      chatBg: "#080113",
      blockRadius: 14,
      blockScale: 1.02,
      font: "PilatWide, Pilat, ui-sans-serif, system-ui",
      brushColor: "#00f5ff"
    },
    hacker: {
      name: "Hacker",
      pageBg: "#020804",
      blockBg: "#020804",
      selectedBlockBg: "#063d17",
      deployedBlockBorder: "#00d46a",
      pickedBlockBorder: "#e5ffe5",
      eliminatedBlockBg: "#3f4f3f",
      winningBlockBg: "#f4b23a",
      blockBorder: "#00d46a",
      chatBg: "#001608",
      blockRadius: 2,
      blockScale: 1,
      font: "monospace",
      brushColor: "#39ff14"
    },
    motherlode: {
      name: "Motherlode",
      pageBg: "#150d02",
      blockBg: "#090705",
      selectedBlockBg: "#1d4ed8",
      deployedBlockBorder: "#2563eb",
      pickedBlockBorder: "#ffffff",
      eliminatedBlockBg: "#5b5146",
      winningBlockBg: "#f4b23a",
      blockBorder: "#ffd166",
      chatBg: "#1d1206",
      blockRadius: 10,
      blockScale: 1.03,
      font: "PilatExtended, Pilat, ui-sans-serif, system-ui",
      brushColor: "#ffd166"
    },
    cosmic: {
      name: "Cosmic",
      pageBg: "#050716",
      blockBg: "#050505",
      selectedBlockBg: "#2563eb",
      deployedBlockBorder: "#38bdf8",
      pickedBlockBorder: "#ffffff",
      eliminatedBlockBg: "#55516a",
      winningBlockBg: "#f4b23a",
      blockBorder: "#38bdf8",
      chatBg: "#080b1f",
      blockRadius: 18,
      blockScale: 1.01,
      font: "PilatWide, Pilat, ui-sans-serif, system-ui",
      brushColor: "#a78bfa"
    },
    ice: {
      name: "Ice",
      pageBg: "#06131a",
      blockBg: "#050505",
      selectedBlockBg: "#0ea5e9",
      deployedBlockBorder: "#67e8f9",
      pickedBlockBorder: "#ffffff",
      eliminatedBlockBg: "#53626b",
      winningBlockBg: "#f4b23a",
      blockBorder: "#67e8f9",
      chatBg: "#071b24",
      blockRadius: 6,
      blockScale: 1,
      font: "Pilat, ui-sans-serif, system-ui",
      brushColor: "#b9f2ff"
    }
  };

  const DEFAULTS = {
    pageBg: "#0f0e11",
    blockBg: "#050505",
    selectedBlockBg: "#1254c4",
    deployedBlockBorder: "#1d4ed8",
    pickedBlockBorder: "#ffffff",
    eliminatedBlockBg: "#6b7280",
    winningBlockBg: "#f4b23a",
    blockBorder: "#374151",
    chatBg: "#111827",
    blockRadius: 8,
    blockScale: 1,
    font: "Pilat, ui-sans-serif, system-ui",
    blockOverrides: {},
    drawing: "",
    drawingMode: false,
    brushColor: "#f4b23a",
    brushSize: 6,
    eraser: false,
    preset: "custom",
    notes: []
  };

  let state = loadState();
  let editMode = false;
  let panelsReady = false;
  let selectedBlockId = null;
  let drawCanvas = null;
  let drawContext = null;
  let isDrawing = false;
  let liveTimer = null;
  let liveEvents = null;
  let liveStateEvents = null;
  let lastLiveChatId = 0;
  const liveChatMessages = new Map();
  let latestRoundState = null;
  let priceTimer = null;
  let walletProvider = null;
  let walletAddress = localStorage.getItem("ore.wallet.address") || "";
  let walletBusy = false;
  let walletSolBalance = null;
  let suppressedClaimSolRoundId = Number(localStorage.getItem("ore.claimed.solRound") || 0) || null;
  let latestWalletRewards = {
    rewardsSol: 0,
    rewardsSolExact: "0",
    rewardsOre: 0,
    rewardsOreExact: "0",
    refinedOre: 0,
    refinedOreExact: "0"
  };
  let latestRoundBlockState = null;
  let lastRenderedRoundId = null;
  let lastResolvedRoundId = null;
  let lastPendingRoundId = null;
  let eliminationSequence = null;
  const suppressedResolvedRounds = new Set();
  let walletMinerRoundId = null;
  let duplicateCleanupObserver = null;
  const selectedDeployBlocks = new Set();
  const walletDeployedBlocks = new Set();

  function loadState() {
    try {
      return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
    } catch (_) {
      return { ...DEFAULTS };
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  async function oreFetch(path) {
    const localPath = `/ore-api/${path.replace(/^\//, "")}`;
    try {
      const response = await fetch(localPath);
      if (response.ok) return response.json();
    } catch (_) {
      // Fall through to direct fetch for hosted deployments with CORS enabled.
    }

    const response = await fetch(`https://api.ore.com/${path.replace(/^\//, "")}`);
    if (!response.ok) throw new Error(`Ore API ${response.status}`);
    return response.json();
  }

  async function oreFetchText(path) {
    const localPath = `/ore-api/${path.replace(/^\//, "")}`;
    try {
      const response = await fetch(localPath);
      return { status: response.status, text: await response.text() };
    } catch (_) {
      const response = await fetch(`https://api.ore.com/${path.replace(/^\//, "")}`);
      return { status: response.status, text: await response.text() };
    }
  }

  function applyState() {
    const root = document.documentElement;
    root.style.setProperty("--orep-page-bg", state.pageBg);
    root.style.setProperty("--orep-block-bg", state.blockBg);
    root.style.setProperty("--orep-block-selected-bg", state.selectedBlockBg);
    root.style.setProperty("--orep-block-deployed-border", state.deployedBlockBorder);
    root.style.setProperty("--orep-block-picked-border", state.pickedBlockBorder);
    root.style.setProperty("--orep-block-eliminated-bg", state.eliminatedBlockBg);
    root.style.setProperty("--orep-block-winning-bg", state.winningBlockBg);
    root.style.setProperty("--orep-block-border", state.blockBorder);
    root.style.setProperty("--orep-block-radius", `${state.blockRadius}px`);
    root.style.setProperty("--orep-block-scale", state.blockScale);
    root.style.setProperty("--orep-chat-bg", state.chatBg);
    root.style.setProperty("--orep-site-font", state.font);
    document.body.dataset.orepPreset = state.preset || "custom";
    document.body.classList.toggle("orep-chat-page", isChatEnabledPage());
    document.body.classList.toggle("orep-main-chat-active", isMainChatPage());
    document.body.classList.toggle("orep-drawing", !!state.drawingMode);
    applyBlockOverrides();
  }

  function iconButton(label, svgPath, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `orep-icon-button ${className}`;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${svgPath}</svg>`;
    return button;
  }

  function findDesktopNav() {
    const shield = [...document.querySelectorAll("a[href='shield.html'], a[href='/shield']")]
      .find((link) => /shield/i.test(link.textContent || ""));
    return shield ? shield.parentElement : null;
  }

  function findMobileShield() {
    return [...document.querySelectorAll("a[href='shield.html'], a[href='/shield']")]
      .find((link) => /shield/i.test(link.textContent || "") && link.closest(".fixed.bottom-0"));
  }

  function installToolbar() {
    if (document.querySelector(".orep-toolbar")) return true;

    const toolbar = document.createElement("span");
    toolbar.className = "orep-toolbar";
    const edit = iconButton("Customize", '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>', "orep-edit-toggle");
    const donate = iconButton("Donate", '<path d="M12 21s-7-4.4-9.2-9.1C1.2 8.4 3.5 5 7 5c2 0 3.3 1.1 4 2.1C11.7 6.1 13 5 15 5c3.5 0 5.8 3.4 4.2 6.9C17 16.6 12 21 12 21Z"/>', "orep-donate-toggle");
    toolbar.append(edit, donate);

    const desktopNav = findDesktopNav();
    if (desktopNav) {
      desktopNav.appendChild(toolbar);
    } else {
      document.body.appendChild(toolbar);
      toolbar.style.position = "fixed";
      toolbar.style.top = "18px";
      toolbar.style.right = "92px";
      toolbar.style.zIndex = "2147483000";
    }

    const mobileShield = findMobileShield();
    if (mobileShield && !document.querySelector(".orep-mobile-toolbar")) {
      const mobileToolbar = toolbar.cloneNode(true);
      mobileToolbar.classList.add("orep-mobile-toolbar");
      mobileShield.parentElement.insertBefore(mobileToolbar, mobileShield.nextSibling);
    }

    document.querySelectorAll(".orep-edit-toggle").forEach((node) => node.addEventListener("click", toggleEdit));
    document.querySelectorAll(".orep-donate-toggle").forEach((node) => node.addEventListener("click", () => togglePanel("orep-donation-panel")));
    refreshWalletUi();
    return true;
  }

  function createPanels() {
    if (panelsReady) return;
    panelsReady = true;

    const settings = document.createElement("section");
    settings.id = "orep-settings-panel";
    settings.className = "orep-panel";
    settings.innerHTML = `
      <h2>Customize Ore</h2>
      <h3>Presets</h3>
      <div class="orep-presets">
        <button type="button" data-preset="neon">Neon</button>
        <button type="button" data-preset="hacker">Hacker</button>
        <button type="button" data-preset="motherlode">Motherlode</button>
        <button type="button" data-preset="cosmic">Cosmic</button>
        <button type="button" data-preset="ice">Ice</button>
      </div>
      ${colorField("pageBg", "Background")}
      ${colorField("blockBg", "Neutral block")}
      ${colorField("blockBorder", "Neutral border")}
      ${colorField("pickedBlockBorder", "Clicked border")}
      ${colorField("selectedBlockBg", "Deployed overlay")}
      ${colorField("deployedBlockBorder", "Deployed border")}
      ${colorField("eliminatedBlockBg", "Eliminated block")}
      ${colorField("winningBlockBg", "Winning border")}
      ${colorField("chatBg", "Chat background")}
      ${rangeField("blockRadius", "Block shape", 0, 28, 1)}
      ${rangeField("blockScale", "Block size", 0.75, 1.25, 0.01)}
      <div class="orep-field"><label for="orep-font">Site font</label><select id="orep-font" data-key="font">
        <option value="Pilat, ui-sans-serif, system-ui">Pilat</option>
        <option value="PilatWide, Pilat, ui-sans-serif, system-ui">Pilat Wide</option>
        <option value="PilatExtended, Pilat, ui-sans-serif, system-ui">Pilat Extended</option>
        <option value="Arial, ui-sans-serif, system-ui">Arial</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="monospace">Mono</option>
      </select></div>
      <h3>Selected block</h3>
      <p class="orep-help">Turn on edit mode, then click or drag a block. Shape changes apply only to that block.</p>
      <div class="orep-field"><label>Block</label><span class="orep-selected-label" id="orep-selected-block">None</span></div>
      <div class="orep-field"><label for="orep-block-shape">Shape</label><select id="orep-block-shape" data-block-key="shape">
        <option value="square">Square</option>
        <option value="rounded">Rounded</option>
        <option value="circle">Circle</option>
        <option value="triangle">Triangle</option>
        <option value="diamond">Diamond</option>
        <option value="hexagon">Hexagon</option>
        <option value="pill">Pill</option>
      </select></div>
      <div class="orep-field"><label for="orep-block-size">Size</label><input id="orep-block-size" data-block-key="scale" type="range" min="0.65" max="1.45" step="0.01"></div>
      <div class="orep-actions">
        <button type="button" data-action="note">Add note</button>
        <button type="button" data-action="draw">Draw</button>
        <button type="button" data-action="eraser">Eraser</button>
        <button type="button" data-action="clear-drawing">Clear drawing</button>
        <button type="button" data-action="reset-block">Reset block</button>
        <button type="button" data-action="solo">Solo win</button>
        <button type="button" data-action="motherlode">Motherlode</button>
        <button type="button" class="secondary" data-action="reset">Reset</button>
      </div>`;
    settings.innerHTML += `
      <div class="orep-draw-tools">
        <label for="orep-brush-color">Brush color</label>
        <input id="orep-brush-color" data-key="brushColor" type="color">
        <label for="orep-brush-size">Brush size</label>
        <input id="orep-brush-size" data-key="brushSize" type="range" min="1" max="42" step="1">
      </div>`;

    const donation = document.createElement("section");
    donation.id = "orep-donation-panel";
    donation.className = "orep-panel";
    donation.innerHTML = `
      <h2>Support the miner</h2>
      <p style="margin:0 0 10px;color:#b6bbc5;font-size:13px;line-height:1.4">Donate to support more Ore miner updates.</p>
      <div class="orep-donation-address">${DONATION_ADDRESS}</div>
      <div class="orep-actions"><button type="button" class="orep-copy">Copy address</button></div>`;

    document.body.append(settings, donation);
    syncInputs();
    settings.addEventListener("input", handleSettingInput);
    settings.addEventListener("change", handleSettingInput);
    settings.addEventListener("input", handleBlockSettingInput);
    settings.addEventListener("change", handleBlockSettingInput);
    settings.addEventListener("click", handleSettingsAction);
    settings.addEventListener("click", handlePresetClick);
    donation.querySelector(".orep-copy").addEventListener("click", copyDonationAddress);
    refreshWalletUi();
  }

  function colorField(key, label) {
    return `<div class="orep-field"><label for="orep-${key}">${label}</label><input id="orep-${key}" data-key="${key}" type="color"></div>`;
  }

  function rangeField(key, label, min, max, step) {
    return `<div class="orep-field"><label for="orep-${key}">${label}</label><input id="orep-${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}"></div>`;
  }

  function syncInputs() {
    document.querySelectorAll("#orep-settings-panel [data-key]").forEach((input) => {
      input.value = state[input.dataset.key];
    });
    syncSelectedBlockControls();
  }

  function handleSettingInput(event) {
    const key = event.target.dataset.key;
    if (!key) return;
    state[key] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
    if (!["brushColor", "brushSize"].includes(key)) state.preset = "custom";
    saveState();
    applyState();
  }

  function handlePresetClick(event) {
    const presetName = event.target.dataset.preset;
    if (!presetName || !PRESETS[presetName]) return;
    applyPreset(presetName);
  }

  function applyPreset(presetName) {
    const preset = PRESETS[presetName];
    Object.assign(state, preset, { preset: presetName });
    saveState();
    applyState();
    syncInputs();
    flashPreset(presetName);
  }

  function flashPreset(presetName) {
    const burst = document.createElement("div");
    burst.className = "orep-preset-burst";
    burst.textContent = PRESETS[presetName].name;
    document.body.appendChild(burst);
    setTimeout(() => burst.remove(), 1500);
  }

  function handleBlockSettingInput(event) {
    const key = event.target.dataset.blockKey;
    if (!key || !selectedBlockId) return;
    const override = getBlockOverride(selectedBlockId);
    override[key] = event.target.type === "range" ? Number(event.target.value) : event.target.value;
    setBlockOverride(selectedBlockId, override);
    applyBlockOverrides();
  }

  function handleSettingsAction(event) {
    const action = event.target.dataset.action;
    if (!action) return;
    if (action === "note") addNote({ x: 80, y: 110, text: "" });
    if (action === "draw") toggleDrawing();
    if (action === "eraser") toggleEraser();
    if (action === "clear-drawing") clearDrawing();
    if (action === "reset-block") resetSelectedBlock();
    if (action === "solo") animateSoloWin();
    if (action === "motherlode") animateMotherlode();
    if (action === "reset") {
      state = { ...DEFAULTS, notes: [], blockOverrides: {}, drawing: "" };
      selectedBlockId = null;
      saveState();
      applyState();
      syncInputs();
      document.querySelectorAll(".orep-note").forEach((note) => note.remove());
      clearDrawing(false);
    }
  }

  function toggleEdit() {
    editMode = !editMode;
    document.body.classList.toggle("orep-editing", editMode);
    document.querySelectorAll(".orep-edit-toggle").forEach((button) => button.classList.toggle("is-active", editMode));
    togglePanel("orep-settings-panel", editMode);
    installBlockEditing();
    if (!editMode && state.drawingMode) toggleDrawing(false);
    if (!editMode) clearSelectedBlock();
  }

  function togglePanel(id, force) {
    createPanels();
    const panel = document.getElementById(id);
    const shouldOpen = typeof force === "boolean" ? force : !panel.classList.contains("is-open");
    document.querySelectorAll(".orep-panel").forEach((node) => {
      if (node !== panel) node.classList.remove("is-open");
    });
    panel.classList.toggle("is-open", shouldOpen);
  }

  function getBlockOverride(id) {
    return {
      x: 0,
      y: 0,
      shape: "square",
      scale: state.blockScale,
      ...(state.blockOverrides || {})[id]
    };
  }

  function setBlockOverride(id, override) {
    state.blockOverrides = state.blockOverrides || {};
    state.blockOverrides[id] = override;
    saveState();
  }

  function oreBlocks() {
    const seen = new Set();
    const blocks = [];
    const duplicates = [];
    document.querySelectorAll("[data-square-id]").forEach((block) => {
      const id = block.dataset.squareId;
      if (seen.has(id) || blocks.length >= 25) {
        block.classList.add("orep-duplicate-block");
        duplicates.push(block);
        return;
      }
      seen.add(id);
      block.classList.remove("orep-duplicate-block");
      blocks.push(block);
    });
    hideDuplicateMineSections(blocks, duplicates);
    return blocks;
  }

  function hideDuplicateMineSections(keptBlocks, duplicateBlocks) {
    document.querySelectorAll(".orep-duplicate-section").forEach((node) => node.classList.remove("orep-duplicate-section"));
    const keptSet = new Set(keptBlocks);
    const sections = new Set();

    duplicateBlocks.forEach((block) => {
      let node = block.parentElement;
      let best = null;
      while (node && node !== document.body) {
        const allBlocks = [...node.querySelectorAll("[data-square-id]")];
        const duplicateCount = allBlocks.filter((candidate) => !keptSet.has(candidate)).length;
        const keptCount = allBlocks.filter((candidate) => keptSet.has(candidate)).length;
        const text = node.textContent || "";
        const looksLikeMinePanel = /Manual|Auto|Deploy|Blocks|Total|You deployed|Motherlode/i.test(text);

        if (duplicateCount >= 25 && keptCount === 0) best = node;
        if (duplicateCount >= 25 && keptCount === 0 && looksLikeMinePanel) best = node;
        if (duplicateCount >= 25 && keptCount > 0) break;
        node = node.parentElement;
      }
      if (best) sections.add(best);
    });

    sections.forEach((section) => section.classList.add("orep-duplicate-section"));
  }

  function applyBlockOverrides() {
    oreBlocks().forEach((block) => {
      const id = block.dataset.squareId;
      const override = getBlockOverride(id);
      block.style.setProperty("--orep-block-x", `${override.x || 0}px`);
      block.style.setProperty("--orep-block-y", `${override.y || 0}px`);
      block.style.setProperty("--orep-block-scale", override.scale || state.blockScale);
      block.dataset.orepShape = override.shape || "square";

      if (override.shape === "rounded") {
        block.style.setProperty("--orep-block-radius", "14px");
        block.style.removeProperty("--orep-block-clip");
      } else if (override.shape === "square") {
        block.style.setProperty("--orep-block-radius", `${state.blockRadius}px`);
        block.style.removeProperty("--orep-block-clip");
      } else {
        block.style.removeProperty("--orep-block-radius");
        block.style.removeProperty("--orep-block-clip");
      }
    });
  }

  function installBlockEditing() {
    oreBlocks().forEach((block) => {
      if (block.dataset.orepEditingReady) return;
      block.dataset.orepEditingReady = "true";
      block.addEventListener("pointerdown", handleBlockPointerDown);
      block.addEventListener("click", handleBlockClick);
    });
    applyBlockOverrides();
  }

  function installDuplicateCleanup() {
    oreBlocks();
    if (duplicateCleanupObserver) return;
    duplicateCleanupObserver = new MutationObserver(() => {
      window.requestAnimationFrame(() => {
        oreBlocks();
        refreshWalletBlocks();
        syncBlockStateClasses();
      });
    });
    duplicateCleanupObserver.observe(document.body, { childList: true, subtree: true });
  }

  function handleBlockPointerDown(event) {
    if (!editMode) return;
    event.preventDefault();
    event.stopPropagation();

    const block = event.currentTarget;
    const id = block.dataset.squareId;
    selectBlock(id);

    const override = getBlockOverride(id);
    const startX = event.clientX;
    const startY = event.clientY;
    const originalX = override.x || 0;
    const originalY = override.y || 0;

    block.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      if (!block.hasPointerCapture(moveEvent.pointerId)) return;
      const next = getBlockOverride(id);
      next.x = Math.round(originalX + moveEvent.clientX - startX);
      next.y = Math.round(originalY + moveEvent.clientY - startY);
      setBlockOverride(id, next);
      applyBlockOverrides();
    };

    const up = (upEvent) => {
      if (block.hasPointerCapture(upEvent.pointerId)) block.releasePointerCapture(upEvent.pointerId);
      block.removeEventListener("pointermove", move);
      block.removeEventListener("pointerup", up);
      block.removeEventListener("pointercancel", up);
    };

    block.addEventListener("pointermove", move);
    block.addEventListener("pointerup", up);
    block.addEventListener("pointercancel", up);
  }

  function handleBlockClick(event) {
    if (editMode) return;
    const block = event.currentTarget;
    const id = Number(block.dataset.squareId);
    if (!Number.isInteger(id)) return;
    if (selectedDeployBlocks.has(id)) selectedDeployBlocks.delete(id);
    else selectedDeployBlocks.add(id);
    syncBlockStateClasses();
    updateExistingDeploySummary();
  }

  function selectedWalletBlocks() {
    const fromState = [...selectedDeployBlocks].filter((index) => index >= 0 && index < 25);
    if (fromState.length) return fromState;
    return oreBlocks()
      .filter((block) => block.classList.contains("orep-selected") || block.classList.contains("border-elements-gold") || block.classList.contains("orep-block-active"))
      .map((block) => Number(block.dataset.squareId))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < 25);
  }

  function refreshWalletBlocks() {
    const label = document.getElementById("orep-wallet-blocks");
    if (!label) return;
    const blocks = [...new Set(selectedWalletBlocks())].sort((a, b) => a - b);
    label.textContent = blocks.length ? blocks.map((index) => `#${index + 1}`).join(", ") : "No blocks selected";
  }

  function getWalletProvider() {
    const providers = [
      window.phantom && window.phantom.solana,
      window.backpack,
      window.solana
    ].filter(Boolean);
    return providers.find((provider) => provider && typeof provider.connect === "function") || null;
  }

  async function connectWallet() {
    walletProvider = getWalletProvider();
    if (!walletProvider) {
      setWalletMessage("Install Phantom or Backpack first.", true);
      return null;
    }
    const result = await walletProvider.connect();
    walletAddress = String((result && result.publicKey) || walletProvider.publicKey || "");
    localStorage.setItem("ore.wallet.address", walletAddress);
    refreshWalletUi();
    await refreshWalletBalance();
    await refreshWalletRewards();
    return walletAddress;
  }

  async function handleWalletAction(event) {
    const actionButton = event.target.closest && event.target.closest("[data-wallet-action]");
    const action = actionButton && actionButton.dataset.walletAction;
    if (!action || walletBusy) return;
    try {
      walletBusy = true;
      setWalletMessage("Waiting for wallet...");
      if (action === "connect") {
        await connectWallet();
        setWalletMessage(walletAddress ? "Wallet connected." : "Wallet not connected.");
        return;
      }

      if (!walletAddress) await connectWallet();
      if (!walletAddress) return;

      if (action === "deploy") {
        await sendOreTransaction("deploy", {
          amountSol: Number(document.getElementById("orep-deploy-amount")?.value || 0),
          squares: [...new Set(selectedWalletBlocks())]
        });
      }
      if (action === "claim-sol") await sendOreTransaction("claim-sol", {});
      if (action === "claim-ore") await sendOreTransaction("claim-ore", {});
      if (action === "claim-all") {
        const sol = Number(latestWalletRewards.rewardsSol || 0);
        const ore = Number(latestWalletRewards.rewardsOre || 0) + Number(latestWalletRewards.refinedOre || 0);
        if (sol > 0) await sendOreTransaction("claim-sol", {});
        if (ore > 0) await sendOreTransaction("claim-ore", {});
      }
    } catch (error) {
      setWalletMessage(error.message || String(error), true);
    } finally {
      walletBusy = false;
      refreshWalletUi();
    }
  }

  async function sendOreTransaction(action, payload) {
    if (!walletProvider) walletProvider = getWalletProvider();
    const web3 = await loadSolanaWeb3();
    const requestBody = { action, wallet: walletAddress, ...payload };
    const shouldSimulate = action === "deploy";
    const txResponse = await fetch(shouldSimulate ? "/wallet/simulate" : "/wallet/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const built = await txResponse.json();
    if (!txResponse.ok) throw new Error(built.error || "Could not build transaction");
    if (shouldSimulate && built.simulation && built.simulation.err) {
      const logs = Array.isArray(built.simulation.logs)
        ? built.simulation.logs.slice(-8).join(" | ")
        : "";
      console.warn("Ore transaction simulation failed", built.simulation);
      throw new Error(`Simulation failed: ${JSON.stringify(built.simulation.err)}${logs ? ` - ${logs}` : ""}`);
    }

    const bytes = Uint8Array.from(atob(built.transaction), (char) => char.charCodeAt(0));
    const transaction = web3.Transaction.from(bytes);
    let signature;
    if (typeof walletProvider.signAndSendTransaction === "function") {
      const result = await walletProvider.signAndSendTransaction(transaction);
      signature = result && (result.signature || result);
    } else {
      const signed = await walletProvider.signTransaction(transaction);
      const rpc = new web3.Connection("https://api.mainnet-beta.solana.com", "confirmed");
      signature = await rpc.sendRawTransaction(signed.serialize());
    }
    if (action === "deploy" && Array.isArray(payload.squares)) {
      markBlocksDeployed(payload.squares);
    }
    setWalletMessage(`Sent: ${shortenAddress(String(signature))}`);
    if (action === "claim-sol" || action === "claim-ore") {
      if (action === "claim-sol" && built.checkpointRoundId) {
        suppressedClaimSolRoundId = Number(built.checkpointRoundId);
        localStorage.setItem("ore.claimed.solRound", String(suppressedClaimSolRoundId));
      }
      latestWalletRewards = {
        rewardsSol: 0,
        rewardsSolExact: "0",
        rewardsOre: 0,
        rewardsOreExact: "0",
        refinedOre: 0,
        refinedOreExact: "0"
      };
      installClaimControls();
      closeClaimModal();
    }
    setTimeout(refreshWalletRewards, 1800);
  }

  function markBlocksDeployed(squares) {
    squares.forEach((index) => {
      if (Number.isInteger(Number(index))) walletDeployedBlocks.add(Number(index));
    });
    selectedDeployBlocks.clear();
    walletMinerRoundId = latestRoundBlockState ? latestRoundBlockState.roundId : walletMinerRoundId;
    syncBlockStateClasses();
    updateExistingDeploySummary();
    refreshWalletBlocks();
  }

  async function deployFromExistingControls() {
    if (walletBusy) return;
    try {
      walletBusy = true;
      if (!walletAddress) await connectWallet();
      if (!walletAddress) return;
      const squares = [...new Set(selectedWalletBlocks())];
      if (!squares.length) throw new Error("Choose at least one block first.");
      await sendOreTransaction("deploy", {
        amountSol: readExistingDeployAmount(),
        squares
      });
    } catch (error) {
      setWalletMessage(error.message || String(error), true);
      showTransientNotice(error.message || String(error));
    } finally {
      walletBusy = false;
      refreshWalletUi();
    }
  }

  function readExistingDeployAmount() {
    const input = findDeployAmountInput();
    const value = Number(input && input.value);
    if (!Number.isFinite(value) || value <= 0) throw new Error("Enter how much SOL per block.");
    return value;
  }

  function findDeployAmountInput() {
    const panel = findDeployPanel();
    const scoped = panel && [...panel.querySelectorAll("input[type='number']")]
      .find((input) => input.offsetParent !== null && input.id !== "orep-deploy-amount");
    if (scoped) return scoped;
    const inputs = [...document.querySelectorAll("input[type='number']")]
      .filter((input) => input.offsetParent !== null && input.id !== "orep-deploy-amount");
    return inputs.find((node) => /1\.0|0\.1/i.test(node.placeholder || "")) || inputs[0] || null;
  }

  function setDeployAmount(nextAmount) {
    const input = findDeployAmountInput();
    if (!input) return;
    const value = Math.max(0, Number(nextAmount) || 0);
    input.value = value ? trimDecimals(value, 3) : "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    updateExistingDeploySummary();
  }

  function updateExistingDeploySummary() {
    const count = selectedWalletBlocks().length;
    const amount = (() => {
      try {
        return readExistingDeployAmount();
      } catch (_) {
        return 0;
      }
    })();
    const panel = findDeployPanel();
    if (panel) {
      updateManualBalance(panel);
      const countNode = [...panel.querySelectorAll("span, div")]
        .find((node) => node.children.length === 0 && /^x\d+$/i.test((node.textContent || "").trim()));
      if (countNode) countNode.textContent = `x${count}`;

      const totalLabel = [...panel.querySelectorAll("span, div")]
        .find((node) => node.children.length === 0 && (node.textContent || "").trim() === "Total");
      const totalRow = totalLabel && closestRow(totalLabel);
      const totalNode = totalRow && [...totalRow.querySelectorAll("span, div")]
        .reverse()
        .find((node) => node.children.length === 0 && /^[-\d,.]+(?:\.\d+)?(?: SOL)?$/i.test((node.textContent || "").trim()));
      if (totalNode) totalNode.textContent = count && amount ? `${formatFlexibleSol(count * amount)} SOL` : "0 SOL";
    }

    [...document.querySelectorAll("button")]
      .filter((button) => /^Deploy$/i.test((button.textContent || "").trim()) && !button.closest(".orep-panel"))
      .forEach((button) => {
        button.disabled = !(count > 0 && amount > 0 && walletAddress);
      });
  }

  function updateManualBalance(panel = findDeployPanel()) {
    if (!panel || walletSolBalance === null) return;
    const amountInput = findDeployAmountInput();
    const balanceNode = [...panel.querySelectorAll("span")]
      .find((node) => {
        if (node.children.length !== 0) return false;
        if (!/^[-\d,.]+(?:\.\d+)? SOL$/i.test((node.textContent || "").trim())) return false;
        return amountInput ? node.compareDocumentPosition(amountInput) & Node.DOCUMENT_POSITION_FOLLOWING : true;
      });
    if (balanceNode) balanceNode.textContent = `${formatFixed(walletSolBalance, 3)} SOL`;
  }

  function findDeployPanel() {
    const deployButton = [...document.querySelectorAll("button")]
      .find((button) => /^Deploy$/i.test((button.textContent || "").trim()) && !button.closest(".orep-panel"));
    let node = deployButton && deployButton.parentElement;
    while (node && node !== document.body) {
      const text = node.textContent || "";
      if (/Manual/.test(text) && /Blocks/.test(text) && /Total/.test(text) && node.querySelector("input[type='number']")) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function closestRow(node) {
    let row = node.parentElement;
    while (row && row !== document.body) {
      if (String(row.className || "").includes("flex-row")) return row;
      row = row.parentElement;
    }
    return node.parentElement;
  }

  function setAllBlocksSelected(selected) {
    oreBlocks().forEach((block) => {
      const id = Number(block.dataset.squareId);
      if (!Number.isInteger(id)) return;
      if (selected) selectedDeployBlocks.add(id);
      else selectedDeployBlocks.delete(id);
    });
    syncBlockStateClasses();
    updateExistingDeploySummary();
  }

  async function refreshWalletBalance() {
    if (!walletAddress) return;
    try {
      const response = await fetch(`/wallet/balance?wallet=${encodeURIComponent(walletAddress)}`);
      const balance = await response.json();
      if (!response.ok) throw new Error(balance.error || "Could not load SOL balance");
      walletSolBalance = Number(balance.sol || 0);
      updateManualBalance();
      updateExistingDeploySummary();
    } catch (error) {
      setWalletMessage(error.message || String(error), true);
    }
  }

  function showTransientNotice(message) {
    let notice = document.querySelector(".orep-toast");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "orep-toast";
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.add("is-open");
    setTimeout(() => notice.classList.remove("is-open"), 2600);
  }

  function loadSolanaWeb3() {
    if (window.solanaWeb3 && window.solanaWeb3.Transaction) return Promise.resolve(window.solanaWeb3);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-orep-web3]");
      if (existing) {
        existing.addEventListener("load", () => resolve(window.solanaWeb3), { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.dataset.orepWeb3 = "true";
      script.src = "https://unpkg.com/@solana/web3.js@1.98.4/lib/index.iife.min.js";
      script.onload = () => resolve(window.solanaWeb3);
      script.onerror = () => reject(new Error("Could not load Solana wallet library"));
      document.head.appendChild(script);
    });
  }

  async function refreshWalletRewards() {
    if (!walletAddress) return;
    try {
      const response = await fetch(`/wallet/rewards?wallet=${encodeURIComponent(walletAddress)}`);
      const rewards = await response.json();
      if (!response.ok) throw new Error(rewards.error || "Could not load rewards");
      const walletRoundId = Number.isFinite(Number(rewards.roundId)) ? Number(rewards.roundId) : null;
      const isCurrentWalletRound = latestRoundState && walletRoundId === Number(latestRoundState.round);
      const currentRoundDeployed = isCurrentWalletRound && Array.isArray(rewards.deployed)
        ? rewards.deployed.reduce((sum, value) => sum + Number(value || 0), 0) / 1_000_000_000
        : 0;
      walletDeployedBlocks.clear();
      walletMinerRoundId = walletRoundId;
      if (isCurrentWalletRound && Array.isArray(rewards.deployed)) {
        rewards.deployed.forEach((value, index) => {
          if (Number(value || 0) > 0) walletDeployedBlocks.add(index);
        });
      }
      const pendingClaimRound = Number(rewards.pendingCheckpointRoundId || 0) || null;
      const hideClaimedPendingSol = suppressedClaimSolRoundId && pendingClaimRound === suppressedClaimSolRoundId;
      if (suppressedClaimSolRoundId && (!pendingClaimRound || pendingClaimRound !== suppressedClaimSolRoundId)) {
        suppressedClaimSolRoundId = null;
        localStorage.removeItem("ore.claimed.solRound");
      }
      const rewardsSol = hideClaimedPendingSol ? 0 : Number(rewards.rewardsSol || 0);
      const rewardsSolExact = hideClaimedPendingSol ? "0" : rewards.rewardsSolExact || formatClaimSol(rewards.rewardsSol || 0);
      writeWalletStat("orep-rewards-sol", formatFixed(rewardsSol, 3));
      writeWalletStat("orep-rewards-ore", formatFixed(rewards.rewardsOre || 0, 2));
      writeWalletStat("orep-lifetime-sol", formatFixed(rewards.lifetimeDeployedSol || 0, 3));
      latestWalletRewards = {
        rewardsSol,
        rewardsSolExact,
        rewardsOre: Number(rewards.rewardsOre || 0),
        rewardsOreExact: rewards.rewardsOreExact || formatClaimOre(rewards.rewardsOre || 0),
        refinedOre: Number(rewards.refinedOre || 0),
        refinedOreExact: rewards.refinedOreExact || formatClaimOre(rewards.refinedOre || 0)
      };
      installClaimControls();
      updateStatCard("You deployed", `${formatFlexibleSol(currentRoundDeployed)} SOL`);
      syncBlockStateClasses();
    } catch (error) {
      setWalletMessage(error.message || String(error), true);
    }
  }

  function writeWalletStat(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function refreshWalletUi() {
    const status = document.getElementById("orep-wallet-status");
    if (status) status.textContent = walletAddress ? `Connected ${shortenAddress(walletAddress)}` : "Wallet not connected";
    document.querySelectorAll("button").forEach((button) => {
      if (/^Connect$/i.test((button.textContent || "").trim()) || button.dataset.orepWalletButton === "true") {
        button.dataset.orepWalletButton = "true";
        const span = button.querySelector("span") || button;
        span.textContent = walletAddress ? shortenAddress(walletAddress) : "Connect";
      }
    });
    refreshWalletBlocks();
    installClaimControls();
    syncBlockStateClasses();
  }

  function installClaimControls() {
    const panel = findDeployPanel();
    if (!panel) return;
    let claim = panel.querySelector(".orep-rewards-section");
    if (!claim) {
      claim = document.createElement("section");
      claim.className = "orep-rewards-section";
      claim.innerHTML = `
        <h3>Rewards</h3>
        <div class="orep-reward-row">
          <span>SOL <span class="orep-info-dot">i</span></span>
          <strong><img class="orep-token-icon" src="assets/solana-dxh45a57c6c29e65788.png" alt=""><span data-claim-sol>0</span></strong>
        </div>
        <div class="orep-reward-row">
          <span>Unrefined ORE <span class="orep-info-dot">i</span></span>
          <strong><span class="orep-ore-mark">Ø</span><span data-claim-ore>0</span></strong>
        </div>
        <div class="orep-reward-row">
          <span>Refined ORE <span class="orep-info-dot">i</span></span>
          <strong><span class="orep-ore-mark">Ø</span><span data-claim-refined-ore>0</span></strong>
        </div>
        <button type="button" class="orep-claim-primary" data-claim-open>Claim</button>
        <button type="button" class="orep-claim-sol-only" data-wallet-action="claim-sol">Claim only SOL</button>`;
      const deployButton = [...panel.querySelectorAll("button")]
        .find((button) => /^Deploy$/i.test((button.textContent || "").trim()));
      const target = deployButton && deployButton.parentElement ? deployButton.parentElement : panel;
      target.parentElement.insertBefore(claim, target.nextSibling);
      hydrateClaimTokenIcons(claim);
      claim.querySelector("[data-claim-open]").addEventListener("click", openClaimModal);
    }
    hydrateClaimTokenIcons(claim);

    const sol = Number(latestWalletRewards.rewardsSol || 0);
    const ore = Number(latestWalletRewards.rewardsOre || 0);
    const refinedOre = Number(latestWalletRewards.refinedOre || 0);
    const hasSol = sol > 0;
    const hasOre = ore > 0 || refinedOre > 0;
    const claimButton = claim.querySelector("[data-claim-open]");
    const solOnlyButton = claim.querySelector('[data-wallet-action="claim-sol"]');
    const solAmount = claim.querySelector("[data-claim-sol]");
    const oreAmount = claim.querySelector("[data-claim-ore]");
    const refinedOreAmount = claim.querySelector("[data-claim-refined-ore]");
    setClaimRowVisible(solAmount, hasSol);
    setClaimRowVisible(oreAmount, hasOre);
    setClaimRowVisible(refinedOreAmount, hasOre);
    if (solAmount) solAmount.textContent = formatClaimSol(latestWalletRewards.rewardsSolExact ?? sol);
    if (oreAmount) oreAmount.textContent = formatClaimOre(latestWalletRewards.rewardsOreExact ?? ore);
    if (refinedOreAmount) refinedOreAmount.textContent = formatClaimOre(latestWalletRewards.refinedOreExact ?? refinedOre);
    if (claimButton) claimButton.disabled = walletBusy || !walletAddress || !(hasSol || hasOre);
    if (solOnlyButton) {
      solOnlyButton.hidden = !hasSol;
      solOnlyButton.disabled = walletBusy || !walletAddress || !hasSol;
    }
    claim.hidden = !walletAddress || !(hasSol || hasOre);
    updateClaimModalAmounts();
  }

  function openClaimModal() {
    ensureClaimModal();
    updateClaimModalAmounts();
    document.body.classList.add("orep-claim-modal-open");
  }

  function closeClaimModal() {
    document.body.classList.remove("orep-claim-modal-open");
  }

  function ensureClaimModal() {
    if (document.getElementById("orep-claim-modal")) return;
    const modal = document.createElement("div");
    modal.id = "orep-claim-modal";
    modal.className = "orep-claim-modal";
    modal.innerHTML = `
      <div class="orep-claim-backdrop"></div>
      <section class="orep-claim-dialog" role="dialog" aria-modal="true" aria-labelledby="orep-claim-title">
        <h2 id="orep-claim-title">Claim rewards</h2>
        <p>Are you sure you want to claim all your mining rewards, including refined and unrefined ORE?</p>
        <div class="orep-reward-row"><span>SOL</span><strong><span class="orep-sol-mark"></span><span data-modal-claim-sol>0</span></strong></div>
        <div class="orep-reward-row"><span>Unrefined ORE</span><strong><span class="orep-ore-mark">Ø</span><span data-modal-claim-ore>0</span></strong></div>
        <div class="orep-reward-row"><span>Refined ORE</span><strong><span class="orep-ore-mark">Ø</span><span data-modal-claim-refined-ore>0</span></strong></div>
        <button type="button" class="orep-claim-all" data-wallet-action="claim-all">Claim all</button>
        <button type="button" class="orep-claim-cancel">Cancel</button>
      </section>`;
    document.body.appendChild(modal);
    hydrateClaimTokenIcons(modal);
    modal.querySelector(".orep-claim-backdrop").addEventListener("click", closeClaimModal);
    modal.querySelector(".orep-claim-cancel").addEventListener("click", closeClaimModal);
  }

  function hydrateClaimTokenIcons(root) {
    root.querySelectorAll(".orep-sol-mark, .orep-ore-mark").forEach((mark) => {
      const img = document.createElement("img");
      img.className = "orep-token-icon";
      img.alt = "";
      img.src = mark.classList.contains("orep-sol-mark")
        ? "assets/solana-dxh45a57c6c29e65788.png"
        : "assets/ore-dxh2c98a5c24cf43d5.png";
      mark.replaceWith(img);
    });
  }

  function setClaimRowVisible(amountNode, visible) {
    const row = amountNode && amountNode.closest(".orep-reward-row");
    if (row) row.hidden = !visible;
  }

  function updateClaimModalAmounts() {
    const modal = document.getElementById("orep-claim-modal");
    if (!modal) return;
    const sol = Number(latestWalletRewards.rewardsSol || 0);
    const ore = Number(latestWalletRewards.rewardsOre || 0);
    const refinedOre = Number(latestWalletRewards.refinedOre || 0);
    const hasSol = sol > 0;
    const hasOre = ore > 0 || refinedOre > 0;
    const solAmount = modal.querySelector("[data-modal-claim-sol]");
    const oreAmount = modal.querySelector("[data-modal-claim-ore]");
    const refinedOreAmount = modal.querySelector("[data-modal-claim-refined-ore]");
    const claimAll = modal.querySelector('[data-wallet-action="claim-all"]');
    setClaimRowVisible(solAmount, hasSol);
    setClaimRowVisible(oreAmount, hasOre);
    setClaimRowVisible(refinedOreAmount, hasOre);
    if (solAmount) solAmount.textContent = formatClaimSol(latestWalletRewards.rewardsSolExact ?? sol);
    if (oreAmount) oreAmount.textContent = formatClaimOre(latestWalletRewards.rewardsOreExact ?? ore);
    if (refinedOreAmount) refinedOreAmount.textContent = formatClaimOre(latestWalletRewards.refinedOreExact ?? refinedOre);
    if (claimAll) claimAll.disabled = walletBusy || !(hasSol || hasOre);
  }

  function formatClaimSol(value) {
    if (typeof value === "string") return normalizeAmountString(value);
    const numeric = Number(value || 0);
    if (!numeric) return "0";
    return formatTokenDecimals(numeric, 9);
  }

  function formatClaimOre(value) {
    if (typeof value === "string") return normalizeAmountString(value);
    const numeric = Number(value || 0);
    if (!numeric) return "0";
    return formatTokenDecimals(numeric, 11);
  }

  function formatTokenDecimals(value, decimals) {
    return Number(value || 0).toFixed(decimals).replace(/\.?0+$/, "");
  }

  function normalizeAmountString(value) {
    const cleaned = String(value || "0").trim();
    if (!cleaned || cleaned === "0") return "0";
    if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return "0";
    return cleaned.replace(/^(-?)0+(?=\d)/, "$1").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  function setWalletMessage(message, isError) {
    const node = document.getElementById("orep-wallet-message");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", !!isError);
  }

  function selectBlock(id) {
    selectedBlockId = id;
    oreBlocks().forEach((block) => {
      block.classList.toggle("orep-block-active", block.dataset.squareId === id);
    });
    syncSelectedBlockControls();
    refreshWalletBlocks();
  }

  function clearSelectedBlock() {
    selectedBlockId = null;
    document.querySelectorAll(".orep-block-active").forEach((block) => block.classList.remove("orep-block-active"));
    syncSelectedBlockControls();
  }

  function syncSelectedBlockControls() {
    const label = document.getElementById("orep-selected-block");
    const shape = document.getElementById("orep-block-shape");
    const size = document.getElementById("orep-block-size");
    if (!label || !shape || !size) return;

    if (!selectedBlockId) {
      label.textContent = "None";
      shape.value = "square";
      size.value = state.blockScale;
      shape.disabled = true;
      size.disabled = true;
      return;
    }

    const override = getBlockOverride(selectedBlockId);
    label.textContent = `#${Number(selectedBlockId) + 1}`;
    shape.disabled = false;
    size.disabled = false;
    shape.value = override.shape || "square";
    size.value = override.scale || state.blockScale;
  }

  function resetSelectedBlock() {
    if (!selectedBlockId) return;
    state.blockOverrides = state.blockOverrides || {};
    delete state.blockOverrides[selectedBlockId];
    saveState();
    applyBlockOverrides();
    syncSelectedBlockControls();
  }

  function installDrawingCanvas() {
    if (drawCanvas) return;
    drawCanvas = document.createElement("canvas");
    drawCanvas.className = "orep-draw-canvas";
    document.body.appendChild(drawCanvas);
    drawContext = drawCanvas.getContext("2d");

    window.addEventListener("resize", resizeDrawingCanvas);
    drawCanvas.addEventListener("pointerdown", startDrawing);
    drawCanvas.addEventListener("pointermove", drawLine);
    drawCanvas.addEventListener("pointerup", stopDrawing);
    drawCanvas.addEventListener("pointercancel", stopDrawing);
    resizeDrawingCanvas();
  }

  function resizeDrawingCanvas() {
    if (!drawCanvas || !drawContext) return;
    const snapshot = state.drawing || drawCanvas.toDataURL("image/png");
    const ratio = window.devicePixelRatio || 1;
    drawCanvas.width = Math.round(window.innerWidth * ratio);
    drawCanvas.height = Math.round(window.innerHeight * ratio);
    drawCanvas.style.width = "100vw";
    drawCanvas.style.height = "100vh";
    drawContext.setTransform(ratio, 0, 0, ratio, 0, 0);
    restoreDrawing(snapshot);
  }

  function restoreDrawing(snapshot = state.drawing) {
    if (!snapshot || !drawContext) return;
    const image = new Image();
    image.onload = () => {
      drawContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
      drawContext.drawImage(image, 0, 0, window.innerWidth, window.innerHeight);
    };
    image.src = snapshot;
  }

  function toggleDrawing(force) {
    installDrawingCanvas();
    state.drawingMode = typeof force === "boolean" ? force : !state.drawingMode;
    state.eraser = false;
    saveState();
    applyState();
  }

  function toggleEraser() {
    installDrawingCanvas();
    state.drawingMode = true;
    state.eraser = !state.eraser;
    saveState();
    applyState();
  }

  function startDrawing(event) {
    if (!state.drawingMode || !drawContext) return;
    isDrawing = true;
    drawCanvas.setPointerCapture(event.pointerId);
    drawContext.beginPath();
    drawContext.moveTo(event.clientX, event.clientY);
  }

  function drawLine(event) {
    if (!isDrawing || !drawContext) return;
    drawContext.lineCap = "round";
    drawContext.lineJoin = "round";
    drawContext.lineWidth = state.brushSize;
    drawContext.globalCompositeOperation = state.eraser ? "destination-out" : "source-over";
    drawContext.strokeStyle = state.brushColor;
    drawContext.lineTo(event.clientX, event.clientY);
    drawContext.stroke();
  }

  function stopDrawing(event) {
    if (!isDrawing) return;
    isDrawing = false;
    if (drawCanvas.hasPointerCapture(event.pointerId)) drawCanvas.releasePointerCapture(event.pointerId);
    drawContext.closePath();
    drawContext.globalCompositeOperation = "source-over";
    state.drawing = drawCanvas.toDataURL("image/png");
    saveState();
  }

  function clearDrawing(shouldSave = true) {
    installDrawingCanvas();
    drawContext.clearRect(0, 0, window.innerWidth, window.innerHeight);
    state.drawing = "";
    if (shouldSave) saveState();
  }

  function addNote(noteData) {
    const note = document.createElement("div");
    note.className = "orep-note";
    note.style.left = `${noteData.x || 80}px`;
    note.style.top = `${noteData.y || 110}px`;
    note.innerHTML = `<div class="orep-note-head">Move</div><textarea placeholder="Note">${noteData.text || ""}</textarea><button type="button">Done</button>`;
    document.body.appendChild(note);

    const textarea = note.querySelector("textarea");
    const persist = () => {
      state.notes = [...document.querySelectorAll(".orep-note")].map((node) => ({
        x: Number.parseInt(node.style.left, 10) || 0,
        y: Number.parseInt(node.style.top, 10) || 0,
        text: node.querySelector("textarea").value
      }));
      saveState();
    };

    textarea.addEventListener("input", persist);
    note.querySelector("button").addEventListener("click", persist);
    makeDraggable(note, persist, note.querySelector(".orep-note-head"));
    persist();
  }

  function makeDraggable(note, onDone, handle = note) {
    let startX = 0;
    let startY = 0;
    let left = 0;
    let top = 0;

    handle.addEventListener("pointerdown", (event) => {
      if (event.target.tagName === "TEXTAREA" || event.target.tagName === "BUTTON") return;
      startX = event.clientX;
      startY = event.clientY;
      left = Number.parseInt(note.style.left, 10) || 0;
      top = Number.parseInt(note.style.top, 10) || 0;
      handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
      if (!handle.hasPointerCapture(event.pointerId)) return;
      note.style.left = `${Math.max(0, left + event.clientX - startX)}px`;
      note.style.top = `${Math.max(0, top + event.clientY - startY)}px`;
    });

    handle.addEventListener("pointerup", (event) => {
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      onDone();
    });
  }

  function restoreNotes() {
    (state.notes || []).forEach(addNote);
  }

  function animateSoloWin() {
    const blocks = oreBlocks();
    const block = blocks[Math.floor(Math.random() * blocks.length)];
    if (!block) return;
    block.classList.add("orep-winning");
    setTimeout(() => block.classList.remove("orep-winning"), 4200);
  }

  function animateMotherlode() {
    const target = [...document.querySelectorAll("button, span, div")]
      .find((node) => /motherlode/i.test(node.textContent || ""));
    if (!target) return;
    target.classList.add("orep-motherlode-pulse");
    setTimeout(() => target.classList.remove("orep-motherlode-pulse"), 5200);
  }

  function installLiveSync() {
    if (liveTimer) return;
    installLiveStream();
    installLiveStateStream();
    installPriceSync();
    refreshLiveSync();
    liveTimer = setInterval(refreshLiveSync, 2500);
    setInterval(updateRoundCountdown, 1000);
  }

  function installPriceSync() {
    if (priceTimer) return;
    refreshPrices();
    priceTimer = setInterval(refreshPrices, 15000);
  }

  function installLiveStream() {
    if (liveEvents || !window.EventSource) return;
    try {
      liveEvents = new EventSource("/ore-api/connect");
      liveEvents.addEventListener("chat_batch", handleLiveEvent);
      liveEvents.addEventListener("message", handleLiveEvent);
      liveEvents.onerror = () => {
        if (liveEvents) liveEvents.close();
        liveEvents = null;
        setTimeout(installLiveStream, 5000);
      };
    } catch (_) {
      liveEvents = null;
    }
  }

  function installLiveStateStream() {
    if (liveStateEvents || !window.EventSource) return;
    try {
      liveStateEvents = new EventSource("/live-state/stream");
      liveStateEvents.addEventListener("live-state", (event) => {
        if (!event.data) return;
        try {
          renderLiveState(JSON.parse(event.data));
        } catch (_) {
          // Ignore malformed transient stream data.
        }
      });
      liveStateEvents.onerror = () => {
        if (liveStateEvents) liveStateEvents.close();
        liveStateEvents = null;
        setTimeout(installLiveStateStream, 2500);
      };
    } catch (_) {
      liveStateEvents = null;
    }
  }

  function handleLiveEvent(event) {
    if (!event.data) return;
    try {
      const payload = JSON.parse(event.data);
      if (payload.ChatBatch) renderLiveChat(payload.ChatBatch);
      if (payload.Chat) renderLiveChat([payload.Chat]);
      if (payload.messages) renderLiveChat(payload.messages);
      if (Array.isArray(payload)) renderLiveChat(payload);
    } catch (_) {
      // Ignore stream keep-alives or unsupported notification types.
    }
  }

  async function refreshLiveSync() {
    try {
      const [chat, liveState] = await Promise.all([
        liveFetch("chat/history?limit=20", { messages: [] }),
        fetchLiveState()
      ]);
      renderLiveChat(extractChatMessages(chat));
      renderLiveState(liveState);
    } catch (error) {
      console.warn("Ore live sync failed", error);
    }
  }

  async function refreshPrices() {
    try {
      const ids = "oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp,So11111111111111111111111111111111111111112";
      const response = await fetch(`/jup-api/price/v3?ids=${ids}`);
      if (!response.ok) throw new Error(`Price ${response.status}`);
      const prices = await response.json();
      updateHeaderPrice("ORE", prices.oreoU2P8bN6jkk3jbaiVxYnG1dCXcYxwhwyK9jSybcp?.usdPrice);
      updateHeaderPrice("SOL", prices.So11111111111111111111111111111111111111112?.usdPrice);
    } catch (error) {
      console.warn("Price sync failed", error);
    }
  }

  function updateHeaderPrice(symbol, price) {
    if (!Number.isFinite(Number(price))) return;
    const formatted = `$${Number(price).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    [...document.querySelectorAll("a")]
      .filter((link) => (link.textContent || "").includes(symbol) && /\$\d/.test(link.textContent || ""))
      .slice(0, 3)
      .forEach((link) => {
        const spans = [...link.querySelectorAll("span")];
        const priceSpan = spans.reverse().find((span) => /\$\d/.test(span.textContent || ""));
        if (priceSpan) priceSpan.textContent = formatted;
      });
  }

  async function fetchLiveState() {
    const response = await fetch("/live-state");
    if (!response.ok) throw new Error(`Live state ${response.status}`);
    return response.json();
  }

  async function liveFetch(path, fallback) {
    try {
      return await oreFetch(path);
    } catch (_) {
      return fallback;
    }
  }

  function normalizeEvent(event) {
    if (event && !Array.isArray(event) && typeof event === "object") return event;
    if (!Array.isArray(event)) return null;
    return event[1] || event[0] || null;
  }

  function extractChatMessages(payload) {
    if (Array.isArray(payload)) return payload.map(normalizeEvent).filter(Boolean);
    if (Array.isArray(payload.messages)) return payload.messages.map(normalizeEvent).filter(Boolean);
    if (Array.isArray(payload.ChatBatch)) return payload.ChatBatch.map(normalizeEvent).filter(Boolean);
    if (payload.Chat) return [normalizeEvent(payload.Chat) || payload.Chat].filter(Boolean);
    return [];
  }

  function renderLiveChat(messages) {
    messages = extractChatMessages(messages);
    if (!messages.length) return;
    let hasNew = false;
    messages.forEach((message) => {
      const id = chatMessageKey(message);
      const existing = liveChatMessages.get(id);
      const normalized = normalizeChatMessage(message);
      if (!existing || JSON.stringify(existing) !== JSON.stringify(normalized)) hasNew = true;
      liveChatMessages.set(id, normalized);
    });
    const ordered = [...liveChatMessages.values()].sort(compareChatMessages).slice(0, 60);
    liveChatMessages.clear();
    ordered.forEach((message) => liveChatMessages.set(chatMessageKey(message), message));
    const newestId = ordered[0] && ordered[0].id;
    if (!hasNew && newestId && newestId === lastLiveChatId) return;
    lastLiveChatId = newestId || lastLiveChatId;
    renderCapturedChat(ordered);
  }

  function normalizeChatMessage(message) {
    return {
      ...message,
      id: message.id || message.message_id || message.ts || `${message.authority || "miner"}-${message.text || ""}`,
      text: message.text || message.message || message.content || "",
      username: message.username || message.name || "",
      authority: message.authority || message.wallet || "",
      created_at: Number(message.created_at || message.timestamp || message.ts || Date.now() / 1000),
      profile_photo_url: message.profile_photo_url || message.profilePhotoUrl || ""
    };
  }

  function chatMessageKey(message) {
    return String(message.id || message.message_id || `${message.authority || "miner"}-${message.ts || message.created_at || ""}-${message.text || message.message || message.content || ""}`);
  }

  function compareChatMessages(a, b) {
    const idA = Number(a.id || 0);
    const idB = Number(b.id || 0);
    if (idA || idB) return idB - idA;
    return Number(b.created_at || 0) - Number(a.created_at || 0);
  }

  function renderCapturedChat(messages) {
    const chatContainer = document.querySelector("[data-chat-scroll-container]") || ensureMainChatSurface();
    if (!chatContainer || !isChatEnabledPage()) return;
    if (chatContainer.dataset.orepLiveChat === "true") {
      chatContainer.innerHTML = "";
    }
    chatContainer.dataset.orepLiveChat = "true";
    const displayMessages = messages.slice().reverse();
    chatContainer.innerHTML = displayMessages.map((message, index) => {
      const name = escapeHtml(message.username || shortenAddress(message.authority) || "Miner");
      const rawText = message.text || message.message || message.content || "";
      const text = escapeHtml(rawText);
      const img = message.profile_photo_url || "assets/icon.png";
      const createdAt = Number(message.created_at || message.timestamp || message.ts || Date.now() / 1000);
      const authority = message.authority || message.wallet || "";
      const previous = displayMessages[index - 1];
      const sameSender = previous && chatSenderKey(previous) === chatSenderKey(message);
      const margin = sameSender ? "mt-0" : "mt-4";
      const avatar = sameSender
        ? `<div class="h-0 w-8 flex-shrink-0"></div>`
        : `<div class="relative inline-block"><img alt="Profile photo" class="h-8 w-8 rounded-full object-cover flex-shrink-0 self-start mt-1 cursor-pointer" src="${escapeAttr(img)}"></div>`;
      const header = sameSender ? "" : `<div class="flex flex-row items-baseline mb-1 justify-between">
          <div class="flex flex-row items-center gap-2"><span class="text-base font-semibold my-auto text-elements-lowEmphasis">${name}</span></div>
          <span class="text-sm font-medium my-auto text-elements-lowEmphasis">${escapeHtml(formatChatTime(createdAt))}</span>
        </div>`;
      return `<div data-orep-chat-message="true" data-username="${escapeAttr(message.username || "")}" data-authority="${escapeAttr(authority)}" data-text="${escapeAttr(rawText)}" data-created-at="${createdAt}" class="relative group px-4 py-1 hover:bg-surface-floatingHover transition-colors ${margin}">
        <div class="flex flex-row gap-2">
          ${avatar}
          <div class="flex flex-col flex-1 min-w-0">
            ${header}
            <div class="text-md text-elements-midEmphasis font-medium break-words">${text}</div>
          </div>
        </div>
      </div>`;
    }).join("") + `<div class="orep-chat-bottom-spacer" aria-hidden="true"></div>`;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function chatSenderKey(message) {
    return String(message.authority || message.wallet || message.username || message.name || "");
  }

  function formatChatTime(seconds) {
    const date = new Date(Number(seconds || Date.now() / 1000) * 1000);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  }

  function renderLiveState(state) {
    if (!state || !state.board || !state.round || !state.treasury) return;

    const boardRoundId = Number(state.board.roundId);
    if (lastRenderedRoundId !== null && lastRenderedRoundId !== boardRoundId) {
      resetRoundUi();
      updateStatCard("You deployed", "0 SOL");
      suppressedResolvedRounds.clear();
    }
    lastRenderedRoundId = boardRoundId;

    const motherlodeOre = Number(state.treasury.motherlode || state.round.motherlode || 0) / 100_000_000_000;
    const totalDeployedSol = lamportsToSol(state.round.totalDeployed);
    latestRoundState = {
      round: boardRoundId,
      currentSlot: Number(state.currentSlot),
      endSlot: Number(state.board.endSlot),
      resetTs: Math.round(Date.now() / 1000),
      totalDeployedSol,
      motherlodeOre
    };

    replaceTextByLabel("Round #", `Round #${Number(state.board.roundId).toLocaleString()}`);
    replaceTextByLabel("Round:", `Round: #${Number(state.board.roundId).toLocaleString()}`);
    updateStatCard("Motherlode", formatFixed(motherlodeOre, 1));
    updateStatCard("Total deployed", formatMaxDecimals(totalDeployedSol, 4));
    updateRoundCountdown();
    updateLiveBlocks(selectVisibleRoundForBlockState(state), state);
  }

  function selectVisibleRoundForBlockState(state) {
    const currentWinningSquare = winningSquareFromSlotHash(state.round.slotHash);
    if (Number.isInteger(currentWinningSquare)) return state.round;
    const previousWinningSquare = state.previousRound && winningSquareFromSlotHash(state.previousRound.slotHash);
    const previousRoundId = state.previousRound && Number(state.previousRound.id);
    const slotsSinceStart = Number(state.currentSlot || 0) - Number(state.board.startSlot || 0);
    const currentRoundIsFresh = Number(state.round.totalDeployed || 0) === 0 || slotsSinceStart <= 45;
    const shouldShowPreviousResolution =
      Number.isInteger(previousWinningSquare) &&
      previousRoundId === Number(state.board.roundId) - 1 &&
      !suppressedResolvedRounds.has(previousRoundId) &&
      currentRoundIsFresh;
    return shouldShowPreviousResolution ? state.previousRound : state.round;
  }

  function updateLiveBlocks(round, liveState) {
    if (!Array.isArray(round.deployed) || !Array.isArray(round.count)) return;
    const winningSquare = winningSquareFromSlotHash(round.slotHash);
    latestRoundBlockState = {
      roundId: Number(round.id),
      deployed: round.deployed.map((value) => Number(value || 0)),
      count: round.count.map((value) => Number(value || 0)),
      winningSquare,
      eliminationOrder: buildEliminationOrder(Number(round.id), winningSquare),
      resolutionPending: !Number.isInteger(winningSquare) && Number(liveState && liveState.slotsRemaining) <= 0
    };
    if (latestRoundBlockState.resolutionPending && lastPendingRoundId !== latestRoundBlockState.roundId) {
      lastPendingRoundId = latestRoundBlockState.roundId;
      startEliminationSequence({
        ...latestRoundBlockState,
        eliminationOrder: buildEliminationOrder(latestRoundBlockState.roundId, null).slice(0, 20)
      });
    }
    if (Number.isInteger(latestRoundBlockState.winningSquare) && lastResolvedRoundId !== latestRoundBlockState.roundId) {
      lastResolvedRoundId = latestRoundBlockState.roundId;
      startEliminationSequence(latestRoundBlockState);
    }
    oreBlocks().forEach((block) => {
      const index = Number(block.dataset.squareId);
      updateBlockNumber(block, index);
      updateBlockCount(block, round.count[index]);
      updateBlockAmount(block, lamportsToSol(round.deployed[index]));
    });
    syncBlockStateClasses();
  }

  function syncBlockStateClasses() {
    oreBlocks().forEach((block) => {
      const index = Number(block.dataset.squareId);
      if (!Number.isInteger(index)) return;
      const isRoundResolved = latestRoundBlockState && Number.isInteger(latestRoundBlockState.winningSquare);
      const sequencedRound = eliminationSequence && eliminationSequence.roundId === latestRoundBlockState.roundId;
      const isWinner = isRoundResolved && latestRoundBlockState.winningSquare === index && (!sequencedRound || eliminationSequence.winnerRevealed);
      const isEliminated = isRoundResolved && (
        sequencedRound
          ? eliminationSequence.eliminated.has(index)
          : latestRoundBlockState.winningSquare !== index
      );
      const isWalletRound = latestRoundBlockState && walletMinerRoundId === latestRoundBlockState.roundId;
      block.classList.toggle("orep-deploy-selected", selectedDeployBlocks.has(index));
      block.classList.toggle("orep-wallet-deployed", !isEliminated && !isRoundResolved && isWalletRound && walletDeployedBlocks.has(index));
      block.classList.toggle("orep-round-eliminated", !!isEliminated);
      block.classList.toggle("orep-round-winning", !!isWinner);
    });
  }

  function startEliminationSequence(roundState) {
    if (eliminationSequence && Array.isArray(eliminationSequence.timers)) {
      eliminationSequence.timers.forEach((timer) => clearTimeout(timer));
    }
    eliminationSequence = {
      roundId: roundState.roundId,
      eliminated: new Set(),
      winnerRevealed: false,
      timers: []
    };
    oreBlocks().forEach((block) => {
      block.classList.remove("orep-round-eliminated", "orep-round-winning");
      void block.offsetWidth;
    });

    const isResolved = Number.isInteger(roundState.winningSquare);
    const order = roundState.eliminationOrder || [];
    const visibleOrder = isResolved ? order.slice(Math.max(0, order.length - 16)) : order;
    const interval = isResolved ? 340 : 70;
    if (isResolved) {
      order.slice(0, Math.max(0, order.length - visibleOrder.length)).forEach((index) => {
        eliminationSequence.eliminated.add(index);
      });
    }
    visibleOrder.forEach((index, rank) => {
      const timer = setTimeout(() => {
        if (!eliminationSequence || eliminationSequence.roundId !== roundState.roundId) return;
        eliminationSequence.eliminated.add(index);
        syncBlockStateClasses();
      }, rank * interval);
      eliminationSequence.timers.push(timer);
    });

    if (isResolved) {
      const revealTimer = setTimeout(() => {
        if (!eliminationSequence || eliminationSequence.roundId !== roundState.roundId) return;
        eliminationSequence.winnerRevealed = true;
        syncBlockStateClasses();
        const resetTimer = setTimeout(() => {
          if (!eliminationSequence || eliminationSequence.roundId !== roundState.roundId) return;
          resetRoundUi();
        }, 650);
        eliminationSequence.timers.push(resetTimer);
      }, visibleOrder.length * interval + 220);
      eliminationSequence.timers.push(revealTimer);
    }
    syncBlockStateClasses();
  }

  function resetRoundUi() {
    if (eliminationSequence && Array.isArray(eliminationSequence.timers)) {
      eliminationSequence.timers.forEach((timer) => clearTimeout(timer));
    }
    if (eliminationSequence && Number.isInteger(eliminationSequence.roundId)) {
      suppressedResolvedRounds.add(eliminationSequence.roundId);
    }
    eliminationSequence = null;
    latestRoundBlockState = null;
    lastPendingRoundId = null;
    selectedDeployBlocks.clear();
    walletDeployedBlocks.clear();
    walletMinerRoundId = null;
    oreBlocks().forEach((block) => {
      block.classList.remove(
        "orep-deploy-selected",
        "orep-wallet-deployed",
        "orep-round-eliminated",
        "orep-round-winning",
        "orep-winning",
        "border-elements-gold"
      );
    });
    updateExistingDeploySummary();
    refreshWalletBlocks();
  }

  function winningSquareFromSlotHash(slotHash) {
    const normalized = String(slotHash || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(normalized)) return null;
    if (/^0+$/.test(normalized) || /^f+$/.test(normalized)) return null;
    const rng =
      readU64LeFromHex(normalized, 0) ^
      readU64LeFromHex(normalized, 8) ^
      readU64LeFromHex(normalized, 16) ^
      readU64LeFromHex(normalized, 24);
    return Number(rng % 25n);
  }

  function buildEliminationOrder(roundId, winningSquare) {
    const ids = Array.from({ length: 25 }, (_, index) => index)
      .filter((index) => index !== winningSquare);
    let seed = BigInt(Math.max(1, Number(roundId || 1)));
    for (let i = ids.length - 1; i > 0; i -= 1) {
      seed = (seed * 1103515245n + 12345n) & 0x7fffffffn;
      const j = Number(seed % BigInt(i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  function readU64LeFromHex(hex, byteOffset) {
    let value = 0n;
    for (let i = 0; i < 8; i += 1) {
      const byte = BigInt(parseInt(hex.slice((byteOffset + i) * 2, (byteOffset + i + 1) * 2), 16));
      value |= byte << BigInt(i * 8);
    }
    return value;
  }

  function updateBlockNumber(block, index) {
    const number = [...block.querySelectorAll("span")].find((span) => /^#/.test((span.textContent || "").trim()));
    if (number) number.textContent = `#${index + 1}`;
  }

  function updateBlockCount(block, count) {
    const rows = [...block.querySelectorAll("div")];
    const countRow = rows.find((row) => row.querySelector("svg") && [...row.querySelectorAll("span")].some((span) => /^\d+$/.test((span.textContent || "").trim())));
    const countSpan = countRow && [...countRow.querySelectorAll("span")].find((span) => /^\d+$/.test((span.textContent || "").trim()));
    if (countSpan) countSpan.textContent = String(Number(count || 0));
  }

  function updateBlockAmount(block, amountSol) {
    const amountContainer = [...block.querySelectorAll("div")].find((node) => node.className && String(node.className).includes("mt-auto") && String(node.className).includes("ml-auto"));
    const amountSpan = amountContainer && [...amountContainer.querySelectorAll("span")].find((span) => !/^#/.test((span.textContent || "").trim()));
    if (amountSpan) amountSpan.textContent = formatFixed(amountSol, 3);
  }

  async function refreshCurrentRoundSlots(roundId) {
    const result = await oreFetchText(`miners?round_id=${roundId}`);
    const match = result.text.match(/current slot is (\d+) and end slot is (\d+)/i);
    if (!match) return;
    latestRoundState.currentSlot = Number(match[1]);
    latestRoundState.endSlot = Number(match[2]);
    updateRoundCountdown();
  }

  function updateRoundCountdown() {
    if (!latestRoundState || !latestRoundState.resetTs) return;
    let remaining;
    if (latestRoundState.currentSlot && latestRoundState.endSlot) {
      remaining = Math.max(0, Math.ceil((latestRoundState.endSlot - latestRoundState.currentSlot) * 0.4));
    } else {
      const elapsed = Math.max(0, Date.now() / 1000 - latestRoundState.resetTs);
      const roundLength = 75;
      remaining = Math.max(0, Math.ceil(roundLength - (elapsed % roundLength)));
    }
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    const text = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    updateStatCard("Time remaining", text);
  }

  function updateStatCard(label, value) {
    findStatCards(label).forEach((card) => {
      const valueSpan = getPrimaryStatValueSpan(card);
      if (valueSpan) {
        writeStatValue(valueSpan, value);
      }
    });
  }

  function findStatCards(label) {
    return [...new Set([...document.querySelectorAll("span")]
      .filter((node) => (node.textContent || "").trim() === label)
      .map((labelNode) => labelNode.closest("button"))
      .filter(Boolean))];
  }

  function getPrimaryStatValueSpan(card) {
    const labelSpans = [...card.querySelectorAll("span")]
      .filter((node) => /Motherlode|Time remaining|Total deployed|You deployed/.test(node.textContent || ""));
    const candidates = [...card.querySelectorAll(":scope > span")]
      .filter((node) => !labelSpans.includes(node));
    return candidates.find((node) => node.className && String(node.className).includes("text-elements-highEmphasis")) || candidates[0] || null;
  }

  function writeStatValue(container, value) {
    if (container.children.length === 0) {
      container.textContent = value;
      return;
    }
    container.setAttribute("data-orep-live-value", value);
    const row = [...container.querySelectorAll("div")]
      .reverse()
      .find((node) => [...node.querySelectorAll("span")].some((span) => /[0-9]/.test(span.textContent || "")));
    const spans = row
      ? [...row.querySelectorAll("span")].filter((span) => span.children.length === 0)
      : [...container.querySelectorAll("span")].filter((span) => span.children.length === 0);
    if (!spans.length) {
      container.textContent = value;
      return;
    }
    const parts = splitValue(value);
    spans[0].textContent = parts[0];
    if (spans[1]) spans[1].textContent = parts[1] || "";
    spans.slice(2).forEach((span) => {
      span.textContent = "";
    });
  }

  function replaceTextByLabel(prefix, value) {
    [...document.querySelectorAll("span, button, div")]
      .filter((node) => (node.textContent || "").trim().startsWith(prefix))
      .slice(0, 4)
      .forEach((node) => {
        if (node.children.length === 0) node.textContent = value;
      });
  }

  function replaceTextExact(pattern, value, skip = 0) {
    [...document.querySelectorAll("span, button, div")]
      .filter((node) => node.children.length === 0 && pattern.test((node.textContent || "").trim()))
      .slice(skip, skip + 4)
      .forEach((node) => {
        node.textContent = value;
      });
  }

  function splitValue(value) {
    const text = String(value);
    const match = text.match(/^([^.\s]+)(\.[^\s]+)?(\s.*)?$/);
    if (!match) return [text, ""];
    return [match[1], `${match[2] || ""}${match[3] || ""}`];
  }

  function lamportsToSol(value) {
    return Number(value || 0) / 1_000_000_000;
  }

  function formatOre(value) {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function formatFixed(value, digits) {
    return Number(value || 0).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    });
  }

  function trimDecimals(value, digits) {
    return Number(value || 0).toFixed(digits).replace(/\.?0+$/, "");
  }

  function formatFlexibleSol(value) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return "0";
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 9
    });
  }

  function formatMaxDecimals(value, digits) {
    const numeric = Number(value || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return "0";
    return numeric.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: digits
    });
  }

  function secondsAgo(ts) {
    return Math.max(0, Math.round(Date.now() / 1000 - Number(ts || 0)));
  }

  function shortenAddress(address) {
    if (!address) return "";
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  async function copyDonationAddress() {
    try {
      await navigator.clipboard.writeText(DONATION_ADDRESS);
    } catch (_) {
      const input = document.createElement("input");
      input.value = DONATION_ADDRESS;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function installChatControls() {
    if (!isChatEnabledPage()) return;
    ensureMainChatSurface();
    if (isMainChatPage()) {
      removeChatComposer();
    } else {
      const custom = ensureChatComposer();
      wireChatInput(custom.input, custom.button);
    }

    let input = findChatInput();
    let button = findChatButton(input);
    if (!input || !button) return;
    ({ input, button } = detachCapturedChatControls(input, button));
    input.disabled = false;
    input.readOnly = false;
    input.removeAttribute("disabled");
    input.removeAttribute("readonly");
    input.tabIndex = 0;
    input.style.pointerEvents = "auto";
    input.style.userSelect = "text";
    button.disabled = false;
    button.removeAttribute("disabled");
    button.style.pointerEvents = "auto";
    input.placeholder = walletAddress ? "Message Ore chat..." : "Connect wallet to chat...";
    input.dataset.orepChatReady = "true";
    button.dataset.orepChatReady = "true";
    wireChatInput(input, button);
  }

  function isChatEnabledPage() {
    return /(?:^|\/)(?:chat|index)\.html$/i.test(window.location.pathname) || window.location.pathname === "/";
  }

  function isMainChatPage() {
    return /(?:^|\/)index\.html$/i.test(window.location.pathname) || window.location.pathname === "/";
  }

  function ensureMainChatSurface() {
    if (!isMainChatPage()) return null;
    const existing = document.querySelector("[data-chat-scroll-container]");
    if (existing) return existing;

    let panel = document.querySelector(".orep-main-chat-panel");
    if (!panel) {
      panel = document.createElement("aside");
      panel.className = "orep-main-chat-panel";
      panel.innerHTML = `
        <div class="orep-main-chat-head">
          <span>Chat</span>
          <span class="orep-main-chat-live">LIVE</span>
        </div>
        <div class="orep-main-chat-messages" data-chat-scroll-container></div>`;
      document.body.appendChild(panel);
    }
    return panel.querySelector("[data-chat-scroll-container]");
  }

  function removeChatComposer() {
    document.querySelectorAll(".orep-chat-composer").forEach((composer) => composer.remove());
  }

  function ensureChatComposer() {
    let composer = document.querySelector(".orep-chat-composer");
    if (!composer) {
      composer = document.createElement("form");
      composer.className = "orep-chat-composer";
      composer.innerHTML = `
        <input class="orep-chat-composer-input" type="text" autocomplete="off" spellcheck="true">
        <button class="orep-chat-composer-send" type="submit" aria-label="Send message" title="Send message">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.478 2.405a.75.75 0 0 0-.926.94l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-10.32.75.75 0 0 0 0-1.154A60.52 60.52 0 0 0 3.478 2.405Z"></path></svg>
        </button>`;
      document.body.appendChild(composer);
      composer.addEventListener("submit", (event) => {
        event.preventDefault();
        sendChatFromInput(composer.querySelector(".orep-chat-composer-input"), composer.querySelector(".orep-chat-composer-send"));
      });
    }
    const input = composer.querySelector(".orep-chat-composer-input");
    const button = composer.querySelector(".orep-chat-composer-send");
    input.placeholder = walletAddress ? "Message Ore chat..." : "Connect wallet to chat...";
    input.disabled = false;
    input.readOnly = false;
    button.disabled = false;
    return { input, button };
  }

  function wireChatInput(input, button) {
    if (!input.dataset.orepChatEvents) {
      input.dataset.orepChatEvents = "true";
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        sendChatFromInput(input, button);
      });
    }
    if (!button.dataset.orepChatEvents) {
      button.dataset.orepChatEvents = "true";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        sendChatFromInput(input, button);
      });
    }
  }

  function detachCapturedChatControls(input, button) {
    if (input.dataset.orepChatDetached === "true" && button.dataset.orepChatDetached === "true") {
      return { input, button };
    }

    const newInput = input.cloneNode(false);
    newInput.value = input.value || "";
    newInput.dataset.orepChatDetached = "true";
    newInput.dataset.orepChatEvents = "";
    newInput.dataset.orepChatReady = "";
    input.replaceWith(newInput);

    const newButton = button.cloneNode(true);
    newButton.dataset.orepChatDetached = "true";
    newButton.dataset.orepChatEvents = "";
    newButton.dataset.orepChatReady = "";
    button.replaceWith(newButton);

    return { input: newInput, button: newButton };
  }

  function findChatInput() {
    const inputs = [...document.querySelectorAll("input, textarea")];
    return inputs.find((node) => /chat|message/i.test(node.placeholder || "")) ||
      inputs.find((node) => node.type === "text" && node.closest(".absolute.bottom-0, .fixed.bottom-0"));
  }

  function findChatButton(input) {
    const panel = input && input.closest(".flex.absolute.bottom-0, .fixed, .absolute");
    const scoped = panel && [...panel.querySelectorAll("button")].find((node) => node.querySelector("svg"));
    return scoped || [...document.querySelectorAll("button")].reverse().find((node) => node.querySelector("svg"));
  }

  async function sendChatFromInput(input, button) {
    const text = String(input.value || "").trim();
    if (!text) return;
    try {
      button.disabled = true;
      if (!walletAddress) await connectWallet();
      if (!walletAddress) throw new Error("Connect wallet before chatting.");
      input.value = "";
      appendLocalChatMessage({
        id: `local-${Date.now()}`,
        text,
        username: shortenAddress(walletAddress),
        authority: walletAddress,
        created_at: Math.floor(Date.now() / 1000)
      });
      await postOreChatMessage(text);
      setTimeout(refreshLiveSync, 600);
    } catch (error) {
      input.value = text;
      showTransientNotice(error.message || String(error));
    } finally {
      button.disabled = false;
      installChatControls();
    }
  }

  async function postOreChatMessage(text) {
    let chatToken = await getOreWalletAuthToken();
    const id = makeChatMessageId();
    const ts = makeChatMessageTimestamp();
    const response = await fetch("/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        ts,
        text,
        username: shortenAddress(walletAddress),
        wallet: walletAddress,
        authority: walletAddress,
        token: chatToken
      })
    });
    const result = await response.json();
    if (!response.ok && walletAddress && /401|403|auth|token|unauthor/i.test(result.error || "")) {
      localStorage.removeItem(`ore_auth_token_${walletAddress}`);
      chatToken = await getOreWalletAuthToken();
      const retry = await fetch("/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          ts,
          text,
          username: shortenAddress(walletAddress),
          wallet: walletAddress,
          authority: walletAddress,
          token: chatToken
        })
      });
      const retryResult = await retry.json();
      if (!retry.ok) throw new Error(retryResult.error || "Could not send chat message");
      return retryResult;
    }
    if (!response.ok) throw new Error(result.error || "Could not send chat message");
    return result;
  }

  function makeChatMessageId() {
    return Date.now();
  }

  function makeChatMessageTimestamp() {
    return Math.floor(Date.now() / 1000);
  }

  async function getOreWalletAuthToken() {
    const cached = getStoredOreAuthToken();
    if (cached) return cached;
    if (!walletProvider || typeof walletProvider.signMessage !== "function") {
      throw new Error("Your wallet needs message signing enabled to chat.");
    }
    const message = `Please sign this message to authenticate with ORE.\nTimestamp: ${Date.now()}`;
    const encoded = new TextEncoder().encode(message);
    const signed = await walletProvider.signMessage(encoded, "utf8");
    const signatureBytes = signed && (signed.signature || signed);
    const signature = bytesToBase64(signatureBytes);
    const signatureBs58 = bytesToBase58(signatureBytes);
    const messageB64 = bytesToBase64(encoded);
    const response = await fetch("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        msg: message,
        b64: messageB64,
        message_b64: messageB64,
        signature,
        signature_bs58: signatureBs58,
        signatureBase58: signatureBs58,
        client_pubkey: walletAddress,
        pubkey: walletAddress,
        authority: walletAddress,
        wallet: walletAddress
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not authenticate chat.");
    const token = result.token || result.jwt || result.access_token || result.response?.token || result.response?.jwt || result.response?.access_token;
    if (!token) throw new Error("Ore auth did not return a chat token.");
    localStorage.setItem(`ore_auth_token_${walletAddress}`, token);
    return token;
  }

  function getStoredOreAuthToken() {
    const preferred = walletAddress && localStorage.getItem(`ore_auth_token_${walletAddress}`);
    if (preferred) return preferred;
    const keys = Object.keys(localStorage || {});
    const tokenKey = keys.find((key) => /^ore_auth_token_/i.test(key)) ||
      keys.find((key) => /jwt|auth.*token|access.*token/i.test(key));
    if (!tokenKey) return "";
    try {
      const value = localStorage.getItem(tokenKey) || "";
      const parsed = JSON.parse(value);
      return parsed.token || parsed.access_token || parsed.jwt || parsed.value || value;
    } catch (_) {
      return localStorage.getItem(tokenKey) || "";
    }
  }

  function bytesToBase64(bytes) {
    const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let binary = "";
    array.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function bytesToBase58(bytes) {
    const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    if (!source.length) return "";
    const digits = [0];
    for (const byte of source) {
      let carry = byte;
      for (let i = 0; i < digits.length; i += 1) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let output = "";
    for (const byte of source) {
      if (byte !== 0) break;
      output += alphabet[0];
    }
    for (let i = digits.length - 1; i >= 0; i -= 1) output += alphabet[digits[i]];
    return output;
  }

  function appendLocalChatMessage(message) {
    const chatContainer = document.querySelector("[data-chat-scroll-container]");
    if (!chatContainer) return;
    const current = chatContainer.dataset.orepLiveChat === "true"
      ? [...chatContainer.querySelectorAll("[data-orep-chat-message]")]
      : [];
    const localMessages = current.map((node) => ({
      username: node.dataset.username,
      authority: node.dataset.authority,
      text: node.dataset.text,
      created_at: Number(node.dataset.createdAt)
    }));
    renderLiveChat([...localMessages, message]);
  }

  function boot() {
    applyState();
    createPanels();
    restoreNotes();
    installDuplicateCleanup();
    installBlockEditing();
    installLiveSync();
    installChatControls();
    installWalletConnectIntercept();

    const toolbarTimer = setInterval(() => {
      if (installToolbar()) clearInterval(toolbarTimer);
    }, 250);
    setTimeout(() => clearInterval(toolbarTimer), 10000);

    const blockTimer = setInterval(() => {
      installBlockEditing();
      installChatControls();
      refreshWalletBlocks();
      updateExistingDeploySummary();
      installClaimControls();
    }, 500);
    setTimeout(() => clearInterval(blockTimer), 12000);
    if (walletAddress) {
      setTimeout(() => {
        refreshWalletBalance();
        refreshWalletRewards();
      }, 800);
    }
  }

  function installWalletConnectIntercept() {
    if (document.body.dataset.orepWalletIntercept) return;
    document.body.dataset.orepWalletIntercept = "true";
    document.addEventListener("click", (event) => {
      const block = event.target.closest && event.target.closest("[data-square-id]");
      if (block && !block.classList.contains("orep-duplicate-block")) setTimeout(refreshWalletBlocks, 80);

      const button = event.target.closest && event.target.closest("button");
      if (!button) return;
      if (button.dataset.walletAction) {
        event.preventDefault();
        event.stopPropagation();
        handleWalletAction(event);
        return;
      }
      const text = (button.textContent || "").trim();
      if (/^Connect$/i.test(text) || button.dataset.orepWalletButton === "true") {
        event.preventDefault();
        event.stopPropagation();
        connectWallet().catch((error) => {
          setWalletMessage(error.message || String(error), true);
          showTransientNotice(error.message || String(error));
        });
        return;
      }
      if (/^All$/i.test(text) && !button.closest(".orep-panel")) {
        event.preventDefault();
        event.stopPropagation();
        const allSelected = selectedDeployBlocks.size >= 25;
        setAllBlocksSelected(!allSelected);
        return;
      }
      if (/^Deploy$/i.test(text) && !button.closest(".orep-panel")) {
        event.preventDefault();
        event.stopPropagation();
        deployFromExistingControls();
        return;
      }
      if (/^\+(1|0\.1|0\.01|0\.001)$/i.test(text) && !button.closest(".orep-panel")) {
        event.preventDefault();
        event.stopPropagation();
        const delta = Number(text.replace("+", ""));
        const current = (() => {
          const input = findDeployAmountInput();
          return Number(input && input.value) || 0;
        })();
        setDeployAmount(current + delta);
        return;
      }
    }, true);
    document.addEventListener("input", (event) => {
      if (event.target && event.target.matches && event.target.matches("input[type='number']")) {
        updateExistingDeploySummary();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
