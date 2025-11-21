/* =========================================================
   Sexure Notes — script.js (Save Hardening + Adaptive Image Budget)
   - Adaptive recompress before encrypt to avoid IDB/WebCrypto failures
   - Better error toasts (Quota / Decode / Unknown)
   - Save-time progress ("Optimizing images…")
   - FIX: Safe chunked Base64 encoder (prevents call stack overflow)
   - Editor modal "Delete" button (only visible while editing)
   - Trapdoor keyword ("hiddendoor") to open vault from public note
   - Viewer/Vault: bulletproof touch scrolling (iOS-safe)
   ========================================================= */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* -----------------------
   Passcode management
----------------------- */
function getStoredPasscode() {
  const ls = localStorage.getItem("appPasscode");
  return (ls && /^\d{10}$/.test(ls)) ? ls : document.body.dataset.passcode || "";
}
function setStoredPasscode(pass) {
  if (!/^\d{10}$/.test(pass)) throw new Error("passcode must be 10 digits");
  localStorage.setItem("appPasscode", pass);
}
let APP_PASSCODE = getStoredPasscode();

/* -----------------------
   Trapdoor (hidden lever)
----------------------- */
const TRAPWORD = "hiddendoor";
function triggerTrapdoor() {
  try { localStorage.removeItem("publicNote"); } catch {}
  if (publicNoteEl) publicNoteEl.value = "";
  vibrate(30);
  toast("Access door…");
  withPasscode("Access Door — Enter passcode", () => {
    currentPasscode = APP_PASSCODE;
    enterVaultMode();
    toast("Access granted");
  });
}

/* ---------- Mobile zoom/scroll hardening (iOS-safe) ---------- */
(function fixMobileZoomAndScroll() {
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && !/maximum-scale|user-scalable/.test(vp.content)) {
    vp.setAttribute('content', vp.content + ',maximum-scale=1,user-scalable=no');
  }
  ['gesturestart','gesturechange','gestureend'].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), { passive: false });
  });

  // default to vertical only
  document.documentElement.style.touchAction = 'pan-y';
  document.body.style.touchAction = 'pan-y';

  // Helper: positively identify any area that should allow native scrolling
  const isAllowedScroller = (el) => {
    return !!el.closest('.modal-body') ||
           !!el.closest('.modal-scroll') ||
           !!el.closest('.modal-panel') ||      // let the panel and its body scroll
           !!el.closest('#secureViewerModal') ||// viewer can scroll
           !!el.closest('#vaultSection')   ||   // ENTIRE vault section scrollable
           !!el.closest('.vault-scroll')   ||
           !!el.closest('#secureList')     ||   // list wrapper or list itself
           !!el.closest('.secure-item')    ||   // rows inside the list
           !!el.closest('#imageLightbox')  ||
           !!el.closest('#viewImageGrid')  ||
           !!el.closest('#imagePreviewGrid') ||
           !!el.closest('#publicNote')     ||
           !!el.closest('.viewer-note');
  };

  // Global touchmove guard: only block when NOT over a scrollable area or input
  document.addEventListener('touchmove', (e) => {
    const tag = e.target && e.target.tagName;
    if (
      tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
      tag === 'BUTTON' || tag === 'A' || isAllowedScroller(e.target)
    ) {
      return; // allow native scroll in these regions
    }
    e.preventDefault();
  }, { passive: false });

  const killDoubleTapZoom = (el) => {
    if (!el) return;
    let last = 0;
    el.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - last < 300) e.preventDefault();
      last = now;
    }, { passive: false });
    el.style.touchAction = 'manipulation';
    el.style.webkitTapHighlightColor = 'transparent';
  };
  const applyAll = () => {
    killDoubleTapZoom(document.getElementById('trashBtn'));
    $$('.btn').forEach(killDoubleTapZoom);
    $$('.secure-item-btn').forEach(killDoubleTapZoom);
    killDoubleTapZoom(document.getElementById('keypad'));
  };
  applyAll();
  const mo = new MutationObserver(applyAll);
  mo.observe(document.body, { childList: true, subtree: true });
})();

/* -----------------------
   DOM refs
----------------------- */
const publicNoteEl = $("#publicNote");
const savePublicBtn = $("#savePublicBtn");
const clearPublicBtn = $("#clearPublicBtn");
const trashBtn = $("#trashBtn");

const publicNoteSection = $("#publicNoteSection");
const vaultSection = $("#vaultSection");

const confirmDeleteModal = $("#confirmDeleteModal");
const confirmDeleteYes = $("#confirmDeleteYes");
const confirmDeleteNo = $("#confirmDeleteNo");

const passwordModal = $("#passwordModal");
const passwordTitle = $("#passwordTitle");
const cancelPasswordBtn = $("#cancelPasswordBtn");
const pinDots = $$("#pinDisplay .pin-dot");
const keypad = $("#keypad");

const secureEditorModal = $("#secureEditorModal");
const secureEditorTitle = $("#secureEditorTitle");
const secureTitle = $("#secureTitle");
const secureSubtitle = $("#secureSubtitle");
const secureLink = $("#secureLink");
const secureNote = $("#secureNote");
const secureImagesInput = $("#secureImages");
const imagePreviewGrid = $("#imagePreviewGrid");
const saveSecureBtn = $("#saveSecureBtn");
const cancelSecureBtn = $("#cancelSecureBtn");
const editorDeleteBtn = $("#editorDeleteBtn");

const secureViewerModal = $("#secureViewerModal");
const secureViewerTitle = $("#secureViewerTitle");
const viewTitle = $("#viewTitle");
const viewSubtitle = $("#viewSubtitle");
const viewLink = $("#viewLink");
const viewNote = $("#viewNote");
const viewImageGrid = $("#viewImageGrid");
const viewerEditBtn = $("#viewerEditBtn");
const viewerDeleteBtn = $("#viewerDeleteBtn");
const viewerCloseBtn = $("#viewerCloseBtn");

