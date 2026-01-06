// ===== Firebase SDK import & 초기화 =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  updateDoc, // ← 제목 수정용
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Firebase 설정
const firebaseConfig = {
  apiKey: "AIzaSyA-wThpRQqn1XaB8sIBO4J4Mq_kOQyTy04",
  authDomain: "ejtube-7a3b9.firebaseapp.com",
  projectId: "ejtube-7a3b9",
  storageBucket: "ejtube-7a3b9.firebasestorage.app",
  messagingSenderId: "1065039235604",
  appId: "1:1065039235604:web:ebd9ca5f3653df841a7501",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// ===== 설정 =====

// YouTube Data API 키
const API_KEY = "AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4";

// Firestore 컬렉션 경로: users/{uid}/tracks
let currentUser = null;

// ===== 전역 상태 =====

let player = null;
let tracks = []; // { id, videoId, title, channel, thumbnail, addedAt }
let currentTrackId = null;

// 빠른 연속 클릭 방지용 락 (Safari 크래시 완화용)
let playClickLock = false;

// ===== DOM 참조 =====
const miniPlayPauseBtn = document.getElementById("miniPlayPauseBtn");

// 로그인 화면
const loginScreen = document.getElementById("login-screen");
const googleLoginButton = document.getElementById("googleLoginButton");
const loginError = document.getElementById("loginError");

// 메인 화면
const mainScreen = document.getElementById("main-screen");
const logoutButton = document.getElementById("logoutButton");
const userEmailEl = document.getElementById("userEmail");

const addButton = document.getElementById("addButton");
const videoUrlInput = document.getElementById("videoUrl");
const clearListButton = document.getElementById("clearListButton");
const trackListEl = document.getElementById("trackList");

const titleEl = document.getElementById("title");
const artistEl = document.getElementById("artist");
const thumbnailEl = document.getElementById("thumbnail");

// ===== 유틸: videoId / playlistId 추출 =====

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

function extractPlaylistId(url) {
  try {
    const u = new URL(url);
    const listId = u.searchParams.get("list");
    return listId || null;
  } catch (e) {
    return null;
  }
}

// ===== Data API: 영상 / 플레이리스트 정보 가져오기 =====

async function fetchVideoInfo(videoId) {
  const endpoint = "https://www.googleapis.com/youtube/v3/videos";
  const params = new URLSearchParams({
    key: API_KEY,
    part: "snippet",
    id: videoId,
  });

  const res = await fetch(`${endpoint}?${params.toString()}`);
  if (!res.ok) throw new Error("YouTube Data API 오류");
  const data = await res.json();

  if (!data.items || data.items.length === 0) {
    throw new Error("영상 정보를 찾을 수 없음");
  }

  const snippet = data.items[0].snippet;
  const thumbs = snippet.thumbnails || {};

  const bestThumb =
    thumbs.maxres?.url ||
    thumbs.standard?.url ||
    thumbs.high?.url ||
    thumbs.medium?.url ||
    thumbs.default?.url;

  return {
    title: snippet.title,
    channel: snippet.channelTitle,
    thumbnail: bestThumb,
  };
}

// playlistId로 안의 videoId 목록 가져오기 (최대 50개 정도만)
async function fetchPlaylistItems(playlistId, maxTotal = 50) {
  const endpoint = "https://www.googleapis.com/youtube/v3/playlistItems";
  let pageToken = "";
  const videoIds = [];

  while (videoIds.length < maxTotal) {
    const params = new URLSearchParams({
      key: API_KEY,
      part: "contentDetails",
      playlistId,
      maxResults: "50",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const res = await fetch(`${endpoint}?${params.toString()}`);
    if (!res.ok) throw new Error("YouTube Playlist API 오류");
    const data = await res.json();

    (data.items || []).forEach((item) => {
      const vid = item.contentDetails?.videoId;
      if (vid && videoIds.length < maxTotal) {
        videoIds.push(vid);
      }
    });

    if (!data.nextPageToken || videoIds.length >= maxTotal) break;
    pageToken = data.nextPageToken;
  }

  return videoIds;
}

// ===== 미니 플레이어 아이콘 동기화 함수 =====

function updateMiniButtonByPlayerState() {
  if (!player || !miniPlayPauseBtn || !window.YT) return;

  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    miniPlayPauseBtn.textContent = "⏸";
  } else {
    miniPlayPauseBtn.textContent = "▶";
  }
}

// ===== YouTube Iframe API 콜백 =====

function onYouTubeIframeAPIReady() {
  // 최초에는 아무것도 하지 않음 (playVideoById에서 player 생성)
}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// 플레이어 준비됐을 때: 미니 버튼 아이콘 초기화 + Media Session 메타 설정
function onPlayerReady() {
  miniPlayPauseBtn.textContent = "▶";

  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";
  }
}

// 재생 상태 변경 (다음 곡 자동재생 + MediaSession/아이콘 동기화)
function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;

  // 미니 플레이어 아이콘을 현재 상태에 맞게 갱신
  updateMiniButtonByPlayerState();

  // Media Session API 쪽 재생 상태 동기화
  if ("mediaSession" in navigator) {
    if (state === YT.PlayerState.PLAYING) {
      navigator.mediaSession.playbackState = "playing";
    } else if (state === YT.PlayerState.PAUSED) {
      navigator.mediaSession.playbackState = "paused";
    } else if (state === YT.PlayerState.ENDED) {
      navigator.mediaSession.playbackState = "none";
    }
  }

  // === 다음 곡 자동재생 ===
  if (state === YT.PlayerState.ENDED) {
    if (!currentTrackId || tracks.length === 0) return;

    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + 1;
    if (nextIndex >= tracks.length) {
      // 마지막 곡이면 멈춤
      return;
    }

    const nextTrack = tracks[nextIndex];
    playTrack(nextTrack.id);
  }
}

