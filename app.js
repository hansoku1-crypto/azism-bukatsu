const STORAGE_KEY = "clublog-state-v1";
const SESSION_KEY = "clublog-session-v1";
const FIREBASE_SDK_VERSION = "12.7.0";
const FIREBASE_STATE_COLLECTION = "clublog";
const FIREBASE_STATE_DOCUMENT = "appState";
const IMAGE_MAX_DIMENSION = 600;
const IMAGE_MAX_BYTES = 180 * 1024;
const IMAGE_QUALITY_STEPS = [0.72, 0.62, 0.52, 0.42];
const MAX_RECORD_PHOTOS = 3;

const seedEmployees = [
  {
    id: "E1001",
    password: "demo123",
    name: "佐藤 美咲",
    division: "リテール事業部",
    store: "新宿店",
    clubs: ["フットサル部", "写真部"]
  },
  {
    id: "E1002",
    password: "demo123",
    name: "田中 健",
    division: "EC事業部",
    store: "本社",
    clubs: ["写真部", "サウナ部"]
  }
];

const seedClubs = [
  {
    name: "フットサル部",
    owner: "佐藤 美咲",
    description: "平日夜に近隣コートで活動。初心者も参加しやすい運動系コミュニティです。",
    members: ["佐藤 美咲", "伊藤 蓮", "小林 直人", "山口 紗季"]
  },
  {
    name: "写真部",
    owner: "田中 健",
    description: "店舗紹介や季節イベントの撮影も兼ねて、月1回の撮影会を開いています。",
    members: ["佐藤 美咲", "田中 健", "高橋 凛", "森 優子"]
  },
  {
    name: "サウナ部",
    owner: "田中 健",
    description: "仕事終わりに整う会。施設情報と混雑メモを共有します。",
    members: ["田中 健", "中村 航", "高橋 凛"]
  },
  {
    name: "ボードゲーム部",
    owner: "森 優子",
    description: "休憩スペースで短時間ゲームから重量級まで。新作持ち込み歓迎です。",
    members: ["森 優子", "小林 直人", "山口 紗季"]
  }
];

const seedRecords = [
  {
    id: createId(),
    club: "フットサル部",
    date: "2026-05-09",
    title: "新宿コートで交流戦",
    body: "3店舗合同でミニゲームを実施。初参加メンバーも多く、次回はビブスを追加予定です。",
    author: "佐藤 美咲",
    photo: ""
  },
  {
    id: createId(),
    club: "写真部",
    date: "2026-05-06",
    title: "春の売場撮影会",
    body: "店頭ディスプレイの撮影とレタッチ共有。社内報に使えそうな写真が集まりました。",
    author: "田中 健",
    photo: ""
  }
];

const seedSchedules = [
  {
    id: createId(),
    club: "フットサル部",
    date: "2026-05-21",
    time: "19:30",
    message: "新宿中央コート集合。シューズ持参でお願いします。",
    votes: {
      "佐藤 美咲": "yes",
      "伊藤 蓮": "maybe"
    }
  },
  {
    id: createId(),
    club: "写真部",
    date: "2026-05-25",
    time: "10:00",
    message: "本社前集合。雨天時は屋内でレタッチ会に切り替えます。",
    votes: {
      "田中 健": "yes"
    }
  }
];

let storage = createLocalStorageAdapter();
let state = createDefaultState();
let currentEmployee = loadSession();
let activeClub = "";

const screens = [...document.querySelectorAll(".screen")];
const navButtons = [...document.querySelectorAll(".nav-btn")];
const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");

const employeeProvider = {
  async signIn(employeeId, password) {
    const employee = state.employees.find((item) => item.id === employeeId && item.password === password);
    if (!employee) {
      throw new Error("社員IDまたはパスワードが違います。");
    }
    return stripPassword(employee);
  },
  async syncFromSmartHR(tenantSubdomain) {
    if (!tenantSubdomain.trim()) {
      throw new Error("テナントサブドメインを入力してください。");
    }

    // Production note:
    // Call a server endpoint such as /api/integrations/smarthr/employees.
    // The server should hold the SmartHR access token and call
    // https://{tenant}.smarthr.jp/api with Authorization: Bearer TOKEN.
    return {
      syncedAt: new Date().toISOString(),
      count: state.employees.length
    };
  }
};

function createDefaultState() {
  return {
    employees: cloneData(seedEmployees),
    clubs: cloneData(seedClubs),
    records: cloneData(seedRecords),
    schedules: cloneData(seedSchedules),
    smartHr: {
      tenant: "",
      syncedAt: ""
    }
  };
}