const imageLightbox = $("#imageLightbox");
const lightboxImg = $("#lightboxImg");
const imageLightboxClose = $("#imageLightboxClose");
let imageLightboxTrashBtn = null;

const burnAllBtn = $("#burnAllBtn");
const burnAllModal = $("#burnAllModal");
const burnAllYes = $("#burnAllYes");
const burnAllNo = $("#burnAllNo");

const settingsBtn = $("#settingsBtn");
const settingsModal = $("#settingsModal");
const settingsCloseBtn = $("#settingsCloseBtn");
const currentPassInput = $("#currentPassInput");
const newPassInput = $("#newPassInput");
const confirmPassInput = $("#confirmPassInput");
const changePassBtn = $("#changePassBtn");

const storagePctLabel = $("#storagePctLabel");
const storageBarFill = $("#storageBarFill");
const storageDetail = $("#storageDetail");
const storagePctLabelSettings = $("#storagePctLabelSettings");
const storageBarFillSettings = $("#storageBarFillSettings");
const storageDetailSettings = $("#storageDetailSettings");

const secureList = $("#secureList");
const addSecureBtn = $("#addSecureBtn");
const lockBtn = $("#lockBtn");

const toastEl = $("#toast");

/* -----------------------
   State
----------------------- */
let tapCount = 0;
let tapTimer = null;
let db;

let currentPasscode = null; // session unlocked
let pinBuffer = "";
let passResolve = null;
let currentViewedRecord = null;
let currentViewedData = null;
let currentLightboxIndex = -1;
let editingNoteId = null;

let _bodyScrollY = 0;
let _viewerCleanupFns = [];
let _vaultCleanupFns = [];
let _vaultScrollEl = null;

// Editor images
let editorImages = [];

// Async image queue & progress UI state
let imageQueue = Promise.resolve();
let imagesBusy = false;

// Progress UI elements (created on demand)
let imgProgWrap = null;
let imgProgBar = null;
let imgProgLabel = null;

/* -----------------------
   UI helpers
----------------------- */
function show(el) { if (!el) return; el.classList.remove("hidden"); }
function hide(el) { if (!el) return; el.classList.add("hidden"); }
function toast(msg, ms = 1600) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), ms);
}
function vibrate(ms = 50) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

/* -----------------------
   Public note persistence + Trapdoor
----------------------- */
(function initPublicNote() {
  const saved = localStorage.getItem("publicNote") || "";
  if (publicNoteEl) publicNoteEl.value = saved;
})();
publicNoteEl?.addEventListener("input", () => {
  const val = publicNoteEl.value || "";
  if (val.trim().toLowerCase() === TRAPWORD) {
    try { localStorage.removeItem("publicNote"); } catch {}
    return;
  }
  localStorage.setItem("publicNote", val);
});
savePublicBtn?.addEventListener("click", () => {
  const val = (publicNoteEl.value || "").trim().toLowerCase();
  if (val === TRAPWORD) {
    triggerTrapdoor();
    return;
  }
  localStorage.setItem("publicNote", publicNoteEl.value);
  toast("Note saved");
});
clearPublicBtn?.addEventListener("click", () => {
  publicNoteEl.value = "";
  localStorage.removeItem("publicNote");
  toast("Cleared");
});

/* -----------------------
   Trash tap logic
----------------------- */
const TAP_WINDOW_MS = 1200;
trashBtn?.addEventListener("click", () => {
  if (!tapTimer) {
    tapCount = 0;
    tapTimer = setTimeout(() => {
      if (tapCount === 1) show(confirmDeleteModal);
      tapCount = 0;
      tapTimer = null;
    }, TAP_WINDOW_MS);
  }
  tapCount++;
  if (tapCount >= 6) {
    clearTimeout(tapTimer);
    tapTimer = null;
    tapCount = 0;
    withPasscode("Enter 10-digit passcode", () => {
      currentPasscode = APP_PASSCODE;
      enterVaultMode();
      toast("Vault unlocked");
    });
  }
});

/* -----------------------
   Confirm delete (public)
----------------------- */
confirmDeleteYes?.addEventListener("click", () => {
  publicNoteEl.value = "";
  localStorage.removeItem("publicNote");
  hide(confirmDeleteModal);
  toast("Deleted");
});
confirmDeleteNo?.addEventListener("click", () => hide(confirmDeleteModal));

/* -----------------------
   Passcode keypad modal
----------------------- */
function renderPinDots() { pinDots.forEach((dot, i) => dot.classList.toggle("filled", i < pinBuffer.length)); }
function resetPin() { pinBuffer = ""; renderPinDots(); }

function promptPasscodeInternal(titleText = "Enter 10-digit passcode") {
  passwordTitle.textContent = titleText;
  resetPin();
  show(passwordModal);
  return new Promise((resolve) => { passResolve = resolve; });
}
function resolvePass(ok) {
  hide(passwordModal);
  resetPin();
  const r = passResolve;
  passResolve = null;
  if (r) r(ok);
}
cancelPasswordBtn?.addEventListener("click", () => resolvePass(false));

keypad?.addEventListener("click", (e) => {
  const key = e.target.closest(".key");
  if (!key) return;
  if (key.classList.contains("key-empty")) return;

  if (key.classList.contains("key-back")) {
    pinBuffer = pinBuffer.slice(0, -1);
    renderPinDots();
    vibrate(20);
    return;
  }

  const val = key.textContent.trim();
  if (/^\d$/.test(val) && pinBuffer.length < 10) {
    pinBuffer += val;
    renderPinDots();
    vibrate(15);
  }

  if (pinBuffer.length === 10) {
    setTimeout(() => {
      const ok = (pinBuffer === APP_PASSCODE);
      if (!ok) { vibrate(120); toast("Incorrect passcode"); resetPin(); return; }
      resolvePass(true);
    }, 110);
  }
});