// ===== Firestore: 유저별 tracks 컬렉션 참조 =====

function getTracksCollectionRef(uid) {
  return collection(db, "users", uid, "tracks");
}

async function loadTracksFromFirestore() {
  if (!currentUser) return;

  const colRef = getTracksCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const list = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    list.push({
      id: docSnap.id,
      videoId: data.videoId,
      title: data.title,
      channel: data.channel,
      thumbnail: data.thumbnail,
      addedAt: data.addedAt,
    });
  });

  tracks = list.sort((a, b) => b.addedAt - a.addedAt);
}

async function addTrackToFirestore(track) {
  if (!currentUser) return;
  const colRef = getTracksCollectionRef(currentUser.uid);
  const docRef = await addDoc(colRef, track);
  return docRef.id;
}

async function deleteTrackFromFirestore(id) {
  if (!currentUser) return;
  const docRef = doc(db, "users", currentUser.uid, "tracks", id);
  await deleteDoc(docRef);
}

async function clearTracksInFirestore() {
  if (!currentUser) return;
  const colRef = getTracksCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const promises = [];
  snap.forEach((docSnap) => {
    promises.push(
      deleteDoc(doc(db, "users", currentUser.uid, "tracks", docSnap.id))
    );
  });
  await Promise.all(promises);
}

// 제목 수정 저장용
async function updateTrackTitleInFirestore(id, newTitle) {
  if (!currentUser) return;
  const trackRef = doc(db, "users", currentUser.uid, "tracks", id);
  await updateDoc(trackRef, { title: newTitle });
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

    // ===== 제목 편집 버튼 =====
    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.textContent = "편집";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "삭제";

    metaDiv.appendChild(editBtn);
    metaDiv.appendChild(delBtn);

    li.appendChild(img);
    li.appendChild(textBox);
    li.appendChild(metaDiv);

    // 리스트 전체 클릭 → 재생
    li.addEventListener("click", (e) => {
      if (e.target === delBtn || e.target === editBtn) return;
      // 연속 탭으로 인한 Safari 크래시 방지용 락
      if (playClickLock) return;
      playClickLock = true;
      setTimeout(() => {
        playClickLock = false;
      }, 400);

      playTrack(track.id);
    });

    // 삭제 버튼
    delBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await deleteTrack(track.id);
    });

    // 편집 버튼: 제목 인라인 수정
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();

      const currentTitle = track.title;
      const input = document.createElement("input");
      input.type = "text";
      input.value = currentTitle;
      input.className = "track-title-input";
      input.style.width = "100%";

      titleDiv.replaceChildren(input);
      input.focus();
      input.select();

      const finishEdit = async (save) => {
        const newTitle = input.value.trim();
        const finalTitle = save && newTitle ? newTitle : currentTitle;

        track.title = finalTitle;
        titleDiv.textContent = finalTitle;

        if (save && newTitle && newTitle !== currentTitle) {
          try {
            await updateTrackTitleInFirestore(track.id, newTitle);
            if (currentTrackId === track.id) {
              updateNowPlaying(track);
            }
          } catch (err) {
            console.error("제목 업데이트 실패:", err);
            alert("제목을 저장하는 중 오류가 발생했어요.");
            track.title = currentTitle;
            titleDiv.textContent = currentTitle;
          }
        }
      };

      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          finishEdit(true);
        } else if (ev.key === "Escape") {
          finishEdit(false);
        }
      });

      input.addEventListener("blur", () => {
        finishEdit(true);
      });
    });

    trackListEl.appendChild(li);
  });
}