function normalizeState(savedState) {
  const defaults = createDefaultState();
  if (!savedState || typeof savedState !== "object") {
    return defaults;
  }

  return {
    employees: Array.isArray(savedState.employees) && savedState.employees.length ? savedState.employees : defaults.employees,
    clubs: Array.isArray(savedState.clubs) && savedState.clubs.length ? savedState.clubs : defaults.clubs,
    records: Array.isArray(savedState.records) ? savedState.records.map(normalizeRecord) : defaults.records.map(normalizeRecord),
    schedules: Array.isArray(savedState.schedules) ? savedState.schedules : defaults.schedules,
    smartHr: {
      ...defaults.smartHr,
      ...(savedState.smartHr || {})
    }
  };
}

function normalizeRecord(record) {
  const photos = Array.isArray(record.photos) ? record.photos : (record.photo ? [record.photo] : []);
  return {
    ...record,
    photos: photos.slice(0, MAX_RECORD_PHOTOS),
    photo: record.photo || photos[0] || ""
  };
}

function createLocalStorageAdapter() {
  return {
    mode: "local",
    async loadState() {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? normalizeState(JSON.parse(saved)) : createDefaultState();
    },
    async saveState(nextState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    }
  };
}

async function createStorageAdapter() {
  const config = window.CLUBLOG_FIREBASE_CONFIG;
  if (!config || !config.apiKey || !config.projectId) {
    return createLocalStorageAdapter();
  }

  try {
    return await createFirestoreAdapter(config);
  } catch (error) {
    console.warn("Firebase initialization failed. Falling back to localStorage.", error);
    return createLocalStorageAdapter();
  }
}

async function createFirestoreAdapter(config) {
  const appModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`);
  const firestoreModule = await import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`);
  const app = appModule.initializeApp(config);
  const db = firestoreModule.getFirestore(app);
  const stateRef = firestoreModule.doc(db, FIREBASE_STATE_COLLECTION, FIREBASE_STATE_DOCUMENT);

  return {
    mode: "firebase",
    async loadState() {
      const snapshot = await firestoreModule.getDoc(stateRef);
      if (snapshot.exists()) {
        return normalizeState(snapshot.data());
      }

      const defaultState = createDefaultState();
      await firestoreModule.setDoc(stateRef, defaultState);
      return defaultState;
    },
    async saveState(nextState) {
      await firestoreModule.setDoc(stateRef, cloneData(nextState));
    }
  };
}

async function saveState() {
  await storage.saveState(state);
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  return JSON.parse(saved);
}

function saveSession(employee) {
  currentEmployee = employee;
  localStorage.setItem(SESSION_KEY, JSON.stringify(employee));
}

function stripPassword(employee) {
  const { password, ...safeEmployee } = employee;
  return safeEmployee;
}

async function init() {
  storage = await createStorageAdapter();
  state = await storage.loadState();
  bindEvents();
  setTodayDefaults();
  document.querySelector("#currentDate").textContent = new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());

  if (currentEmployee) {
    enterApp();
  }
}

function bindEvents() {
  document.querySelector("#loginForm").addEventListener("submit", handleLogin);
  document.querySelector("#logoutButton").addEventListener("click", handleLogout);
  document.querySelector("#recordForm").addEventListener("submit", handleRecordSubmit);
  document.querySelector("#scheduleForm").addEventListener("submit", handleScheduleSubmit);
  document.querySelector("#profileForm").addEventListener("submit", handleProfileSubmit);
  document.querySelector("#smartHrSyncButton").addEventListener("click", handleSmartHrSync);
  document.querySelector("#homeRecordButton").addEventListener("click", () => showRecordForm());

  navButtons.forEach((button) => {
    button.addEventListener("click", () => showScreen(button.dataset.screen));
  });

  document.querySelectorAll("[data-goto]").forEach((button) => {
    button.addEventListener("click", () => showScreen(`${button.dataset.goto}Screen`));
  });
}

function setTodayDefaults() {
  const today = new Date().toISOString().slice(0, 10);
  document.querySelector("#recordForm [name='date']").value = today;
  document.querySelector("#scheduleForm [name='date']").value = today;
  document.querySelector("#scheduleForm [name='time']").value = "19:00";
}

async function handleLogin(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const message = document.querySelector("#loginMessage");
  message.textContent = "";

  try {
    const employee = await employeeProvider.signIn(form.get("employeeId").trim(), form.get("password"));
    saveSession(employee);
    enterApp();
  } catch (error) {
    message.textContent = error.message;
  }
}

