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
  updateDoc,
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

const API_KEY = "AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4";

let currentUser = null;
let player = null;
// { id, videoId, title, channel, thumbnail, customThumbnail?, addedAt, albumId? }
let tracks = [];
let currentTrackId = null;

let albums = []; // { id, name, createdAt } 앨범 리스트


let playClickLock = false;

// ===== DOM 참조 =====
const miniPlayPauseBtn = document.getElementById("miniPlayPauseBtn");

const loginScreen = document.getElementById("login-screen");
const googleLoginButton = document.getElementById("googleLoginButton");
const loginError = document.getElementById("loginError");

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
const changeCoverBtn = document.getElementById("changeCoverBtn");

// 커버 바텀 시트 요소 (JS에서 생성)
let coverSheetBackdrop = null;
let coverSheetInput = null;
let coverSheetSaveBtn = null;
let coverSheetCancelBtn = null;

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

// ===== Data API =====

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

// ===== 플레이어 상태 =====

function updateMiniButtonByPlayerState() {
  if (!player || !miniPlayPauseBtn || !window.YT) return;

  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    miniPlayPauseBtn.textContent = "⏸";
  } else {
    miniPlayPauseBtn.textContent = "▶";
  }
}

function onYouTubeIframeAPIReady() {}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function onPlayerReady() {
  miniPlayPauseBtn.textContent = "▶";
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";
  }
}

function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;

  updateMiniButtonByPlayerState();

  if ("mediaSession" in navigator) {
    if (state === YT.PlayerState.PLAYING) {
      navigator.mediaSession.playbackState = "playing";
    } else if (state === YT.PlayerState.PAUSED) {
      navigator.mediaSession.playbackState = "paused";
    } else if (state === YT.PlayerState.ENDED) {
      navigator.mediaSession.playbackState = "none";
    }
  }

  if (state === YT.PlayerState.ENDED) {
    if (!currentTrackId || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= tracks.length) return;
    const nextTrack = tracks[nextIndex];
    playTrack(nextTrack.id);
  }
}

// ===== Firestore =====

function getTracksCollectionRef(uid) {
  return collection(db, "users", uid, "tracks");
}

// ✅ 앨범 컬렉션
function getAlbumsCollectionRef(uid) {
  return collection(db, "users", uid, "albums");
}

async function loadAlbumsFromFirestore() {
  if (!currentUser) return;

  const colRef = getAlbumsCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const list = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    list.push({
      id: docSnap.id,
      name: data.name,
      createdAt: data.createdAt,
    });
  });

  albums = list.sort((a, b) => a.name.localeCompare(b.name));
}

async function addAlbumToFirestore(name) {
  if (!currentUser) return null;
  const colRef = getAlbumsCollectionRef(currentUser.uid);
  const createdAt = Date.now();
  const docRef = await addDoc(colRef, { name, createdAt });
  const album = { id: docRef.id, name, createdAt };
  albums.push(album);
  return album;
}

