const STORAGE_KEY = "clublog-state-v1";
const SESSION_KEY = "clublog-session-v1";
const FIREBASE_SDK_VERSION = "12.7.0";
const FIREBASE_STATE_COLLECTION = "clublog";
const FIREBASE_STATE_DOCUMENT = "appState";
const IMAGE_MAX_DIMENSION = 600;
const IMAGE_MAX_BYTES = 180 * 1024;
const IMAGE_QUALITY_STEPS = [0.72, 0.62, 0.52, 0.42];

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
    records: Array.isArray(savedState.records) ? savedState.records : defaults.records,
    schedules: Array.isArray(savedState.schedules) ? savedState.schedules : defaults.schedules,
    smartHr: {
      ...defaults.smartHr,
      ...(savedState.smartHr || {})
    }
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