function handleLogout() {
  currentEmployee = null;
  localStorage.removeItem(SESSION_KEY);
  loginView.hidden = false;
  appView.hidden = true;
}

function enterApp() {
  loginView.hidden = true;
  appView.hidden = false;
  activeClub = currentEmployee.clubs[0] || state.clubs[0].name;
  populateClubSelects();
  renderAll();
  showScreen("homeScreen");
}

function showScreen(screenId) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === screenId));
  navButtons.forEach((button) => button.classList.toggle("active", button.dataset.screen === screenId));
  const activeScreen = document.querySelector(`#${screenId}`);
  document.querySelector("#screenTitle").textContent = activeScreen.dataset.title;
  document.querySelector(".content-scroll").scrollTop = 0;
}

function showRecordForm() {
  showScreen("recordsScreen");
}

function showRecordDetail(recordId) {
  const record = state.records.find((item) => item.id === recordId);
  if (!record) return;
  renderRecordDetail(record);
  showScreen("recordDetailScreen");
}

function renderAll() {
  renderHome();
  renderClubs();
  renderRecords();
  renderSchedules();
  renderProfile();
}

function currentClubNames() {
  return currentEmployee.clubs.length ? currentEmployee.clubs : state.clubs.map((club) => club.name);
}

function populateClubSelects() {
  const options = currentClubNames().map((club) => `<option value="${escapeHtml(club)}">${escapeHtml(club)}</option>`).join("");
  document.querySelector("#recordForm [name='club']").innerHTML = options;
  document.querySelector("#scheduleForm [name='club']").innerHTML = options;
}

function renderHome() {
  document.querySelector("#welcomeName").textContent = `${currentEmployee.name}さん`;
  document.querySelector("#welcomeMeta").textContent = `${currentEmployee.division} / ${currentEmployee.store}`;
  document.querySelector("#clubCountBadge").textContent = `${currentEmployee.clubs.length}部活`;

  const latest = state.records
    .filter((record) => currentClubNames().includes(record.club))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  renderRecordCollection(document.querySelector("#latestRecords"), latest);
}

function renderClubs() {
  const filter = document.querySelector(".club-filter");
  filter.innerHTML = state.clubs
    .filter((club) => currentClubNames().includes(club.name))
    .map((club) => {
      const active = club.name === activeClub ? "active" : "";
      return `<button type="button" class="${active}" data-club="${escapeHtml(club.name)}">${escapeHtml(club.name)}</button>`;
    })
    .join("");

  filter.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      activeClub = button.dataset.club;
      renderClubs();
    });
  });

  const club = state.clubs.find((item) => item.name === activeClub) || state.clubs[0];
  const clubRecords = state.records.filter((record) => record.club === club.name).length;
  const next = state.schedules.find((schedule) => schedule.club === club.name);

  document.querySelector("#clubDetails").innerHTML = `
    <article class="club-card">
      <div class="club-top">
        <div>
          <span class="club-pill">${escapeHtml(club.owner)} 代表</span>
          <h3>${escapeHtml(club.name)}</h3>
        </div>
        <span class="status-pill">${clubRecords}件</span>
      </div>
      <p>${escapeHtml(club.description)}</p>
      <div class="member-list">
        ${club.members.map((member) => `<span class="member-chip">${escapeHtml(member)}</span>`).join("")}
      </div>
    </article>
    <article class="schedule-card">
      <div class="schedule-top">
        <div>
          <span class="club-pill">次回</span>
          <h3>${next ? formatDate(next.date) : "未設定"}</h3>
          <p>${next ? `${next.time} / ${escapeHtml(next.message)}` : "候補日を追加してください。"}</p>
        </div>
      </div>
    </article>
  `;
}

function renderRecords() {
  const records = state.records
    .filter((record) => currentClubNames().includes(record.club))
    .sort((a, b) => b.date.localeCompare(a.date));
  renderRecordCollection(document.querySelector("#recordList"), records);
}