async function updateTrackAlbumInFirestore(id, albumId) {
  if (!currentUser) return;
  const trackRef = doc(db, "users", currentUser.uid, "tracks", id);
  await updateDoc(trackRef, { albumId });
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
      customThumbnail: data.customThumbnail || null,
      addedAt: data.addedAt,
      albumId: data.albumId || null,   // ✅ 이 줄 추가
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

async function updateTrackTitleInFirestore(id, newTitle) {
  if (!currentUser) return;
  const trackRef = doc(db, "users", currentUser.uid, "tracks", id);
  await updateDoc(trackRef, { title: newTitle });
}

async function updateTrackCustomThumbnailInFirestore(id, url) {
  if (!currentUser) return;
  const trackRef = doc(db, "users", currentUser.uid, "tracks", id);
  await updateDoc(trackRef, { customThumbnail: url });
}


// ===== UI 렌더링 =====

// albumId 기준으로 트랙을 나누는 헬퍼
function splitTracksByAlbum() {
  const mainTracks = [];
  const albumTrackMap = {}; // { albumId: [tracks...] }

  tracks.forEach((t) => {
    if (!t.albumId) {
      mainTracks.push(t);
    } else {
      if (!albumTrackMap[t.albumId]) {
        albumTrackMap[t.albumId] = [];
      }
      albumTrackMap[t.albumId].push(t);
    }
  });

  return { mainTracks, albumTrackMap };
}

// 공통: 트랙 하나(li) 렌더링
function createTrackListItem(track) {
  const li = document.createElement("li");
  li.className = "track-item";
  li.dataset.trackId = track.id;

  if (track.id === currentTrackId) {
    li.classList.add("active");
  }

  const img = document.createElement("img");
  img.className = "track-item-thumb";
  const listThumbUrl = track.customThumbnail || track.thumbnail;
  img.src = listThumbUrl;
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

  const menuBtn = document.createElement("button");
  menuBtn.className = "track-menu-btn";
  menuBtn.type = "button";
  menuBtn.setAttribute("aria-label", "트랙 메뉴");
  menuBtn.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "track-menu";

  const renameItem = document.createElement("button");
  renameItem.className = "track-menu-item";
  renameItem.type = "button";
  renameItem.textContent = "Rename title";

  const changeCoverItem = document.createElement("button");
  changeCoverItem.className = "track-menu-item";
  changeCoverItem.type = "button";
  changeCoverItem.textContent = "Change cover image";

  // 🔽 추가된 부분
  const moveToAlbumItem = document.createElement("button");
  moveToAlbumItem.className = "track-menu-item";
  moveToAlbumItem.type = "button";
  moveToAlbumItem.textContent = "Move to album";

  const removeFromAlbumItem = document.createElement("button");
  removeFromAlbumItem.className = "track-menu-item";
  removeFromAlbumItem.type = "button";
  removeFromAlbumItem.textContent = "Remove from album";

  const removeItem = document.createElement("button");
  removeItem.className = "track-menu-item danger";
  removeItem.type = "button";
  removeItem.textContent = "Remove from playlist";

  menu.appendChild(renameItem);
  menu.appendChild(changeCoverItem);
  menu.appendChild(moveToAlbumItem);
  menu.appendChild(removeFromAlbumItem);
  menu.appendChild(removeItem);


  metaDiv.appendChild(menuBtn);
  metaDiv.appendChild(menu);

  li.appendChild(img);
  li.appendChild(textBox);
  li.appendChild(metaDiv);

  // 트랙 클릭 → 재생
  li.addEventListener("click", (e) => {
    if (
      e.target === menuBtn ||
      e.target === renameItem ||
      e.target === changeCoverItem ||
      e.target === moveToAlbumItem ||
      e.target === removeFromAlbumItem ||
      e.target === removeItem
    )
      return;

    if (playClickLock) return;
    playClickLock = true;
    setTimeout(() => {
      playClickLock = false;
    }, 400);

    playTrack(track.id);
  });

  // ... 버튼 클릭 → 메뉴 토글
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.contains("open");
    closeAllTrackMenus();
    if (!isOpen) {
      menu.classList.add("open");
    }
  });

  // Rename title
  renameItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();

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

  // Change cover image
  changeCoverItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();

    const currentUrl = track.customThumbnail || track.thumbnail || "";
    showCoverSheetForTrack(track, currentUrl);
  });

  // Remove from playlist
  removeItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();

    showDeleteConfirm(async () => {
      await deleteTrack(track.id);
    });
  });

  return li;
}

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

  document.removeEventListener("click", handleGlobalMenuClose);
  document.addEventListener("click", handleGlobalMenuClose);

  const { mainTracks, albumTrackMap } = splitTracksByAlbum();

  // 메인 리스트 섹션
  const mainSection = document.createElement("div");
  mainSection.className = "album-section";

  const mainHeader = document.createElement("div");
  mainHeader.className = "album-header";
  mainHeader.textContent = "Main list";

  const mainUl = document.createElement("ul");
  mainUl.className = "album-track-list";

  mainTracks.forEach((track) => {
    const li = createTrackListItem(track);
    mainUl.appendChild(li);
  });

  mainSection.appendChild(mainHeader);
  mainSection.appendChild(mainUl);
  trackListEl.appendChild(mainSection);

  // 🔽🔽 여기부터: 앨범 섹션들 렌더링 🔽🔽

  // albums 배열을 이름 순으로 한 번 더 정렬(혹시 로딩 시점에서 변경됐을 수 있으니)
  const sortedAlbums = [...albums].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  sortedAlbums.forEach((album) => {
    const albumTracks = albumTrackMap[album.id] || [];
    if (albumTracks.length === 0) return; // 이 앨범에 속한 트랙이 없으면 스킵

    const section = document.createElement("div");
    section.className = "album-section";

    const header = document.createElement("div");
    header.className = "album-header";
    header.textContent = album.name;

    const ul = document.createElement("ul");
    ul.className = "album-track-list";

    albumTracks.forEach((track) => {
      const li = createTrackListItem(track);
      ul.appendChild(li);
    });

    section.appendChild(header);
    section.appendChild(ul);
    trackListEl.appendChild(section);
  });
}
}