async function withPasscode(title, onSuccess) {
  const ok = await promptPasscodeInternal(title);
  if (!ok) return;
  onSuccess?.();
}

/* ---------------------------------------------------------
   Body scroll lock helpers (used by modals)
--------------------------------------------------------- */
function lockBodyScroll() {
  _bodyScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.style.scrollBehavior = 'auto';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_bodyScrollY}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
}
function unlockBodyScroll() {
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.left = '';
  document.body.style.right = '';
  document.body.style.width = '';
  window.scrollTo(0, _bodyScrollY);
  document.documentElement.style.scrollBehavior = '';
}

/* ---------------------------------------------------------
   Scroll shims (iOS rubber-band fix for nested panels)
--------------------------------------------------------- */
function makeScrollable(el) {
  if (!el) return;
  el.style.overflowY = 'auto';
  el.style.WebkitOverflowScrolling = 'touch';
  el.style.overscrollBehavior = 'contain';
  el.style.touchAction = 'pan-y';

  // Ensure there's always something to scroll so the browser doesn't "steal" the gesture
  const nudge = () => {
    if (el.scrollTop <= 0) el.scrollTop = 1;
    const maxTop = el.scrollHeight - el.clientHeight - 1;
    if (el.scrollTop >= maxTop) el.scrollTop = maxTop;
  };
  el.addEventListener('touchstart', nudge, { passive: true });

  // Prevent wheel overscroll from bubbling (desktop trackpads)
  const wheelHandler = (e) => {
    const atTop = el.scrollTop <= 0 && e.deltaY < 0;
    const atBottom = Math.ceil(el.scrollTop + el.clientHeight) >= el.scrollHeight && e.deltaY > 0;
    if (atTop || atBottom) { e.preventDefault(); e.stopPropagation(); }
  };
  el.addEventListener('wheel', wheelHandler, { passive: false });

  return () => {
    el.removeEventListener('touchstart', nudge);
    el.removeEventListener('wheel', wheelHandler);
  };
}

/* ---------------------------------------------------------
   BlackVault scroll region (scrollable list of notes)
--------------------------------------------------------- */
function ensureVaultScrollWrapper() {
  if (!_vaultScrollEl && secureList && vaultSection) {
    let wrapper = vaultSection.querySelector('.vault-scroll');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.className = 'vault-scroll';
      const parent = secureList.parentElement || vaultSection;
      parent.insertBefore(wrapper, secureList);
      wrapper.appendChild(secureList);
    }
    _vaultScrollEl = wrapper;
    const cleanup = makeScrollable(_vaultScrollEl);
    if (cleanup) _vaultCleanupFns.push(cleanup);
  }
}

function sizeVaultScrollRegion() {
  if (!vaultSection) return;
  ensureVaultScrollWrapper();
  if (!_vaultScrollEl) return;

  const vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 720;

  // Height of chrome around the scroll area
  const siblings = Array.from(vaultSection.children).filter(ch => ch !== _vaultScrollEl);
  const chromeH = siblings.reduce((sum, el) => sum + el.getBoundingClientRect().height, 0);

  const cs = getComputedStyle(vaultSection);
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  const borderT = parseFloat(cs.borderTopWidth) || 0;
  const borderB = parseFloat(cs.borderBottomWidth) || 0;

  const SAFE = 16;
  const maxH = Math.max(160, Math.floor(vh - chromeH - padT - padB - borderT - borderB - SAFE*2));
  _vaultScrollEl.style.maxHeight = `${maxH}px`;

  // Also ensure each item doesn't trap scrolling
  $$('.secure-item', _vaultScrollEl).forEach(el => {
    el.style.touchAction = 'pan-y';
  });
}

function attachVaultResizeObservers() {
  const onResize = () => requestAnimationFrame(sizeVaultScrollRegion);
  window.addEventListener('resize', onResize);
  _vaultCleanupFns.push(() => window.removeEventListener('resize', onResize));
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
    _vaultCleanupFns.push(() => window.visualViewport.removeEventListener('resize', onResize));
  }
}

/* -----------------------
   Vault mode
----------------------- */
function enterVaultMode() {
  hide(publicNoteSection);
  show(vaultSection);
  vaultSection?.classList.add("show");
  renderSecureList();
  updateStorageUI();

  ensureVaultScrollWrapper();
  sizeVaultScrollRegion();
  attachVaultResizeObservers();
}
function lockVault() {
  currentPasscode = null;
  vaultSection?.classList.remove("show");
  hide(vaultSection);
  show(publicNoteSection);
  toast("Locked");
  _vaultCleanupFns.forEach(fn => { try { fn(); } catch {} });
  _vaultCleanupFns = [];
}
lockBtn?.addEventListener("click", lockVault);