function renderRecordCollection(container, records) {
  if (!records.length) {
    container.innerHTML = `<article class="record-card"><div class="record-photo">CL</div><div class="record-body"><h4>記録はまだありません</h4><p>最初の活動を登録できます。</p></div></article>`;
    return;
  }

  container.innerHTML = "";
  const template = document.querySelector("#recordTemplate");
  records.forEach((record) => {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".record-card");
    const photo = node.querySelector(".record-photo");
    const photos = getRecordPhotos(record);
    if (photos.length) {
      photo.innerHTML = `<img src="${photos[0]}" alt="">`;
      if (photos.length > 1) {
        photo.insertAdjacentHTML("beforeend", `<span class="photo-count">+${photos.length - 1}</span>`);
      }
    } else {
      photo.textContent = record.club.slice(0, 2);
    }
    card.dataset.recordId = record.id;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${record.title} の詳細を見る`);
    card.addEventListener("click", () => showRecordDetail(record.id));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showRecordDetail(record.id);
      }
    });
    node.querySelector(".club-pill").textContent = record.club;
    node.querySelector("time").textContent = formatDate(record.date);
    node.querySelector("h4").textContent = record.title;
    node.querySelector("p").textContent = record.body;
    node.querySelector("small").textContent = `${record.author} が投稿`;
    container.appendChild(node);
  });
}

function renderRecordDetail(record) {
  const photos = getRecordPhotos(record);
  const photoHtml = photos.length
    ? `<div class="detail-photo-grid ${photos.length === 1 ? "single" : ""}">
        ${photos.map((photo) => `<img src="${photo}" alt="">`).join("")}
      </div>`
    : `<div class="detail-photo-empty">${escapeHtml(record.club.slice(0, 2))}</div>`;

  document.querySelector("#recordDetail").innerHTML = `
    <button class="secondary-btn detail-back" type="button">活動一覧へ戻る</button>
    <article class="detail-card panel">
      <div class="record-head">
        <span class="club-pill">${escapeHtml(record.club)}</span>
        <time>${formatDate(record.date)}</time>
      </div>
      <h3>${escapeHtml(record.title)}</h3>
      ${photoHtml}
      <p>${escapeHtml(record.body)}</p>
      <small>${escapeHtml(record.author)} が投稿</small>
    </article>
  `;

  document.querySelector(".detail-back").addEventListener("click", () => showScreen("recordsScreen"));
}

function renderSchedules() {
  const schedules = state.schedules
    .filter((schedule) => currentClubNames().includes(schedule.club))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  renderScheduleCollection(document.querySelector("#scheduleList"), schedules);
}

function getRecordPhotos(record) {
  if (Array.isArray(record.photos)) {
    return record.photos.filter(Boolean).slice(0, MAX_RECORD_PHOTOS);
  }
  return record.photo ? [record.photo] : [];
}

function renderScheduleCollection(container, schedules) {
  if (!schedules.length) {
    container.innerHTML = `<article class="schedule-card"><h3>候補日はまだありません</h3><p>次回活動日を登録すると、所属者へ通知する想定です。</p></article>`;
    return;
  }

  container.innerHTML = schedules.map((schedule) => {
    const vote = schedule.votes[currentEmployee.name] || "";
    const counts = countVotes(schedule.votes);
    return `
      <article class="schedule-card" data-schedule-id="${schedule.id}">
        <div class="schedule-top">
          <div>
            <span class="club-pill">${escapeHtml(schedule.club)}</span>
            <h3>${escapeHtml(schedule.message || "次回活動")}</h3>
            <p>通知先: ${escapeHtml(getClubMembers(schedule.club).join("、"))}</p>
          </div>
          <div class="schedule-date">
            ${formatShortDate(schedule.date)}
            <small>${escapeHtml(schedule.time)}</small>
          </div>
        </div>
        <div class="vote-row">
          <button class="vote-btn ${vote === "yes" ? "active" : ""}" type="button" data-vote="yes">参加</button>
          <button class="vote-btn ${vote === "maybe" ? "active" : ""}" type="button" data-vote="maybe">未定</button>
          <button class="vote-btn ${vote === "no" ? "active" : ""}" type="button" data-vote="no">不参加</button>
        </div>
        <div class="vote-summary">
          <span>参加 ${counts.yes}</span>
          <span>未定 ${counts.maybe}</span>
          <span>不参加 ${counts.no}</span>
        </div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".vote-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const card = button.closest("[data-schedule-id]");
      const schedule = state.schedules.find((item) => item.id === card.dataset.scheduleId);
      schedule.votes[currentEmployee.name] = button.dataset.vote;
      await saveState();
      renderAll();
    });
  });
}

