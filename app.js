const $ = (id) => document.getElementById(id);

function shuffle(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function speak(text) {
  if (!state.settings.voice) return;
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'hr-HR';
  u.rate = 1.0;
  window.speechSynthesis.speak(u);
}

function beep(kind="ok"){
  if (!state.settings.sound) return;

  // kind: "ok" | "bad" | "win"
  const now = (window.AudioContext || window.webkitAudioContext);
  if (!now) return;

  try{
    const ctx = new now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";

    if (kind === "ok") o.frequency.value = 880;
    else if (kind === "win") o.frequency.value = 990;
    else o.frequency.value = 220;

    g.gain.value = 0.0001;
    o.connect(g); g.connect(ctx.destination);
    o.start();

    // quick envelope (plop)
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    setTimeout(() => { o.stop(); ctx.close(); }, 220);
  } catch {}
}

function showScreen(screenId){
  const screens = ["screenName","screenMenu","screenLevels","screenGame","screenLetters","screenResult","screenSettings"];
  screens.forEach(id => $(id).classList.toggle("active", id === screenId));
}

// ========= Persistent storage =========
const STORAGE_KEY = "mica_uci_state_v1";

function loadPersistent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.meta = { ...state.meta, ...(data.meta || {}) };
    state.playerName = (data.playerName || "").trim();
  } catch {}
}

function savePersistent() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      settings: state.settings,
      meta: state.meta,
      playerName: state.playerName
    }));
  } catch {}
}

// ========= State =========
const state = {
  selectedLevel: 1,
  cfg: null,

  playerName: "",

  meta: {
    totalStars: 0
  },

  run: {
    qIndex: 0,
    questionCount: 10,
    livesLeft: 0,
    stars: 0,
    correct: 0,
    current: null,
    locked: false,
  },

  settings: {
    sound: true,
    voice: true,
  },

  mica: {
    idle: "mica/mica-idle.png",
    cool: "mica/mica-cool.png",
    wet:  "mica/mica-wet.png",
    happy:"mica/mica-happy.png"
  }
};

loadPersistent();

// ========= Name UI =========
function setPlayerNameUI(){
  const badge = $("playerNameBadge");
  if (!badge) return;
  badge.textContent = state.playerName ? `— ${state.playerName}` : "";
}

function setTotalStarsUI(){
  const el = $("totalStarsBadge");
  if (!el) return;
  el.textContent = String(state.meta.totalStars || 0);
}

function requireNameThenStart(){
  if (!state.playerName) {
    showScreen("screenName");
    const inp = $("playerNameInput");
    if (inp) setTimeout(() => inp.focus(), 50);
  } else {
    setPlayerNameUI();
    setTotalStarsUI();
    showScreen("screenMenu");
  }
}

// ========= Unlock logic =========
function unlockedLevels() {
  const total = state.meta.totalStars || 0;
  return {
    l1: true,
    l2: total >= 20,
    l3: total >= 50
  };
}

function refreshLevelLockUI(){
  const u = unlockedLevels();
  document.querySelectorAll(".card").forEach(btn => {
    const lvl = Number(btn.dataset.level);
    const locked = (lvl === 2 && !u.l2) || (lvl === 3 && !u.l3);
    btn.disabled = locked;
    if (locked) {
      const need = (lvl === 2) ? 20 : 50;
      btn.title = `Otključaj s ${need}⭐ (sad imaš ${state.meta.totalStars}⭐)`;
    } else {
      btn.title = "";
    }
  });
}

// ========= Mica animations =========
function animateMica(elId, kind){
  const el = $(elId);
  if (!el) return;
  el.classList.remove("bounce","shake");
  void el.offsetWidth;
  el.classList.add(kind);
}

function showDrops(){
  const d = $("dropsImg");
  if (!d) return;
  d.classList.remove("show");
  void d.offsetWidth;
  d.classList.add("show");
}
function showSparkle(){
  const s = $("sparkle");
  if (!s) return;
  s.classList.remove("show");
  void s.offsetWidth;
  s.classList.add("show");
}