/* -----------------------
   IndexedDB
----------------------- */
function openDB(name = "sexure-db", version = 4) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("secureNotes")) {
        db.createObjectStore("secureNotes", { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function txStore(store, mode = "readonly") {
  const t = db.transaction(store, mode);
  return { t, s: t.objectStore(store) };
}
async function listAllNotes() {
  return new Promise((resolve, reject) => {
    const { s } = txStore("secureNotes");
    const out = [];
    const req = s.openCursor();
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { out.push(cursor.value); cursor.continue(); }
      else resolve(out.sort((a,b) => b.createdAt - a.createdAt));
    };
    req.onerror = () => reject(req.error);
  });
}
async function addNote(record) {
  return new Promise((resolve, reject) => {
    const { s } = txStore("secureNotes", "readwrite");
    const req = s.add(record);
    req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  });
}
async function updateNote(record) {
  return new Promise((resolve, reject) => {
    const { s } = txStore("secureNotes", "readwrite");
    const req = s.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function deleteNote(id) {
  return new Promise((resolve, reject) => {
    const { s } = txStore("secureNotes", "readwrite");
    const req = s.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
async function clearAllNotes() {
  return new Promise((resolve, reject) => {
    const { s } = txStore("secureNotes", "readwrite");
    const req = s.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/* -----------------------
   Crypto (AES-GCM)
----------------------- */
const enc = new TextEncoder();
const dec = new TextDecoder();

function b64FromBytes(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkStr = "";
    for (let j = 0; j < chunk.length; j++) chunkStr += String.fromCharCode(chunk[j]);
    binary += chunkStr;
  }
  return btoa(binary);
}
function bytesFromB64(b64) {
  const binary = atob(b64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function deriveKeyFromPass(pass, saltBytes, iterations = 200_000) {
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(pass), { name:"PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name:"PBKDF2", salt: saltBytes, iterations, hash:"SHA-256" },
    keyMaterial,
    { name:"AES-GCM", length:256 },
    false,
    ["encrypt","decrypt"]
  );
}
async function encryptJsonWithPass(pass, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key  = await deriveKeyFromPass(pass, salt);
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(obj));
  const ct   = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, key, data);
  return { saltB64: b64FromBytes(salt), ivB64: b64FromBytes(iv), ctB64: b64FromBytes(new Uint8Array(ct)) };
}
async function decryptJsonWithPass(pass, { saltB64, ivB64, ctB64 }) {
  const salt = bytesFromB64(saltB64);
  const iv   = bytesFromB64(ivB64);
  const ct   = bytesFromB64(ctB64);
  const key  = await deriveKeyFromPass(pass, salt);
  const pt   = await crypto.subtle.decrypt({ name:"AES-GCM", iv }, key, ct);
  return JSON.parse(dec.decode(pt));
}

/* -----------------------
   Storage usage
----------------------- */
async function computeUsage() {
  const items = await listAllNotes();
  let encBytes = 0, noteCount = items.length, imgCount = 0;

  for (const it of items) {
    encBytes += Math.floor((it.ctB64?.length || 0) * 0.75) + 28;
    if (currentPasscode) {
      try {
        const data = await decryptJsonWithPass(APP_PASSCODE, it);
        imgCount += Array.isArray(data.images) ? data.images.length : 0;
      } catch {}
    }
  }
  const publicBytes = (localStorage.getItem("publicNote") || "").length;
  const CAP_BYTES = 20 * 1024 * 1024;
  const used = encBytes + publicBytes;
  const pct = Math.min(100, Math.round((used / CAP_BYTES) * 100));
  return { pct, usedBytes: used, capBytes: CAP_BYTES, noteCount, imgCount };
}
function fmtBytes(n) {
  const u = ["B","KB","MB","GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length-1) { v/=1024; i++; }
  return `${v.toFixed(v<10&&i>0?1:0)} ${u[i]}`;
}
async function updateStorageUI() {
  const u = await computeUsage();
  storagePctLabel && (storagePctLabel.textContent = `${u.pct}%`);
  storageBarFill && (storageBarFill.style.width = `${u.pct}%`);
  storageDetail && (storageDetail.textContent = `${u.noteCount} notes · ${u.imgCount} images · ${fmtBytes(u.usedBytes)}/${fmtBytes(u.capBytes)}`);
  storagePctLabelSettings && (storagePctLabelSettings.textContent = `${u.pct}%`);
  storageBarFillSettings && (storageBarFillSettings.style.width = `${u.pct}%`);
  storageDetailSettings && (storageDetailSettings.textContent = `${u.noteCount} notes · ${u.imgCount} images · ${fmtBytes(u.usedBytes)}/${fmtBytes(u.capBytes)}`);
}

/* -----------------------
   Image processing + Progress UI
----------------------- */
async function downscaleDataURL(dataURL, maxDim = 1600, mime = "image/jpeg", quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL(mime, quality));
    };
    img.onerror = () => resolve(dataURL);
    img.src = dataURL;
  });
}

function ensureProgressUI() {
  if (imgProgWrap) return;

  const body = secureEditorModal?.querySelector(".modal-body");
  const attachTarget = body || imagePreviewGrid?.parentElement || secureEditorModal?.querySelector(".modal-panel");

  imgProgWrap = document.createElement("div");
  imgProgWrap.id = "imgProgressWrap";
  Object.assign(imgProgWrap.style, {
    marginTop: "10px",
    padding: "10px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)"
  });

  imgProgLabel = document.createElement("div");
  imgProgLabel.id = "imgProgressLabel";
  imgProgLabel.textContent = "Processing images… 0%";
  Object.assign(imgProgLabel.style, {
    fontSize: "12px",
    opacity: "0.9",
    marginBottom: "6px"
  });

  const barWrap = document.createElement("div");
  Object.assign(barWrap.style, {
    width: "100%",
    height: "8px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden"
  });

  imgProgBar = document.createElement("div");
  imgProgBar.id = "imgProgressBar";
  Object.assign(imgProgBar.style, {
    width: "0%",
    height: "100%",
    borderRadius: "999px",
    background: "linear-gradient(90deg, #64ffda, #29bca3)",
    transition: "width 120ms linear"
  });

  barWrap.appendChild(imgProgBar);
  imgProgWrap.appendChild(imgProgLabel);
  imgProgWrap.appendChild(barWrap);

  attachTarget && attachTarget.appendChild(imgProgWrap);
}

function setProgress(pct, label = null) {
  ensureProgressUI();
  imgProgBar.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  if (label) imgProgLabel.textContent = label;
}
function hideProgressUI() {
  if (imgProgWrap) imgProgWrap.remove();
  imgProgWrap = imgProgBar = imgProgLabel = null;
}

function readFileAsDataURL(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataB64: fr.result });
    fr.onerror = reject;
    fr.onprogress = (evt) => {
      if (evt.lengthComputable && typeof onProgress === "function") {
        onProgress(evt.loaded / evt.total);
      }
    };
    fr.readAsDataURL(file);
  });
}

/* Queue + granular progress */
async function enqueueImages(filesArray) {
  const files = Array.isArray(filesArray) ? filesArray : [];
  if (!files.length) return;

  imagesBusy = true;
  saveSecureBtn.disabled = true;

  ensureProgressUI();
  setProgress(0, "Processing images… 0%");

  const total = files.length;
  const slice = 100 / total;

  const processed = [];
  for (let i = 0; i < total; i++) {
    const f = files[i];

    let readPct = 0;
    const fileObj = await readFileAsDataURL(f, (p) => {
      readPct = p || 0;
      const base = i * slice;
      const pct = base + (readPct * 0.5 * slice);
      setProgress(pct, `Reading ${i + 1}/${total}… ${Math.round(pct)}%`);
    });

    const baseAfterRead = i * slice + 0.5 * slice;
    setProgress(baseAfterRead, `Compressing ${i + 1}/${total}… ${Math.round(baseAfterRead)}%`);
    const recompressed = await downscaleDataURL(fileObj.dataB64, 1600, "image/jpeg", 0.85);

    processed.push({ ...fileObj, dataB64: recompressed, type: "image/jpeg" });

    const endPct = (i + 1) * slice;
    setProgress(endPct, `Processed ${i + 1}/${total}… ${Math.round(endPct)}%`);
  }

  editorImages.push(...processed);
  renderEditorImagePreviews();
  updateStorageUI();

  setProgress(100, "Done");
  setTimeout(hideProgressUI, 450);

  imagesBusy = false;
  saveSecureBtn.disabled = false;
}

/* IMPORTANT: snapshot FileList BEFORE queuing, then clear input */
secureImagesInput?.addEventListener("change", (e) => {
  const snapshot = Array.from(e.target.files || []);
  if (!snapshot.length) return;

  imageQueue = imageQueue.then(() => enqueueImages(snapshot)).catch(() => {});
  e.target.value = ""; // allow re-select same files on iOS
});

/* =========================================================
   Viewer (read-only) + Lightbox — SCROLL ROBUSTNESS
========================================================= */
function ensureLightboxTrashButton() {
  if (imageLightboxTrashBtn) return;
  imageLightboxTrashBtn = document.createElement("button");
  imageLightboxTrashBtn.textContent = "🗑";
  imageLightboxTrashBtn.setAttribute("aria-label", "Delete image");
  Object.assign(imageLightboxTrashBtn.style, {
    position: "absolute", top: "-14px", left: "-14px",
    width: "36px", height: "36px", borderRadius: "50%",
    background: "#000000cc", color: "#fff",
    border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer",
    zIndex: "2", display: "grid", placeItems: "center", fontSize: "16px"
  });
  const panel = imageLightbox?.querySelector(".lightbox-panel");
  panel && panel.appendChild(imageLightboxTrashBtn);

  imageLightboxTrashBtn.addEventListener("click", async () => {
    if (!currentViewedRecord || !currentViewedData) return;
    if (currentLightboxIndex < 0) return;
    const sure = confirm("Delete this image from the note?");
    if (!sure) return;
    try {
      const imgs = Array.isArray(currentViewedData.images) ? currentViewedData.images : [];
      if (currentLightboxIndex >= 0 && currentLightboxIndex < imgs.length) imgs.splice(currentLightboxIndex, 1);
      currentViewedData.images = imgs;
      const encObj = await encryptJsonWithPass(APP_PASSCODE, currentViewedData);
      await updateNote({ id: currentViewedRecord.id, createdAt: currentViewedRecord.createdAt, ...encObj });
      renderViewerImages(currentViewedData.images);
      updateStorageUI();
      currentLightboxIndex = -1;
      lightboxImg.src = "";
      hide(imageLightbox);
      toast("Image deleted");
      requestAnimationFrame(sizeViewerScrollRegion);
    } catch (e) { console.error(e); toast("Failed to delete image"); }
  });
}

function openLightboxFor(index) {
  currentLightboxIndex = index;
  const imgs = Array.isArray(currentViewedData?.images) ? currentViewedData.images : [];
  const target = imgs[index]; if (!target) return;
  lightboxImg.src = target.dataB64;
  ensureLightboxTrashButton();
  show(imageLightbox);
}
imageLightboxClose?.addEventListener("click", () => {
  currentLightboxIndex = -1; lightboxImg.src = ""; hide(imageLightbox);
});

function sizeViewerScrollRegion() {
  if (!secureViewerModal) return;

  const panel = secureViewerModal.querySelector(".modal-panel") || secureViewerModal;

  // Ensure a dedicated scrolling body exists
  let body = secureViewerModal.querySelector(".modal-body");
  if (!body) {
    body = document.createElement('div');
    body.className = 'modal-body modal-scroll';
    // Move non-header/footer content into body
    const header = panel.querySelector('.modal-header');
    const footer = panel.querySelector('.modal-footer');
    const children = Array.from(panel.children);
    children.forEach((ch) => {
      const isHeader = header && ch === header;
      const isFooter = footer && ch === footer;
      if (!isHeader && !isFooter) body.appendChild(ch);
    });
    if (header && header.nextSibling) panel.insertBefore(body, header.nextSibling);
    else panel.insertBefore(body, panel.firstChild);
  }

  const vv = (window.visualViewport && window.visualViewport.height) || window.innerHeight || document.documentElement.clientHeight || 720;
  const header = panel.querySelector(".modal-header");
  const footer = panel.querySelector(".modal-footer");
  const headerH = header ? header.getBoundingClientRect().height : 0;
  const footerH = footer ? footer.getBoundingClientRect().height : 0;
  const cs = getComputedStyle(panel);
  const padTop = parseFloat(cs.paddingTop) || 0;
  const padBottom = parseFloat(cs.paddingBottom) || 0;
  const borderTop = parseFloat(cs.borderTopWidth) || 0;
  const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
  const SAFE = 16;
  const maxBody = Math.max(
    140,
    Math.floor(vv - (headerH + footerH + padTop + padBottom + borderTop + borderBottom + SAFE*2))
  );

  Object.assign(body.style, {
    maxHeight: `${maxBody}px`,
    overflowY: "auto",
    WebkitOverflowScrolling: "touch",
    overscrollBehavior: "contain",
    touchAction: 'pan-y'
  });

  // Ensure image grid itself doesn't block scroll
  if (viewImageGrid) {
    Object.assign(viewImageGrid.style, {
      contain: "content",
      overscrollBehavior: "contain",
      touchAction: 'pan-y'
    });
  }

  // Apply iOS scroll shim
  const cleanup = makeScrollable(body);
  if (cleanup) _viewerCleanupFns.push(cleanup);

  const onResize = () => requestAnimationFrame(sizeViewerScrollRegion);
  window.addEventListener("resize", onResize);
  _viewerCleanupFns.push(() => window.removeEventListener("resize", onResize));

  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", onResize);
    _viewerCleanupFns.push(() => window.visualViewport.removeEventListener("resize", onResize));
  }

  // Recompute when images load
  const imgs = body.querySelectorAll("img");
  imgs.forEach(img => {
    if (img.complete) return;
    const cb = () => requestAnimationFrame(sizeViewerScrollRegion);
    img.addEventListener("load", cb, { once: true });
    img.addEventListener("error", cb, { once: true });
    _viewerCleanupFns.push(() => {
      img.removeEventListener("load", cb);
      img.removeEventListener("error", cb);
    });
  });
}

function renderViewerImages(images = []) {
  viewImageGrid.innerHTML = "";
  if (!images.length) {
    const empty = document.createElement("div");
    empty.className = "empty-hint";
    empty.textContent = "No images";
    viewImageGrid.appendChild(empty);
  } else {
    images.forEach((imgObj, idx) => {
      const cell = document.createElement("div"); cell.className = "image-thumb";
      const btn = document.createElement("button"); btn.className = "thumb-btn";
      btn.setAttribute("aria-label", `Open image ${idx+1}`);
      btn.style.backgroundImage = `url(${imgObj.dataB64})`;
      btn.style.backgroundSize = "cover";
      btn.style.backgroundPosition = "center";
      btn.addEventListener("click", () => openLightboxFor(idx));
      cell.appendChild(btn);
      viewImageGrid.appendChild(cell);
    });
  }

  // After (re)render, ensure the viewer body can scroll fully
  requestAnimationFrame(sizeViewerScrollRegion);
}

function openViewer(data, record) {
  currentViewedRecord = record;
  currentViewedData = data;
  secureViewerTitle.textContent = "Secure Note";
  viewTitle.textContent = data.title || "(untitled)";
  if (viewSubtitle) viewSubtitle.textContent = data.subtitle || "(none)";

  const link = (data.link || "").trim();
  if (link) { viewLink.textContent = link; viewLink.href = link.startsWith("http") ? link : `https://${link}`; }
  else { viewLink.textContent = "(none)"; viewLink.removeAttribute("href"); }
  viewNote.textContent = data.note || "";
  renderViewerImages(Array.isArray(data.images) ? data.images : []);

  lockBodyScroll();               // lock page behind modal
  requestAnimationFrame(sizeViewerScrollRegion);

  viewerEditBtn.onclick = () => {
    withPasscode("Re-enter passcode to edit", () => {
      closeViewerInternal();
      secureEditorTitle.textContent = "Edit Secure Note";
      secureTitle.value = data.title || "";
      if (secureSubtitle) secureSubtitle.value = data.subtitle || "";
      secureLink.value  = data.link  || "";
      secureNote.value  = data.note  || "";
      editorImages = Array.isArray(data.images) ? [...data.images] : [];
      renderEditorImagePreviews();
      editingNoteId = record.id;
      if (editorDeleteBtn) editorDeleteBtn.style.display = "inline-block";
      show(secureEditorModal);
    });
  };
  viewerDeleteBtn.onclick = async () => {
    const sure = confirm("Delete this note permanently?");
    if (!sure) return;
    await deleteNote(record.id);
    closeViewerInternal();
    toast("Deleted");
    renderSecureList(); updateStorageUI();
  };
  viewerCloseBtn.onclick = () => closeViewerInternal();

  show(secureViewerModal);
}

function closeViewerInternal() {
  _viewerCleanupFns.forEach(fn => { try { fn(); } catch {} });
  _viewerCleanupFns = [];
  hide(secureViewerModal);
  currentViewedRecord = null; currentViewedData = null;
  unlockBodyScroll();
}

/* -----------------------
   Burn All
----------------------- */
burnAllBtn?.addEventListener("click", () => show(burnAllModal));
burnAllYes?.addEventListener("click", async () => {
  hide(burnAllModal); hide(secureViewerModal);
  await clearAllNotes(); localStorage.removeItem("publicNote");
  currentViewedRecord = null; currentViewedData = null; currentLightboxIndex = -1;
  renderSecureList(); updateStorageUI(); toast("All notes burned");
});
burnAllNo?.addEventListener("click", () => hide(burnAllModal));

/* -----------------------
   Settings
----------------------- */
settingsBtn?.addEventListener("click", async () => {
  currentPassInput.value = ""; newPassInput.value = ""; confirmPassInput.value = "";
  await updateStorageUI(); show(settingsModal);
});
settingsCloseBtn?.addEventListener("click", () => hide(settingsModal));
changePassBtn?.addEventListener("click", async () => {
  const curr = (currentPassInput.value || "").trim();
  const next = (newPassInput.value || "").trim();
  const conf = (confirmPassInput.value || "").trim();
  if (!/^\d{10}$/.test(curr)) return toast("Enter current 10-digit passcode");
  if (curr !== APP_PASSCODE)  return toast("Current passcode wrong");
  if (!/^\d{10}$/.test(next)) return toast("New passcode must be 10 digits");
  if (next !== conf)          return toast("New passcodes do not match");
  try {
    const items = await listAllNotes();
    for (const it of items) {
      const data = await decryptJsonWithPass(APP_PASSCODE, it);
      const encObj = await encryptJsonWithPass(next, data);
      await updateNote({ id: it.id, createdAt: it.createdAt, ...encObj });
    }
    APP_PASSCODE = next; setStoredPasscode(next); currentPasscode = APP_PASSCODE;
    toast("Passcode changed"); hide(settingsModal);
  } catch (e) { console.error(e); toast("Failed to change passcode"); }
});

/* -----------------------
   Render vault list
----------------------- */
async function renderSecureList() {
  const items = await listAllNotes();
  secureList.innerHTML = "";
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty-hint";
    empty.textContent = "No secure notes yet. Tap + to add one.";
    secureList.appendChild(empty);
    requestAnimationFrame(sizeVaultScrollRegion);
    return;
  }
  for (const item of items) {
    let subtitleLabel = "Protected Note";
    if (currentPasscode) {
      try {
        const data = await decryptJsonWithPass(APP_PASSCODE, item);
        if (data?.subtitle?.trim()) subtitleLabel = data.subtitle.trim();
      } catch {}
    }
    const row = document.createElement("div"); row.className = "secure-item";
    const header = document.createElement("div"); header.className = "secure-item-header";
    const title = document.createElement("div"); title.className = "secure-item-title"; title.textContent = subtitleLabel;

    const right = document.createElement("div");
    right.style.display = "flex"; right.style.alignItems = "center"; right.style.gap = "8px";
    const time = document.createElement("small"); time.className = "secure-item-time";
    time.textContent = new Date(item.createdAt).toLocaleString();

    const viewBtn = document.createElement("button"); viewBtn.className = "secure-item-btn"; viewBtn.textContent = "View";
    const editBtn = document.createElement("button"); editBtn.className = "secure-item-btn"; editBtn.textContent = "Edit";
    right.append(time, viewBtn, editBtn);
    header.append(title, right);

    const blur = document.createElement("div"); blur.className = "secure-item-blur";
    blur.textContent = "••••••••  ••••••••  ••••••••  ••••••••  ••••••••";
    row.append(header, blur); secureList.appendChild(row);

    viewBtn.addEventListener("click", () => {
      withPasscode("Enter 10-digit passcode to view", async () => {
        try { const data = await decryptJsonWithPass(APP_PASSCODE, item); openViewer(data, item); }
        catch (err) { console.error("Decrypt/view failed:", err); toast("Decrypt failed"); }
      });
    });
    editBtn.addEventListener("click", () => {
      withPasscode("Re-enter passcode to edit", async () => {
        try {
          const data = await decryptJsonWithPass(APP_PASSCODE, item);
          secureEditorTitle.textContent = "Edit Secure Note";
          secureTitle.value = data.title || "";
          if (secureSubtitle) secureSubtitle.value = data.subtitle || "";
          secureLink.value  = data.link  || "";
          secureNote.value  = data.note  || "";
          editorImages = Array.isArray(data.images) ? [...data.images] : [];
          renderEditorImagePreviews();
          editingNoteId = item.id;
          if (editorDeleteBtn) editorDeleteBtn.style.display = "inline-block";
          show(secureEditorModal);
        } catch (err) { console.error("Decrypt/edit failed:", err); toast("Decrypt failed"); }
      });
    });

    // Long-press quick delete
    let pressTimer = null;
    row.addEventListener("touchstart", () => { pressTimer = setTimeout(async () => {
      await deleteNote(item.id); toast("Deleted"); renderSecureList(); updateStorageUI();
    }, 650); });
    row.addEventListener("touchend", () => clearTimeout(pressTimer));
    row.addEventListener("touchmove", () => clearTimeout(pressTimer));
  }

  // Ensure the list region is scrollable after DOM paint
  requestAnimationFrame(sizeVaultScrollRegion);
  updateStorageUI();
}

/* -----------------------
   Image helpers (Editor)
----------------------- */
function renderEditorImagePreviews() {
  imagePreviewGrid.innerHTML = "";
  if (!editorImages.length) return;
  editorImages.forEach((imgObj, idx) => {
    const cell = document.createElement("div");
    cell.className = "image-thumb";

    const remove = document.createElement("button");
    remove.className = "thumb-remove";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      editorImages.splice(idx, 1);
      renderEditorImagePreviews();
      updateStorageUI();
    });

    const img = document.createElement("img");
    img.src = imgObj.dataB64;
    img.alt = imgObj.name || `image-${idx+1}`;

    cell.append(remove, img);
    imagePreviewGrid.appendChild(cell);
  });
}