function resetNowPlayingUI() {
  titleEl.textContent = "제목";
  artistEl.textContent = "아티스트";
  thumbnailEl.removeAttribute("src");

  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");
  const miniArtist = document.getElementById("miniArtist");
  if (miniThumb && miniTitle && miniArtist) {
    miniThumb.removeAttribute("src");
    miniTitle.textContent = "제목";
    miniArtist.textContent = "아티스트";
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }
}

function updateNowPlaying(track) {
  titleEl.textContent = track.title;
  artistEl.textContent = track.channel;
  thumbnailEl.src = track.thumbnail;

  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");
  const miniArtist = document.getElementById("miniArtist");
  if (miniThumb && miniTitle && miniArtist) {
    miniThumb.src = track.thumbnail;
    miniTitle.textContent = track.title;
    miniArtist.textContent = track.channel;
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.channel,
      artwork: [
        { src: track.thumbnail, sizes: "96x96", type: "image/jpeg" },
        { src: track.thumbnail, sizes: "256x256", type: "image/jpeg" },
      ],
    });
  }
}

// ===== 트랙 추가/삭제/재생 =====

// 단일 영상 URL용
async function addTrackFromUrl(url) {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    alert("유효한 YouTube 주소가 아닌 것 같아요.");
    return;
  }

  try {
    const info = await fetchVideoInfo(videoId);

    const newTrackData = {
      videoId,
      title: info.title,
      channel: info.channel,
      thumbnail: info.thumbnail,
      addedAt: Date.now(),
    };

    const docId = await addTrackToFirestore(newTrackData);

    const newTrack = {
      id: docId,
      ...newTrackData,
    };

    tracks.unshift(newTrack);
    currentTrackId = newTrack.id;
    updateNowPlaying(newTrack);
    renderTrackList();
    playVideoById(videoId);
  } catch (err) {
    console.error(err);
    alert("영상 정보를 불러오는 중 문제가 발생했어요.");
  }
}

// 플레이리스트 URL/영상 URL 모두 처리
async function addFromInputUrl(url) {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }

  const playlistId = extractPlaylistId(url);
  if (playlistId) {
    try {
      const videoIds = await fetchPlaylistItems(playlistId, 50);
      if (videoIds.length === 0) {
        alert("플레이리스트에 추가할 영상이 없습니다.");
        return;
      }

      const addedTracks = [];
      for (const vid of videoIds) {
        try {
          const info = await fetchVideoInfo(vid);
          const newTrackData = {
            videoId: vid,
            title: info.title,
            channel: info.channel,
            thumbnail: info.thumbnail,
            addedAt: Date.now(),
          };
          const docId = await addTrackToFirestore(newTrackData);
          const newTrack = { id: docId, ...newTrackData };
          tracks.push(newTrack);
          addedTracks.push(newTrack);
        } catch (e) {
          console.error("플레이리스트 영상 하나 추가 실패:", e);
        }
      }

      if (addedTracks.length > 0) {
        const firstTrack = addedTracks[0];
        currentTrackId = firstTrack.id;
        updateNowPlaying(firstTrack);
        playVideoById(firstTrack.videoId);
      }

      renderTrackList();
    } catch (err) {
      console.error(err);
      alert("플레이리스트를 불러오는 중 문제가 발생했어요.");
    }
    return;
  }

  await addTrackFromUrl(url);
}