function showConfetti(text="🎉 Bravo!"){
  const c = $("confetti");
  if (!c) return;
  const msg = c.querySelector(".msg");
  if (msg) msg.textContent = text;
  c.classList.remove("show");
  void c.offsetWidth;
  c.classList.add("show");
}

function markAnswerButtons(buttons, correctIndex, chosenIndex){
  buttons.forEach((b, i) => {
    b.classList.remove("correct","wrong");
    if (i === correctIndex) b.classList.add("correct");
    if (i === chosenIndex && chosenIndex !== correctIndex) b.classList.add("wrong");
  });
  // clear after short time
  setTimeout(() => buttons.forEach(b => b.classList.remove("correct","wrong")), 500);
}
// ========= Math config =========
function getConfig(level){
  if (level === 1) return { max: 10, lives: 10, qCount: 10 };
  if (level === 2) return { max: 20, lives: 5,  qCount: 10 };
  return              { max: 30, lives: 3,  qCount: 10 };
}

// ========= Math generator =========
function genQuestion(cfg){
  const isAdd = Math.random() < 0.5;
  let a, b, correct, op;

  if (isAdd){
    op = "+";
    a = Math.floor(Math.random() * (cfg.max + 1));
    b = Math.floor(Math.random() * (cfg.max - a + 1));
    correct = a + b;
  } else {
    op = "−";
    a = Math.floor(Math.random() * (cfg.max + 1));
    b = Math.floor(Math.random() * (a + 1));
    correct = a - b;
  }

  const deltas = shuffle([-1, +1, -2, +2, -3, +3, -4, +4, -5, +5]);
  const set = new Set([correct]);

  for (const d of deltas){
    if (set.size >= 4) break;
    const cand = correct + d;
    if (cand < 0 || cand > cfg.max) continue;
    set.add(cand);
  }
  while (set.size < 4){
    set.add(Math.floor(Math.random() * (cfg.max + 1)));
  }

  const choices = shuffle(Array.from(set)).slice(0,4);
  const correctIndex = choices.indexOf(correct);

  return { a, b, op, correct, choices, correctIndex };
}

// ========= Math UI =========
const ansButtons = Array.from(document.querySelectorAll("#screenGame .ans-btn"));

function renderLives(){
  const el = $("lives");
  el.innerHTML = "";
  for (let i=0; i<state.cfg.lives; i++){
    const span = document.createElement("span");
    span.className = "heart";
    span.textContent = (i < state.run.livesLeft) ? "❤️" : "🤍";
    el.appendChild(span);
  }
}

function setMica(mode){
  const img = $("micaImg");
  if (!img) return;
  if (mode === "cool") img.src = state.mica.cool;
  else if (mode === "wet") img.src = state.mica.wet;
  else if (mode === "happy") img.src = state.mica.happy;
  else img.src = state.mica.idle;
}

function toast(msg){ $("toast").textContent = msg || ""; }

function renderHUD(){
  $("stars").textContent = `⭐ ${state.run.stars}`;
  $("progress").textContent = `${state.run.qIndex + 1}/${state.run.questionCount}`;
  renderLives();
}

function startRun(level){
  state.selectedLevel = level;
  state.cfg = getConfig(level);

  state.run.qIndex = 0;
  state.run.questionCount = state.cfg.qCount;
  state.run.livesLeft = state.cfg.lives;
  state.run.stars = 0;
  state.run.correct = 0;
  state.run.locked = false;

  showScreen("screenGame");
  nextQuestion();
  renderHUD();
  setMica("idle");

  const name = state.playerName ? `, ${state.playerName}` : "";
  speak(`Krenimo${name}!`);
}

function nextQuestion(){
  if (state.run.qIndex >= state.run.questionCount){
    endRun(true);
    return;
  }

  state.run.current = genQuestion(state.cfg);
  $("question").textContent = `${state.run.current.a} ${state.run.current.op} ${state.run.current.b} = ?`;

  ansButtons.forEach((btn, i) => {
    btn.textContent = state.run.current.choices[i];
    btn.disabled = false;
  });

  toast("");
  setMica("idle");
  renderHUD();
}