/* -----------------------
   Adaptive image budgeter for save
----------------------- */
function approxBase64Bytes(b64) {
  return Math.floor((b64?.length || 0) * 0.75);
}
function totalImagesBytes(arr) {
  let n = 0; for (const x of (arr||[])) n += approxBase64Bytes(x.dataB64);
  return n;
}
async function compressImagesToBudget(images, targetBytes = 6 * 1024 * 1024) {
  const out = images.map(x => ({...x}));
  let total = totalImagesBytes(out);
  if (total <= targetBytes) return out;

  const steps = [
    [1500, 0.82],
    [1300, 0.78],
    [1100, 0.74],
    [1000, 0.70],
    [900,  0.66],
    [800,  0.62],
  ];

  for (let s = 0; s < steps.length && total > targetBytes; s++) {
    const [dim, q] = steps[s];
    setProgress(Math.min(99, Math.round((s / steps.length) * 90)), `Optimizing images… (${s+1}/${steps.length})`);
    for (let i = 0; i < out.length && total > targetBytes; i++) {
      const before = approxBase64Bytes(out[i].dataB64);
      out[i].dataB64 = await downscaleDataURL(out[i].dataB64, dim, "image/jpeg", q);
      out[i].type = "image/jpeg";
      const after = approxBase64Bytes(out[i].dataB64);
      total += (after - before);
    }
    total = totalImagesBytes(out);
  }
  return out;
}

