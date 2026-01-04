// ===== Firebase SDK import & 초기화 =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
// 추후 Auth / Firestore 사용 시 아래 주석 해제해서 사용 가능
// import { getAuth } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
// import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-wThpRQqn1XaB8sIBO4J4Mq_kOQyTy04",
  authDomain: "ejtube-7a3b9.firebaseapp.com",
  projectId: "ejtube-7a3b9",
  storageBucket: "ejtube-7a3b9.firebasestorage.app",
  messagingSenderId: "1065039235604",
  appId: "1:1065039235604:web:ebd9ca5f3653df841a7501"
};

const app = initializeApp(firebaseConfig);
// const auth = getAuth(app);
// const db = getFirestore(app);

// ===== 설정 =====

// 비밀번호 (나만 사용하는 용도라 간단하게)
const PASSWORD = "1234";

// YouTube Data API 키
const API_KEY = "YOUR_API_KEY_HERE";

// localStorage 키
const STORAGE_KEY = "ej_tube_tracks_v1";

// ===== 전역 상태 =====

let player = null;
let tracks = []; // { id, videoId, title, channel, thumbnail, addedAt }
let currentTrackId = null;

// ===== DOM 참조 =====

const lockScreen = document.getElementById("lock-screen");
const mainScreen = document.getElementById("main-screen");
const passwordInput = document.getElementById("passwordInput");
const unlockButton = document.getElementById("unlockButton");
const lockError = document.getElementById("lockError");

// (index.html에 탭 요소가 없다면 이 부분은 나중에 탭 UI 추가 시 사용)
const tabAdd = document.getElementById("tabAdd");
const tabList = document.getElementById("tabList");
const addView = document.getElementById("add-view");
const listView = document.getElementById("list-view");

const addButton = document.getElementById("addButton");
const videoUrlInput = document.getElementById("videoUrl");
const clearListButton = document.getElementById("clearListButton");
const trackListEl = document.getElementById("trackList");

const titleEl = document.getElementById("title");
const artistEl = document.getElementById("artist");
const thumbnailEl = document.getElementById("thumbnail");

// ===== 비밀번호 잠금 =====

unlockButton.addEventListener("click", () => {
  const value = passwordInput.value.trim();
  if (value === PASSWORD) {
    lockScreen.style.display = "none";
    mainScreen.classList.remove("hidden");
    // 잠금 해제 후, 저장된 리스트 로딩
    loadTracksFromStorage();
    renderTrackList();
  } else {
    lockError.textContent = "비밀번호가 올바르지 않습니다.";
  }
});

passwordInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    unlockButton.click();
  }
});

// ===== 탭 전환 (탭 요소 있을 때만 동작하도록 안전 처리) =====

function showAddView() {
  if (!tabAdd || !tabList || !addView || !listView) return;
  tabAdd.classList.add("active");
  tabList.classList.remove("active");
  addView.classList.add("active-view");
  listView.classList.remove("active-view");
}

function showListView() {
  if (!tabAdd || !tabList || !addView || !listView) return;
  tabAdd.classList.remove("active");
  tabList.classList.add("active");
  addView.classList.remove("active-view");
  listView.classList.add("active-view");
}

if (tabAdd && tabList) {
  tabAdd.addEventListener("click", showAddView);
  tabList.addEventListener("click", showListView);
}

// ===== 유틸: videoId 추출 =====

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.slice(1);
    }
    if (u.searchParams.get("v")) {
      return u.searchParams.get("v");
    }
    const paths = u.pathname.split("/");
    return paths.pop() || paths.pop();
  } catch (e) {
    return null;
  }
}

// ===== Data API: 영상 정보 가져오기 =====

async function fetchVideoInfo(videoId) {
  const endpoint = "https://www.googleapis.com/youtube/v3/videos";
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    id: videoId
  });

  const res = await fetch(`${endpoint}?${params.toString()}`);
  if (!res.ok) throw new Error("YouTube Data API 오류");
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("영상 정보를 찾을 수 없음");
  }

  const snippet = data.items[0].snippet;
  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    thumbnail:
      (snippet.thumbnails && snippet.thumbnails.medium?.url) ||
      snippet.thumbnails.default.url
  };
}

// ===== Iframe API 콜백 =====