function renderProfile() {
  document.querySelector("#profileInitial").textContent = currentEmployee.name.slice(0, 1);
  document.querySelector("#profileName").textContent = currentEmployee.name;
  document.querySelector("#profileMeta").textContent = `${currentEmployee.division} / ${currentEmployee.store}`;

  const form = document.querySelector("#profileForm");
  form.elements.name.value = currentEmployee.name;
  form.elements.division.value = currentEmployee.division;
  form.elements.store.value = currentEmployee.store;

  document.querySelector("#clubCheckboxes").innerHTML = state.clubs.map((club) => {
    const checked = currentEmployee.clubs.includes(club.name) ? "checked" : "";
    return `
      <label>
        <input type="checkbox" name="clubs" value="${escapeHtml(club.name)}" ${checked}>
        ${escapeHtml(club.name)}
      </label>
    `;
  }).join("");

  document.querySelector("#tenantInput").value = state.smartHr.tenant;
  document.querySelector("#smartHrStatus").textContent = state.smartHr.syncedAt ? "同期済み" : "未同期";
}

async function handleRecordSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const message = document.querySelector("#recordMessage");
  const photoFiles = [...form.elements.photo.files];
  let record = null;

  try {
    if (photoFiles.length > MAX_RECORD_PHOTOS) {
      throw new Error(`写真は${MAX_RECORD_PHOTOS}枚まで添付できます。`);
    }

    message.textContent = photoFiles.length ? "写真を圧縮しています。" : "";
    const photos = [];
    for (const file of photoFiles) {
      photos.push(await compressImageFile(file));
    }

    record = {
    id: createId(),
    club: formData.get("club"),
    date: formData.get("date"),
    title: formData.get("title").trim(),
    body: formData.get("body").trim(),
    author: currentEmployee.name,
    photo: photos[0] || "",
    photos
    };

    state.records.unshift(record);
    await saveState();
    form.reset();
    setTodayDefaults();
    populateClubSelects();
    message.textContent = "活動記録を保存しました。";
    renderAll();
  } catch (error) {
    if (record) {
      state.records = state.records.filter((item) => item.id !== record.id);
    }
    console.error(error);
    message.textContent = error.message || "活動記録を保存できませんでした。";
  }
}

async function handleScheduleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const club = formData.get("club");
  state.schedules.push({
    id: createId(),
    club,
    date: formData.get("date"),
    time: formData.get("time"),
    message: formData.get("message").trim(),
    votes: {
      [currentEmployee.name]: "yes"
    }
  });
  await saveState();
  form.reset();
  setTodayDefaults();
  populateClubSelects();
  document.querySelector("#scheduleMessage").textContent = `${club} の所属者へ通知予定を作成しました。`;
  renderAll();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const clubs = formData.getAll("clubs");
  currentEmployee = {
    ...currentEmployee,
    name: formData.get("name").trim(),
    division: formData.get("division").trim(),
    store: formData.get("store").trim(),
    clubs
  };

  const employee = state.employees.find((item) => item.id === currentEmployee.id);
  if (employee) {
    employee.name = currentEmployee.name;
    employee.division = currentEmployee.division;
    employee.store = currentEmployee.store;
    employee.clubs = clubs;
  }

  saveSession(currentEmployee);
  await saveState();
  populateClubSelects();
  document.querySelector("#profileMessage").textContent = "プロフィールを更新しました。";
  renderAll();
}

async function handleSmartHrSync() {
  const tenant = document.querySelector("#tenantInput").value.trim();
  const message = document.querySelector("#smartHrMessage");
  message.textContent = "";

  try {
    const result = await employeeProvider.syncFromSmartHR(tenant);
    state.smartHr = {
      tenant,
      syncedAt: result.syncedAt
    };
    await saveState();
    renderProfile();
    message.textContent = `${result.count}名分の社員データを同期しました。`;
  } catch (error) {
    message.textContent = error.message;
  }
}

function getClubMembers(clubName) {
  const club = state.clubs.find((item) => item.name === clubName);
  return club ? club.members : [];
}

function countVotes(votes) {
  return Object.values(votes).reduce((total, vote) => {
    total[vote] += 1;
    return total;
  }, { yes: 0, maybe: 0, no: 0 });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric"
  }).format(new Date(value));
}

async function compressImageFile(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選択してください。");
  }

  const source = await loadImage(file);
  const { width, height } = fitImageSize(source.width, source.height, IMAGE_MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(source, 0, 0, width, height);
  URL.revokeObjectURL(source.src);

  for (const quality of IMAGE_QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (estimateDataUrlBytes(dataUrl) <= IMAGE_MAX_BYTES) {
      return dataUrl;
    }
  }

  throw new Error("写真サイズが大きすぎます。別の写真を選ぶか、トリミングしてから添付してください。");
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(image.src);
      reject(new Error("写真を読み込めませんでした。"));
    };
    image.src = URL.createObjectURL(file);
  });
}

function fitImageSize(width, height, maxDimension) {
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function estimateDataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

init();