function lockAnswers(lock=true){
  state.run.locked = lock;
  ansButtons.forEach(btn => btn.disabled = lock);
}

function handleAnswer(index){
  if (state.run.locked) return;
  lockAnswers(true);

  const q = state.run.current;
  const ok = (index === q.correctIndex);
  const name = state.playerName ? `, ${state.playerName}` : "";

  // highlight correct/wrong
  markAnswerButtons(ansButtons, q.correctIndex, index);

  if (ok){
    state.run.stars += 1;
    state.run.correct += 1;

    toast(`Bravo${name}! ✨`);
    setMica("happy");
    animateMica("micaImg", "bounce");
    showSparkle();

    beep("ok");
    speak(`Bravo${name}!`);
  } else {
    state.run.livesLeft -= 1;

    toast(`Ups${name}! Pokušaj dalje 💦`);
    setMica("wet");
    animateMica("micaImg", "shake");
    showDrops();

    beep("bad");
    speak(`Pokušaj ponovno${name}.`);

    if (state.run.livesLeft <= 0){
      renderHUD();
      setTimeout(() => endRun(false), 500);
      return;
    }
  }

  renderHUD();

  state.run.qIndex += 1;
  setTimeout(() => {
    lockAnswers(false);
    nextQuestion();
  }, 450);
}
 

function endRun(success){
  const name = state.playerName ? `, ${state.playerName}` : "";

  if (success){
    beep("win");
showConfetti(`🎉 Bravo, ${state.playerName || "učenice"}!`);
    setMica("cool");
    animateMica("micaImg", "bounce");
    speak(`Bravo${name}! Završila si rundu!`);
  } else {
    showConfetti(`🙂 Nema veze, ${state.playerName || "učenice"}!`);
    speak(`Nema veze${name}. Probaj ponovno!`);
  }

  // global stars
  state.meta.totalStars = (state.meta.totalStars || 0) + state.run.stars;
  savePersistent();
  setTotalStarsUI();
  refreshLevelLockUI();

  $("resultTitle").textContent = success ? "Bravo!" : "Pokušaj ponovno!";
  $("resultScore").textContent = `Točno: ${state.run.correct}/${state.run.questionCount}`;
  $("resultStars").textContent = `⭐ Osvojeno: +${state.run.stars} (ukupno: ${state.meta.totalStars}⭐)`;

  setTimeout(() => showScreen("screenResult"), success ? 650 : 250);
}

// bind math answer buttons
ansButtons.forEach((btn) => {
  btn.addEventListener("click", () => handleAnswer(Number(btn.dataset.ans)));
});

// ========= Letters Module =========
const HR_LETTERS = [
  "A","B","C","Č","Ć","D","Đ","E","F","G","H","I","J","K","L","M",
  "N","O","P","R","S","Š","T","U","V","Z","Ž"
];

const letters = {
  qCount: 10,
  qIndex: 0,
  current: null,
  locked: false
};