function onYouTubeIframeAPIReady() {
  // 최초에는 아무것도 하지 않음
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// ===== 트랙 저장/불러오기 =====

function loadTracksFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      tracks = [];
      return;
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      tracks = parsed.sort((a, b) => b.addedAt - a.addedAt);
    } else {
      tracks = [];
    }
  } catch {
    tracks = [];
  }
}

function saveTracksToStorage() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tracks));
}

// ===== UI 렌더링 =====

function renderTrackList() {
  trackListEl.innerHTML = "";

  if (tracks.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "아직 추가된 영상이 없습니다.";
    empty.style.fontSize = "13px";
    empty.style.color = "#9ca3af";
    trackListEl.appendChild(empty);
    return;
  }

  tracks.forEach((track) => {
    const li = document.createElement("li");
    li.className = "track-item";
    li.dataset.trackId = track.id;

    if (track.id === currentTrackId) {
      li.classList.add("active");
    }

    const img = document.createElement("img");
    img.className = "track-item-thumb";
    img.src = track.thumbnail;
    img.alt = track.title;

    const textBox = document.createElement("div");
    textBox.className = "track-item-text";

    const titleDiv = document.createElement("div");
    titleDiv.className = "track-item-title";
    titleDiv.textContent = track.title;

    const artistDiv = document.createElement("div");
    artistDiv.className = "track-item-artist";
    artistDiv.textContent = track.channel;

    textBox.appendChild(titleDiv);
    textBox.appendChild(artistDiv);

    const metaDiv = document.createElement("div");
    metaDiv.className = "track-item-meta";
    metaDiv.textContent = new Date(track.addedAt).toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit"
    });

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "삭제";

    metaDiv.appendChild(delBtn);

    li.appendChild(img);
    li.appendChild(textBox);
    li.appendChild(metaDiv);

    li.addEventListener("click", (e) => {
      if (e.target === delBtn) return;
      playTrack(track.id);
    });

    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrack(track.id);
    });

    trackListEl.appendChild(li);
  });
}

function updateNowPlaying(track) {
  titleEl.textContent = track.title;
  artistEl.textContent = track.channel;
  thumbnailEl.src = track.thumbnail;
}

// ===== 트랙 추가/삭제/재생 =====

async function addTrackFromUrl(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    alert("유효한 YouTube 주소가 아닌 것 같아요.");
    return;
  }

  try {
    const info = await fetchVideoInfo(videoId);

    const newTrack = {
      id: `${videoId}_${Date.now()}`,
      videoId,
      title: info.title,
      channel: info.channel,
      thumbnail: info.thumbnail,
      addedAt: Date.now()
    };

    tracks.unshift(newTrack);
    saveTracksToStorage();
    currentTrackId = newTrack.id;
    updateNowPlaying(newTrack);
    renderTrackList();
    playVideoById(videoId);
    showListView(); // 추가 후 리스트 화면으로 전환
  } catch (err) {
    console.error(err);
    alert("영상 정보를 불러오는 중 문제가 발생했어요.");
  }
}

function deleteTrack(id) {
  const index = tracks.findIndex((t) => t.id === id);
  if (index === -1) return;

  tracks.splice(index, 1);
  saveTracksToStorage();

  if (currentTrackId === id) {
    currentTrackId = tracks[0]?.id || null;
    if (currentTrackId) {
      updateNowPlaying(tracks[0]);
      playVideoById(tracks[0].videoId);
    }
  }

  renderTrackList();
}

function playTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track) return;

  currentTrackId = id;
  updateNowPlaying(track);
  playVideoById(track.videoId);
  renderTrackList();
}

function playVideoById(videoId) {
  if (!player) {
    player = new YT.Player("player", {
      width: "640",
      height: "360",
      videoId,
      playerVars: {
        rel: 0,
        playsinline: 1
      }
    });
  } else {
    player.loadVideoById(videoId);
  }
}

// ===== 이벤트 바인딩 =====

addButton.addEventListener("click", () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  addTrackFromUrl(url);
  videoUrlInput.value = "";
});

videoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addButton.click();
  }
});

clearListButton.addEventListener("click", () => {
  if (!confirm("정말 전체 리스트를 비울까요?")) return;
  tracks = [];
  currentTrackId = null;
  saveTracksToStorage();
  renderTrackList();
  titleEl.textContent = "제목";
  artistEl.textContent = "아티스트";
  thumbnailEl.removeAttribute("src");
});