async function deleteTrack(id) {
  await deleteTrackFromFirestore(id);

  const index = tracks.findIndex((t) => t.id === id);
  if (index === -1) return;

  tracks.splice(index, 1);

  if (currentTrackId === id) {
    currentTrackId = tracks[0]?.id || null;
    if (currentTrackId) {
      updateNowPlaying(tracks[0]);
      playVideoById(tracks[0].videoId);
    } else {
      resetNowPlayingUI();
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
        playsinline: 1,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });

    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => {
        if (!player) return;
        player.playVideo();
        updateMiniButtonByPlayerState();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        if (!player) return;
        player.pauseVideo();
        updateMiniButtonByPlayerState();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (!currentTrackId || tracks.length === 0) return;
        const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
        if (currentIndex === -1) return;
        const nextIndex = currentIndex + 1;
        if (nextIndex >= tracks.length) return;
        const nextTrack = tracks[nextIndex];
        playTrack(nextTrack.id);
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (!currentTrackId || tracks.length === 0) return;
        const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
        if (currentIndex === -1) return;
        const prevIndex = currentIndex - 1;
        if (prevIndex < 0) return;
        const prevTrack = tracks[prevIndex];
        playTrack(prevTrack.id);
      });
    }
  } else {
    player.loadVideoById(videoId);
  }
}

// ===== Google 로그인/로그아웃 =====

googleLoginButton.addEventListener("click", async () => {
  try {
    loginError.textContent = "";
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error("login error:", err.code, err.message);
    if (
      err.code === "auth/popup-blocked" ||
      err.code === "auth/popup-closed-by-user"
    ) {
      loginError.textContent =
        "팝업이 차단되었어요. 브라우저 팝업/쿠키 설정을 확인해 주세요.";
    } else {
      loginError.textContent = `로그인 오류 (${err.code}) 잠시 후 다시 시도해 주세요.`;
    }
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    alert("로그아웃 중 문제가 발생했어요.");
  }
});

// ===== 로그인 상태 감시 =====

onAuthStateChanged(auth, async (user) => {
  console.log("auth state changed:", user);

  if (user) {
    currentUser = user;
    userEmailEl.textContent = user.email || "";

    loginScreen.style.display = "none";
    mainScreen.classList.remove("hidden");

    await loadTracksFromFirestore();
    renderTrackList();

    if (tracks.length > 0) {
      const first = tracks[0];
      currentTrackId = first.id;
      updateNowPlaying(first);
    } else {
      resetNowPlayingUI();
    }
  } else {
    currentUser = null;
    tracks = [];
    currentTrackId = null;

    resetNowPlayingUI();

    loginScreen.style.display = "flex";
    mainScreen.classList.add("hidden");
    loginError.textContent = "";
  }
});

// ===== 이벤트 바인딩 =====

addButton.addEventListener("click", () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  addFromInputUrl(url);
  videoUrlInput.value = "";
});

videoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    addButton.click();
  }
});

clearListButton.addEventListener("click", async () => {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }
  if (!confirm("정말 전체 리스트를 비울까요?")) return;

  await clearTracksInFirestore();
  tracks = [];
  currentTrackId = null;
  renderTrackList();
  resetNowPlayingUI();
});

// ===== 미니 플레이어 재생/일시정지 버튼 =====

console.log("miniPlayPauseBtn:", miniPlayPauseBtn);

miniPlayPauseBtn.addEventListener("click", () => {
  if (!player || !window.YT) return;

  const state = player.getPlayerState();

  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }

  updateMiniButtonByPlayerState();
});

// ===== iOS 확대 방지 =====

document.addEventListener("gesturestart", function (e) {
  e.preventDefault();
});

if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.scale && e.scale !== 1) {
        e.preventDefault();
      }
    },
    { passive: false }
  );

  let lastTouchEnd = 0;
  document.addEventListener(
    "touchend",
    function (e) {
      const now = Date.now();
      if (now - lastTouchEnd <= 300) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}