// 삭제 확인 모달
function showDeleteConfirm(onYes) {
  let backdrop = document.querySelector(".delete-confirm-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "delete-confirm-backdrop";

    const dialog = document.createElement("div");
    dialog.className = "delete-confirm-dialog";

    const msg = document.createElement("p");
    msg.className = "delete-confirm-message";
    msg.textContent = "이 트랙을 플레이리스트에서 삭제할까요?";

    const actions = document.createElement("div");
    actions.className = "delete-confirm-actions";

    const noBtn = document.createElement("button");
    noBtn.className = "delete-confirm-btn no";
    noBtn.textContent = "No";

    const yesBtn = document.createElement("button");
    yesBtn.className = "delete-confirm-btn yes";
    yesBtn.textContent = "Yes";

    actions.appendChild(noBtn);
    actions.appendChild(yesBtn);
    dialog.appendChild(msg);
    dialog.appendChild(actions);
    backdrop.appendChild(dialog);
    document.body.appendChild(backdrop);
  }

  const yesBtn = backdrop.querySelector(".delete-confirm-btn.yes");
  const noBtn = backdrop.querySelector(".delete-confirm-btn.no");

  const close = () => {
    backdrop.classList.remove("show");
    yesBtn.removeEventListener("click", handleYes);
    noBtn.removeEventListener("click", handleNo);
    backdrop.removeEventListener("click", handleBackdrop);
    document.removeEventListener("keydown", handleKeydown);
  };

  const handleYes = () => {
    onYes();
    close();
  };

  const handleNo = () => {
    close();
  };

  const handleBackdrop = (e) => {
    if (e.target === backdrop) {
      close();
    }
  };

  const handleKeydown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  yesBtn.addEventListener("click", handleYes);
  noBtn.addEventListener("click", handleNo);
  backdrop.addEventListener("click", handleBackdrop);
  document.addEventListener("keydown", handleKeydown);

  backdrop.classList.add("show");
}

// 전역 메뉴 닫기 핸들러
function handleGlobalMenuClose() {
  closeAllTrackMenus();
}

function closeAllTrackMenus() {
  const menus = document.querySelectorAll(".track-menu.open");
  menus.forEach((m) => m.classList.remove("open"));
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
  const coverUrl = track.customThumbnail || track.thumbnail;

  titleEl.textContent = track.title;
  artistEl.textContent = track.channel;
  if (coverUrl) {
    thumbnailEl.src = coverUrl;
  } else {
    thumbnailEl.removeAttribute("src");
  }

  const miniThumb = document.getElementById("miniThumb");
  const miniTitle = document.getElementById("miniTitle");
  const miniArtist = document.getElementById("miniArtist");
  if (miniThumb && miniTitle && miniArtist) {
    if (coverUrl) {
      miniThumb.src = coverUrl;
    } else {
      miniThumb.removeAttribute("src");
    }
    miniTitle.textContent = track.title;
    miniArtist.textContent = track.channel;
  }

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.channel,
      artwork: coverUrl
        ? [
            { src: coverUrl, sizes: "96x96", type: "image/jpeg" },
            { src: coverUrl, sizes: "256x256", type: "image/jpeg" },
          ]
        : [],
    });
  }
}

// ===== 트랙 추가/삭제/재생 =====

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
  customThumbnail: null,
  addedAt: Date.now(),
  albumId: null,             // ✅ 기본값
};

    const docId = await addTrackToFirestore(newTrackData);
    const newTrack = { id: docId, ...newTrackData };

    tracks.unshift(newTrack);
    currentTrackId = newTrack.id;
    updateNowPlaying(newTrack);
    renderTrackList();
  } catch (err) {
    console.error(err);
    alert("영상 정보를 불러오는 중 문제가 발생했어요.");
  }
}

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
  customThumbnail: null,
  addedAt: Date.now(),
  albumId: null,             // ✅ 기본값
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

 // ✅ 일단 주석 처리해서 에러를 막는다
    // await loadAlbumsFromFirestore();
    
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