/* -----------------------
   Add / Edit / Delete in Editor
----------------------- */
let isSaving = false;
addSecureBtn?.addEventListener("click", () => {
  secureEditorTitle.textContent = "New Secure Note";
  secureTitle.value = ""; if (secureSubtitle) secureSubtitle.value = "";
  secureLink.value  = ""; secureNote.value  = "";
  editorImages = []; renderEditorImagePreviews();
  hideProgressUI();
  editingNoteId = null;
  if (editorDeleteBtn) editorDeleteBtn.style.display = "none";
  show(secureEditorModal);
});

cancelSecureBtn?.addEventListener("click", () => {
  hide(secureEditorModal);
  secureTitle.value = ""; if (secureSubtitle) secureSubtitle.value = "";
  secureLink.value  = ""; secureNote.value  = "";
  editorImages = []; imagePreviewGrid.innerHTML = "";
  hideProgressUI();
  editingNoteId = null;
  if (editorDeleteBtn) editorDeleteBtn.style.display = "none";
});

editorDeleteBtn?.addEventListener("click", async () => {
  if (!editingNoteId) { toast("Nothing to delete"); return; }
  const sure = confirm("Delete this note permanently?");
  if (!sure) return;
  try {
    await deleteNote(editingNoteId);
    hide(secureEditorModal);
    secureTitle.value = ""; if (secureSubtitle) secureSubtitle.value = "";
    secureLink.value = ""; secureNote.value = "";
    editorImages = []; imagePreviewGrid.innerHTML = "";
    hideProgressUI();
    editingNoteId = null;
    if (editorDeleteBtn) editorDeleteBtn.style.display = "none";
    toast("Deleted");
    renderSecureList(); updateStorageUI();
  } catch (e) {
    console.error(e);
    toast("Failed to delete note");
  }
});