function randItem(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function toLowerHR(ch){ return ch.toLocaleLowerCase("hr-HR"); }
function toUpperHR(ch){ return ch.toLocaleUpperCase("hr-HR"); }

function genLettersQuestion(){
  const r = Math.random();
  const mode = (r < 0.34) ? "find" : (r < 0.67) ? "match" : "start";

  const L = randItem(HR_LETTERS);
  const upper = toUpperHR(L);
  const lower = toLowerHR(L);

  if (mode === "find") {
    const target = (Math.random() < 0.5) ? upper : lower;
    const choices = new Set([target]);
    while (choices.size < 4) {
      const other = randItem(HR_LETTERS);
      const c = (Math.random() < 0.5) ? toUpperHR(other) : toLowerHR(other);
      choices.add(c);
    }
    const arr = shuffle(Array.from(choices));
    return {
      mode,
      prompt: `Dodirni slovo ${target}`,
      big: target,
      choices: arr,
      correctIndex: arr.indexOf(target)
    };
  }

  if (mode === "match") {
    const show = (Math.random() < 0.5) ? upper : lower;
    const target = (show === upper) ? lower : upper;

    const choices = new Set([target]);
    while (choices.size < 4) {
      const other = randItem(HR_LETTERS);
      const c = (Math.random() < 0.5) ? toUpperHR(other) : toLowerHR(other);
      choices.add(c);
    }
    const arr = shuffle(Array.from(choices));
    return {
      mode,
      prompt: `Pronađi par za: ${show}`,
      big: show,
      choices: arr,
      correctIndex: arr.indexOf(target)
    };
  }

  // start: prvo slovo riječi (mini baza)
  const WORDS = [
    { w:"MAČKA", l:"M" },
    { w:"ČAJ", l:"Č" },
    { w:"ŽABA", l:"Ž" },
    { w:"ŠUMA", l:"Š" },
    { w:"RIBA", l:"R" },
    { w:"ĐAK", l:"Đ" },
    { w:"CVIJET", l:"C" },
    { w:"KOLAČ", l:"K" },
    { w:"VODA", l:"V" },
    { w:"TATA", l:"T" }
  ];
  const item = randItem(WORDS);
  const correct = item.l;

  const choices = new Set([correct]);
  while (choices.size < 4) choices.add(randItem(HR_LETTERS));
  const arr = shuffle(Array.from(choices));

  return {
    mode,
    prompt: `Koje slovo je prvo u riječi: ${item.w}?`,
    big: item.w,
    choices: arr,
    correctIndex: arr.indexOf(correct)
  };
}

function renderLettersHUD(){
  $("lettersProgress").textContent = `${letters.qIndex + 1}/${letters.qCount}`;
  const label = letters.current?.mode === "match" ? "Spoji slova"
             : letters.current?.mode === "start" ? "Prvo slovo"
             : "Pronađi slovo";
  $("lettersType").textContent = label;
}

function nextLettersQuestion(){
  if (letters.qIndex >= letters.qCount){
    // bonus stars za završenu rundu slova
    state.meta.totalStars = (state.meta.totalStars || 0) + 5;
    savePersistent();
    setTotalStarsUI();
    refreshLevelLockUI();

    $("resultTitle").textContent = "Bravo!";
    $("resultScore").textContent = `Slova: ${letters.qCount}/${letters.qCount}`;
    $("resultStars").textContent = `⭐ Bonus: +5 (ukupno: ${state.meta.totalStars}⭐)`;
    showScreen("screenResult");
    return;
  }

  letters.current = genLettersQuestion();
  $("lettersPrompt").textContent = letters.current.prompt;
  $("lettersBig").textContent = letters.current.big;
  $("lettersToast").textContent = "";

  const btns = Array.from(document.querySelectorAll('#screenLetters .ans-btn'));
  btns.forEach((b, i) => {
    b.textContent = letters.current.choices[i];
    b.disabled = false;
  });

  $("micaLettersImg").src = state.mica.idle;
  renderLettersHUD();
}

function showLettersScreen(){
  letters.qIndex = 0;
  letters.locked = false;
  showScreen("screenLetters");
  nextLettersQuestion();

  const name = state.playerName ? `, ${state.playerName}` : "";
  speak(`Idemo na slova${name}!`);
}

function handleLetterAnswer(idx){
  if (letters.locked) return;
  letters.locked = true;

  const ok = idx === letters.current.correctIndex;
  const btns = Array.from(document.querySelectorAll('#screenLetters .ans-btn'));
  btns.forEach(b => b.disabled = true);

  const name = state.playerName ? `, ${state.playerName}` : "";

  if (ok){
    $("lettersToast").textContent = `Bravo${name}! ✨`;
    $("micaLettersImg").src = state.mica.cool;
    animateMica("micaLettersImg", "bounce");
    beep("ok");
    speak(`Bravo${name}!`);
  } else {
    $("lettersToast").textContent = `Ups${name}! 💦`;
    $("micaLettersImg").src = state.mica.wet;
    animateMica("micaLettersImg", "shake");
    beep("bad");
    speak(`Pokušaj ponovno${name}.`);
  }

  setTimeout(() => {
    $("micaLettersImg").src = state.mica.idle;
    letters.qIndex += 1;
    letters.locked = false;
    nextLettersQuestion();
  }, 450);
}

function bindLettersUI(){
  const btns = Array.from(document.querySelectorAll('#screenLetters .ans-btn'));
  btns.forEach((b) => {
    b.addEventListener("click", () => handleLetterAnswer(Number(b.dataset.lans)));
  });

  $("btnLettersBack").addEventListener("click", () => showScreen("screenMenu"));
}

bindLettersUI();

// ========= Navigation & Settings =========


const btnMath = $("btnMath");
if (btnMath) btnMath.addEventListener("click", () => {
  showScreen("screenLevels");
  refreshLevelLockUI();
});

const btnLetters = $("btnLetters");
if (btnLetters) btnLetters.addEventListener("click", () => showLettersScreen());

const btnBackToMenu = $("btnBackToMenu");
if (btnBackToMenu) btnBackToMenu.addEventListener("click", () => showScreen("screenMenu"));

document.querySelectorAll(".card").forEach(btn => {
  btn.addEventListener("click", () => {
    const lvl = Number(btn.dataset.level);
    startRun(lvl);
  });
});

const btnPlayAgain = $("btnPlayAgain");
if (btnPlayAgain) btnPlayAgain.addEventListener("click", () => startRun(state.selectedLevel));

const btnToMenu = $("btnToMenu");
if (btnToMenu) btnToMenu.addEventListener("click", () => showScreen("screenMenu"));

const btnSettings = $("btnSettings");
if (btnSettings) btnSettings.addEventListener("click", () => showScreen("screenSettings"));

const btnCloseSettings = $("btnCloseSettings");
if (btnCloseSettings) btnCloseSettings.addEventListener("click", () => showScreen("screenMenu"));

const btnChangeName = $("btnChangeName");
if (btnChangeName) btnChangeName.addEventListener("click", () => {
  const inp = $("playerNameInput");
  if (inp) inp.value = state.playerName || "";
  showScreen("screenName");
  setTimeout(() => inp && inp.focus(), 50);
});

const toggleSound = $("toggleSound");
if (toggleSound) {
  toggleSound.checked = !!state.settings.sound;
  toggleSound.addEventListener("change", (e) => {
    state.settings.sound = !!e.target.checked;
    savePersistent();
  });
}

const toggleVoice = $("toggleVoice");
if (toggleVoice) {
  toggleVoice.checked = !!state.settings.voice;
  toggleVoice.addEventListener("change", (e) => {
    state.settings.voice = !!e.target.checked;
    savePersistent();
  });
}

// Save name
const btnSaveName = $("btnSaveName");
if (btnSaveName) btnSaveName.addEventListener("click", () => {
  const inp = $("playerNameInput");
  const val = (inp?.value || "").trim();
  if (!val) { alert("Upiši ime 🙂"); return; }

  state.playerName = val.slice(0, 20);
  savePersistent();
  setPlayerNameUI();
  setTotalStarsUI();
  showScreen("screenMenu");
});

// Initial UI
setPlayerNameUI();
setTotalStarsUI();
refreshLevelLockUI();
requireNameThenStart();
// ===== FAILSAFE: save name (override) =====
(function(){
  const btn = document.getElementById("btnSaveName");
  if (!btn) return;

  btn.onclick = () => {
    const inp = document.getElementById("playerNameInput");
    const val = (inp?.value || "").trim();
    if (!val) {
      alert("Upiši ime 🙂");
      return;
    }

    state.playerName = val.slice(0, 20);
    savePersistent();
    setPlayerNameUI();
    setTotalStarsUI();
    showScreen("screenMenu");
  };
})();