// ===== 상단/트랙 커버 변경용 바텀 시트 =====

function ensureCoverSheet() {
  if (coverSheetBackdrop) return;

  coverSheetBackdrop = document.createElement("div");
  coverSheetBackdrop.className = "cover-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "cover-sheet";

  const title = document.createElement("p");
  title.className = "cover-sheet-title";
  title.textContent = "커버 이미지 링크 변경";

  const desc = document.createElement("p");
  desc.className = "cover-sheet-desc";
  desc.textContent =
    "이미지 주소를 직접 넣어서 커버를 바꿀 수 있어요. 비워서 저장하면 원래 썸네일로 돌아갑니다.";

  coverSheetInput = document.createElement("input");
  coverSheetInput.type = "text";
  coverSheetInput.className = "cover-sheet-input";
  coverSheetInput.placeholder = "https://example.com/cover.jpg";

  const actions = document.createElement("div");
  actions.className = "cover-sheet-actions";

  coverSheetCancelBtn = document.createElement("button");
  coverSheetCancelBtn.className = "cover-sheet-btn cancel";
  coverSheetCancelBtn.textContent = "취소";

  coverSheetSaveBtn = document.createElement("button");
  coverSheetSaveBtn.className = "cover-sheet-btn save";
  coverSheetSaveBtn.textContent = "저장";

  actions.appendChild(coverSheetCancelBtn);
  actions.appendChild(coverSheetSaveBtn);

  sheet.appendChild(title);
  sheet.appendChild(desc);
  sheet.appendChild(coverSheetInput);
  sheet.appendChild(actions);

  coverSheetBackdrop.appendChild(sheet);
  document.body.appendChild(coverSheetBackdrop);

  coverSheetCancelBtn.addEventListener("click", () => {
    hideCoverSheet();
  });

  coverSheetBackdrop.addEventListener("click", (e) => {
    if (e.target === coverSheetBackdrop) {
      hideCoverSheet();
    }
  });
}

function showCoverSheet(currentUrl) {
  ensureCoverSheet();
  coverSheetInput.value = currentUrl || "";
  coverSheetBackdrop.classList.add("show");
  coverSheetInput.focus();
  coverSheetInput.select();
}

function hideCoverSheet() {
  if (!coverSheetBackdrop) return;
  coverSheetBackdrop.classList.remove("show");
}

// 특정 트랙 기준으로 커버 바꾸기
function showCoverSheetForTrack(track, currentUrl) {
  showCoverSheet(currentUrl);

  const handleSave = async () => {
    const trimmed = coverSheetInput.value.trim();
    const newCustom = trimmed || null;

    try {
      await updateTrackCustomThumbnailInFirestore(track.id, newCustom);
      track.customThumbnail = newCustom;
      updateNowPlaying(track);
      renderTrackList();
    } catch (err) {
      console.error("커버 이미지 업데이트 실패:", err);
      alert("커버 이미지를 저장하는 중 오류가 발생했어요.");
    } finally {
      hideCoverSheet();
      coverSheetSaveBtn.removeEventListener("click", handleSave);
      coverSheetInput.removeEventListener("keydown", handleKeydown);
    }
  };

  const handleKeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      hideCoverSheet();
      coverSheetSaveBtn.removeEventListener("click", handleSave);
      coverSheetInput.removeEventListener("keydown", handleKeydown);
    }
  };

  coverSheetSaveBtn.addEventListener("click", handleSave);
  coverSheetInput.addEventListener("keydown", handleKeydown);
}

// 상단 커버 버튼 → 현재 트랙 기준으로 호출
if (changeCoverBtn) {
  changeCoverBtn.addEventListener("click", () => {
    if (!currentTrackId) {
      alert("먼저 재생할 곡을 선택해 주세요.");
      return;
    }
    const track = tracks.find((t) => t.id === currentTrackId);
    if (!track) return;

    const currentUrl = track.customThumbnail || track.thumbnail || "";
    showCoverSheetForTrack(track, currentUrl);
  });
}

// ===== 미니 플레이어 재생/일시정지 버튼 =====

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