saveSecureBtn?.addEventListener("click", async (ev) => {
  ev?.preventDefault?.();
  if (isSaving) return;

  if (imagesBusy) { toast("Still processing images…"); return; }
  try { await imageQueue; } catch {}

  const doSave = async () => {
    isSaving = true;
    saveSecureBtn.disabled = true;
    const originalLabel = saveSecureBtn.textContent;
    saveSecureBtn.textContent = "Saving...";

    try {
      const title = secureTitle.value.trim();
      const subtitle = secureSubtitle ? secureSubtitle.value.trim() : "";
      const link  = secureLink.value.trim();
      const note  = secureNote.value.trim();
      let images = editorImages.slice();

      if (!title && !subtitle && !link && !note && images.length === 0) { toast("Nothing to save"); return; }

      ensureProgressUI();
      setProgress(5, "Optimizing images…");
      images = await compressImagesToBudget(images, 6 * 1024 * 1024);
      setProgress(92, "Encrypting…");

      const payload = { title, subtitle, link, note, images };
      const encObj = await encryptJsonWithPass(APP_PASSCODE, payload);

      const createdAt = editingNoteId && currentViewedRecord?.id === editingNoteId
        ? (currentViewedRecord.createdAt || Date.now())
        : (await (async () => {
            if (!editingNoteId) return Date.now();
            const items = await listAllNotes();
            const found = items.find(it => it.id === editingNoteId);
            return found?.createdAt ?? Date.now();
          })());

      if (editingNoteId) {
        await updateNote({ id: editingNoteId, createdAt, ...encObj });
      } else {
        await addNote({ createdAt: Date.now(), ...encObj });
      }

      hide(secureEditorModal);
      secureTitle.value = ""; if (secureSubtitle) secureSubtitle.value = "";
      secureLink.value = ""; secureNote.value = "";
      editorImages = []; imagePreviewGrid.innerHTML = "";
      hideProgressUI();
      editingNoteId = null;
      if (editorDeleteBtn) editorDeleteBtn.style.display = "none";
      toast("Saved");
      renderSecureList(); updateStorageUI();
    } catch (e) {
      console.error("Save failed:", e);
      hideProgressUI();
      const name = (e && e.name) || "";
      if (name.includes("Quota") || name === "QuotaExceededError") {
        toast("Save failed: storage quota hit. Try fewer/smaller images.");
      } else if (name.includes("DataError") || /decod(e|ing)/i.test(e?.message || "")) {
        toast("Save failed: image decode issue. Convert HEIC → JPG and retry.");
      } else {
        toast("Save failed: unexpected error. Check console for details.");
      }
    } finally {
      isSaving = false;
      saveSecureBtn.disabled = false;
      saveSecureBtn.textContent = originalLabel;
    }
  };

  if (!currentPasscode) return withPasscode("Re-enter passcode to save", () => { currentPasscode = APP_PASSCODE; doSave(); });
  doSave();
});

/* -----------------------
   Boot
----------------------- */
(async function boot() {
  try { db = await openDB(); }
  catch (e) { console.error("DB open failed:", e); toast("Storage unavailable"); }

  hide(vaultSection); show(publicNoteSection);
  updateStorageUI();

  // Make sure existing panels are set as scrollable on boot (in case of SSR/rehydration)
  if (vaultSection) makeScrollable(vaultSection);
  if (secureViewerModal) {
    const body = secureViewerModal.querySelector('.modal-body');
    if (body) makeScrollable(body);
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      [confirmDeleteModal, passwordModal, secureEditorModal, secureViewerModal, burnAllModal, settingsModal, imageLightbox].forEach(hide);
      pinBuffer = ""; renderPinDots();
      currentViewedRecord = null; currentViewedData = null;
      currentLightboxIndex = -1; lightboxImg.src = "";
      hideProgressUI();
      if (editorDeleteBtn) editorDeleteBtn.style.display = "none";
      unlockBodyScroll();
      _viewerCleanupFns.forEach(fn => { try { fn(); } catch {} });
      _viewerCleanupFns = [];
    }
  });
})();
