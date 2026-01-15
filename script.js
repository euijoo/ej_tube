let openAlbumIds = new Set();
let currentAlbumId = null; // ✅ 현재 선택된 앨범 ID

// ✅ 초기 랜덤 메인 커버 후보들
const INITIAL_MAIN_COVERS = [
  "https://i.pinimg.com/736x/fc/e2/09/fce209249135d840c6ebdcb983b97460.jpg",
  "https://i.pinimg.com/1200x/20/47/fc/2047fc8e641fbb71277f83674ae76fc8.jpg",
  "https://i.pinimg.com/736x/7d/35/c6/7d35c6c1372bb2b173f2fac5b586fd03.jpg",
  "https://i.pinimg.com/736x/ae/72/61/ae7261114527edf8911671b8ab675c74.jpg",
  "https://i.pinimg.com/1200x/b0/73/55/b073552d1d7489afece8ed0d995be0aa.jpg",
  "https://i.pinimg.com/736x/20/0d/81/200d81cff058a26241923b34cf986151.jpg",
  "https://i.pinimg.com/1200x/12/6e/9a/126e9a7ba3d432c47d11cefc396e282f.jpg",
  "https://i.pinimg.com/1200x/0f/30/10/0f301026ac51c0c5a57bae244ca87a5e.jpg",
  "https://i.pinimg.com/736x/41/d8/95/41d8958cf55017f31e44e89b8864e630.jpg",
  "https://i.pinimg.com/736x/ba/48/21/ba48216b2877caa1de692ba7c80c6a6d.jpg",
];

// ✅ 상단 커버 + 미니플레이어를 함께 초기화
function setRandomMainCover() {
  if (!thumbnailEl) return;
  if (!INITIAL_MAIN_COVERS.length) return;

  const idx = Math.floor(Math.random() * INITIAL_MAIN_COVERS.length);
  const url = INITIAL_MAIN_COVERS[idx];

  // 상단 메인 커버
  thumbnailEl.src = url;
  if (titleEl) titleEl.textContent = "Welcome";
  // 상단 채널 문구는 사용 안 함

  // 미니 플레이어 동기화
  const miniThumbNew = document.getElementById("miniThumbNew");
  const miniTitleNew = document.getElementById("miniTitleNew");
  const miniArtistNew = document.getElementById("miniArtistNew");
  const playPauseIcon = document.getElementById("miniPlayPauseIcon");
  const currentEl = document.getElementById("miniCurrentTime");
  const totalEl = document.getElementById("miniTotalTime");
  const fillEl = document.getElementById("miniProgressFill");

  if (miniThumbNew) miniThumbNew.src = url;
  if (miniTitleNew) {
    miniTitleNew.textContent = "Welcome";
    miniTitleNew.classList.remove("marquee-on");
    miniTitleNew.style.removeProperty("--mini-title-offset");
  }
  if (miniArtistNew) miniArtistNew.textContent = "Select album or track";

  if (playPauseIcon) playPauseIcon.textContent = "▶";
  if (currentEl) currentEl.textContent = "00:00";
  if (totalEl) totalEl.textContent = "00:00";
  if (fillEl) fillEl.style.width = "0%";
}

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

const API_KEY = "AIzaSyBysIkRsY2eIwHAqv2oSA8uh6XLiBvXtQ4";

let currentUser = null;
let player = null;
let tracks = [];
let currentTrackId = null;
let albums = [];
let playClickLock = false;

const loginScreen = document.getElementById("login-screen");
const googleLoginButton = document.getElementById("googleLoginButton");
const loginError = document.getElementById("loginError");
const mainScreen = document.getElementById("main-screen");
// 상단바 관련: 별도 Logout 버튼은 사용 안 함
// const logoutButton = document.getElementById("logoutButton");
const userAvatarEl = document.getElementById("userAvatar");
const userNickEl = document.getElementById("userNick");
const appLogoButton = document.getElementById("appLogoButton");

const addButton = document.getElementById("addButton");
const videoUrlInput = document.getElementById("videoUrl");
// 전체 비우기 버튼은 제거 버전
// const clearListButton = document.getElementById("clearListButton");
const trackListEl = document.getElementById("trackList");
const titleEl = document.getElementById("title");
const artistEl = document.getElementById("artist");
const thumbnailEl = document.getElementById("thumbnail");
const changeCoverBtn = document.getElementById("changeCoverBtn");
const titleEditBtn = document.getElementById("titleEditBtn");

let coverSheetBackdrop = null;
let coverSheetInput = null;
let coverSheetSaveBtn = null;
let coverSheetCancelBtn = null;
let albumSheetBackdrop = null;
let albumSheetDialog = null;

// ========= 유틸 =========
function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const paths = u.pathname.split("/");
    return paths.pop() || paths.pop();
  } catch (e) {
    return null;
  }
}

function extractPlaylistId(url) {
  try {
    const u = new URL(url);
    return u.searchParams.get("list") || null;
  } catch (e) {
    return null;
  }
}

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
  if (!data.items || data.items.length === 0)
    throw new Error("영상 정보를 찾을 수 없음");

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
      if (vid && videoIds.length < maxTotal) videoIds.push(vid);
    });

    if (!data.nextPageToken || videoIds.length >= maxTotal) break;
    pageToken = data.nextPageToken;
  }

  return videoIds;
}

// ========= YouTube Iframe API =========
function onYouTubeIframeAPIReady() {}
window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

function onPlayerReady() {
  const playPauseIcon = document.getElementById("miniPlayPauseIcon");
  if (playPauseIcon) {
    playPauseIcon.textContent = "▶";
  }

  updateNewMiniPlayer();
  if ("mediaSession" in navigator) {
    navigator.mediaSession.playbackState = "none";
  }
}

function onPlayerStateChange(event) {
  if (!window.YT) return;
  const state = event.data;

  updateNewMiniPlayer();

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
    playTrack(tracks[nextIndex].id);
  }

  updatePlayingIndicator();
}

// ========= Firestore 헬퍼 =========
function getTracksCollectionRef(uid) {
  return collection(db, "users", uid, "tracks");
}

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
      coverUrl: data.coverUrl || null,
    });
  });
  albums = list.sort((a, b) => a.name.localeCompare(b.name));
}

async function addAlbumToFirestore(name) {
  if (!currentUser) return null;
  const colRef = getAlbumsCollectionRef(currentUser.uid);
  const createdAt = Date.now();
  const docRef = await addDoc(colRef, { name, createdAt, coverUrl: null });
  const album = { id: docRef.id, name, createdAt, coverUrl: null };
  albums.push(album);
  return album;
}

async function updateTrackAlbumInFirestore(id, albumId) {
  if (!currentUser) return;
  const trackRef = doc(db, "users", currentUser.uid, "tracks", id);
  await updateDoc(trackRef, { albumId });
}

// 앨범 이름 변경
async function renameAlbumInFirestore(albumId, newName) {
  if (!currentUser) return;
  const albumRef = doc(db, "users", currentUser.uid, "albums", albumId);
  await updateDoc(albumRef, { name: newName });
}

// 앨범 커버 변경
async function updateAlbumCoverInFirestore(albumId, coverUrl) {
  if (!currentUser) return;
  const albumRef = doc(db, "users", currentUser.uid, "albums", albumId);
  await updateDoc(albumRef, { coverUrl });
}

// 앨범 삭제 (앨범 문서 삭제 + 해당 트랙들 albumId 제거)
async function deleteAlbumInFirestore(albumId) {
  if (!currentUser) return;

  const albumRef = doc(db, "users", currentUser.uid, "albums", albumId);
  await deleteDoc(albumRef);

  const colRef = getTracksCollectionRef(currentUser.uid);
  const snap = await getDocs(colRef);
  const updates = [];
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.albumId === albumId) {
      updates.push(
        updateDoc(doc(db, "users", currentUser.uid, "tracks", docSnap.id), {
          albumId: null,
        })
      );
    }
  });
  await Promise.all(updates);
}

// 트랙을 앨범으로 이동 (새 앨범 생성 포함)
async function moveTrackToAlbum(track, targetAlbumIdOrNull, newAlbumName) {
  if (!currentUser) {
    alert("먼저 Google 계정으로 로그인해 주세요.");
    return;
  }
  if (!track) return;

  try {
    let targetAlbumId = targetAlbumIdOrNull;

    if (!targetAlbumId && newAlbumName) {
      const name = newAlbumName.trim();
      if (!name) {
        await updateTrackAlbumInFirestore(track.id, null);
        track.albumId = null;
        renderTrackList();
        return;
      }

      let album = albums.find(
        (a) => a.name.toLowerCase() === name.toLowerCase()
      );
      if (!album) {
        album = await addAlbumToFirestore(name);
      }
      targetAlbumId = album.id;
    }

    await updateTrackAlbumInFirestore(track.id, targetAlbumId || null);
    track.albumId = targetAlbumId || null;
    renderTrackList();
  } catch (err) {
    alert("앨범으로 이동하는 중 오류가 발생했어요.");
  }
}

// 앨범 이름 변경 + 로컬 배열/화면 반영
async function renameAlbum(album, newName) {
  const name = (newName || "").trim();
  if (!name) return;
  try {
    await renameAlbumInFirestore(album.id, name);
    album.name = name;
    const idx = albums.findIndex((a) => a.id === album.id);
    if (idx !== -1) albums[idx].name = name;
    renderTrackList();
  } catch (err) {
    alert("앨범 이름을 변경하는 중 오류가 발생했어요.");
  }
}

// 앨범 삭제 + 로컬 반영
async function deleteAlbum(album) {
  try {
    await deleteAlbumInFirestore(album.id);

    albums = albums.filter((a) => a.id !== album.id);

    tracks.forEach((t) => {
      if (t.albumId === album.id) {
        t.albumId = null;
      }
    });

    if (currentAlbumId === album.id) {
      currentAlbumId = null;
      resetNowPlayingUI();
    }

    renderTrackList();
  } catch (err) {
    alert("앨범을 삭제하는 중 오류가 발생했어요.");
  }
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
      albumId: data.albumId || null,
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

// ========= 트랙/앨범 분리 =========
function splitTracksByAlbum() {
  const mainTracks = [];
  const albumTrackMap = {};
  tracks.forEach((t) => {
    if (!t.albumId) {
      mainTracks.push(t);
    } else {
      if (!albumTrackMap[t.albumId]) albumTrackMap[t.albumId] = [];
      albumTrackMap[t.albumId].push(t);
    }
  });
  return { mainTracks, albumTrackMap };
}

// 리스트 클릭은 선택만, 재생은 미니 플레이어 버튼
function createTrackListItem(track) {
  const li = document.createElement("li");
  li.className = "track-item";
  li.dataset.trackId = track.id;
  if (track.id === currentTrackId) li.classList.add("active");

  const img = document.createElement("img");
  img.className = "track-item-thumb";
  img.src = track.customThumbnail || track.thumbnail;
  img.alt = track.title;

  const textBox = document.createElement("div");
  textBox.className = "track-item-text";

  const titleDiv = document.createElement("div");
  titleDiv.className = "track-item-title";
  titleDiv.textContent = track.title;

  textBox.appendChild(titleDiv);

  const metaDiv = document.createElement("div");
  metaDiv.className = "track-item-meta";

  const menuBtn = document.createElement("button");
  menuBtn.className = "track-menu-btn";
  menuBtn.type = "button";
  menuBtn.textContent = "⋯";

  const menu = document.createElement("div");
  menu.className = "track-menu";

  const changeCoverItem = document.createElement("button");
  changeCoverItem.className = "track-menu-item";
  changeCoverItem.textContent = "Change cover image";

  const moveToAlbumItem = document.createElement("button");
  moveToAlbumItem.className = "track-menu-item";
  moveToAlbumItem.textContent = "Move to album";

  const removeFromAlbumItem = document.createElement("button");
  removeFromAlbumItem.className = "track-menu-item";
  removeFromAlbumItem.textContent = "Remove from album";

  const removeItem = document.createElement("button");
  removeItem.className = "track-menu-item danger";
  removeItem.textContent = "Remove from playlist";

  menu.appendChild(changeCoverItem);
  menu.appendChild(moveToAlbumItem);
  menu.appendChild(removeFromAlbumItem);
  menu.appendChild(removeItem);

  metaDiv.appendChild(menuBtn);
  metaDiv.appendChild(menu);

  li.appendChild(img);
  li.appendChild(textBox);
  li.appendChild(metaDiv);

  li.addEventListener("click", (e) => {
    if (
      e.target === menuBtn ||
      e.target === changeCoverItem ||
      e.target === moveToAlbumItem ||
      e.target === removeFromAlbumItem ||
      e.target === removeItem
    )
      return;

    if (playClickLock) return;
    playClickLock = true;
    setTimeout(() => (playClickLock = false), 400);

    document.querySelectorAll(".track-item.active").forEach((item) => {
      item.classList.remove("active");
    });
    li.classList.add("active");
    currentTrackId = track.id;
    currentAlbumId = track.albumId || null; // ✅ 트랙 선택 시 앨범도 동기화
    updateNowPlaying(track);
  });

  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const isOpen = menu.classList.contains("open");
    closeAllTrackMenus();

    if (!isOpen) {
      menu.classList.remove("open-up");

      menu.style.visibility = "hidden";
      menu.classList.add("open");

      const rect = menu.getBoundingClientRect();
      const menuHeight = rect.height || 180;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
        menu.classList.add("open-up");
      }

      menu.style.visibility = "";
    }
  });

  changeCoverItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();
    showCoverSheetForTrack(
      track,
      track.customThumbnail || track.thumbnail || ""
    );
  });

  moveToAlbumItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();

    if (!currentUser) {
      alert("먼저 Google 계정으로 로그인해 주세요.");
      return;
    }

    showAlbumSelectSheet(track);
  });

  removeFromAlbumItem.addEventListener("click", async (e) => {
    e.stopPropagation();
    closeAllTrackMenus();
    if (!track.albumId) return;

    try {
      await updateTrackAlbumInFirestore(track.id, null);
      track.albumId = null;
      if (currentTrackId === track.id) currentAlbumId = null;
      renderTrackList();
    } catch (err) {
      alert("앨범에서 빼는 중 오류가 발생했어요.");
    }
  });

  removeItem.addEventListener("click", (e) => {
    e.stopPropagation();
    closeAllTrackMenus();
    showDeleteConfirm(async () => await deleteTrack(track.id));
  });

  return li;
}

function createAlbumItem(album, albumTracks) {
  const wrapper = document.createElement("li");
  wrapper.className = "album-item-wrapper";
  wrapper.dataset.albumId = album.id;

  const header = document.createElement("div");
  header.className = "album-item-header";

  const thumb = document.createElement("img");
  thumb.className = "album-item-thumb";
  const firstTrack = albumTracks[0] || null;
  const thumbSrc =
    album.coverUrl ||
    firstTrack?.customThumbnail ||
    firstTrack?.thumbnail ||
    thumbnailEl.src ||
    "";
  if (thumbSrc) thumb.src = thumbSrc;
  thumb.alt = album.name;

  const meta = document.createElement("div");
  meta.className = "album-item-meta";

  const nameEl = document.createElement("div");
  nameEl.className = "album-item-name";
  nameEl.textContent = album.name;

  const countEl = document.createElement("div");
  countEl.className = "album-item-count";
  countEl.textContent = `${albumTracks.length} tracks`;

  meta.appendChild(nameEl);
  meta.appendChild(countEl);

  const albumMenuBtn = document.createElement("button");
  albumMenuBtn.className = "album-menu-btn";
  albumMenuBtn.type = "button";
  albumMenuBtn.textContent = "⋯";

  const albumMenu = document.createElement("div");
  albumMenu.className = "album-menu";

  const changeCoverAlbumItem = document.createElement("button");
  changeCoverAlbumItem.className = "album-menu-item";
  changeCoverAlbumItem.textContent = "Change cover image";

  const renameItem = document.createElement("button");
  renameItem.className = "album-menu-item";
  renameItem.textContent = "Rename album";

  const deleteItem = document.createElement("button");
  deleteItem.className = "album-menu-item danger";
  deleteItem.textContent = "Delete album";

  albumMenu.appendChild(changeCoverAlbumItem);
  albumMenu.appendChild(renameItem);
  albumMenu.appendChild(deleteItem);

  const rightBox = document.createElement("div");
  rightBox.className = "album-header-right";
  rightBox.appendChild(albumMenuBtn);
  rightBox.appendChild(albumMenu);

  const toggleBtn = document.createElement("button");
  toggleBtn.className = "album-item-toggle";
  toggleBtn.type = "button";
  toggleBtn.textContent = "▾";

  rightBox.appendChild(toggleBtn);

  header.appendChild(thumb);
  header.appendChild(meta);
  header.appendChild(rightBox);

  const collapsible = document.createElement("ul");
  collapsible.className = "album-track-list-collapsible";

  albumTracks.forEach((track) => {
    const li = createTrackListItem(track);
    collapsible.appendChild(li);
  });

  if (openAlbumIds.has(album.id)) {
    wrapper.classList.add("open");
    collapsible.style.maxHeight = collapsible.scrollHeight + "px";
    toggleBtn.textContent = "▴";
  } else {
    wrapper.classList.remove("open");
    collapsible.style.maxHeight = "0px";
    toggleBtn.textContent = "▾";
  }

  const toggle = () => {
    const isOpen = wrapper.classList.contains("open");
    if (isOpen) {
      wrapper.classList.remove("open");
      openAlbumIds.delete(album.id);
      collapsible.style.maxHeight = "0px";
      toggleBtn.textContent = "▾";
    } else {
      wrapper.classList.add("open");
      openAlbumIds.add(album.id);
      collapsible.style.maxHeight = collapsible.scrollHeight + "px";
      toggleBtn.textContent = "▴";
    }
  };

  header.addEventListener("click", (e) => {
    if (
      e.target === albumMenuBtn ||
      e.target === renameItem ||
      e.target === deleteItem ||
      e.target === changeCoverAlbumItem
    ) {
      return;
    }

    const firstTrackLocal = albumTracks[0] || null;
    const cover =
      album.coverUrl ||
      firstTrackLocal?.customThumbnail ||
      firstTrackLocal?.thumbnail ||
      thumbnailEl.src ||
      "";

    if (cover) {
      thumbnailEl.src = cover;
    } else {
      thumbnailEl.removeAttribute("src");
    }

    if (titleEl) titleEl.textContent = album.name;
    // 상단 artistEl은 사용 안 함

    currentAlbumId = album.id; // ✅ 현재 앨범 설정
    toggle();
  });

  albumMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();

    const isOpen = albumMenu.classList.contains("open");
    closeAllTrackMenus();
    document
      .querySelectorAll(".album-menu.open")
      .forEach((m) => m.classList.remove("open", "open-up"));

    if (!isOpen) {
      albumMenu.classList.remove("open-up");

      albumMenu.style.visibility = "hidden";
      albumMenu.classList.add("open");

      const rect = albumMenu.getBoundingClientRect();
      const menuHeight = rect.height || 120;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
        albumMenu.classList.add("open-up");
      }

      albumMenu.style.visibility = "";
    } else {
      albumMenu.classList.remove("open", "open-up");
    }
  });

  // 앨범 커버 전용 변경 (트랙에는 영향 없음)
  changeCoverAlbumItem.addEventListener("click", (e) => {
    e.stopPropagation();
    albumMenu.classList.remove("open", "open-up");

    const firstTrackLocal = albumTracks[0] || null;
    const currentCover =
      album.coverUrl ||
      firstTrackLocal?.customThumbnail ||
      firstTrackLocal?.thumbnail ||
      thumbnailEl.src ||
      "";

    showCoverSheet(currentCover);

    const handleSave = async () => {
      const trimmed = coverSheetInput.value.trim();
      const newCover = trimmed || null;

      try {
        await updateAlbumCoverInFirestore(album.id, newCover);
        album.coverUrl = newCover;

        if (currentAlbumId === album.id) {
          if (newCover) {
            thumbnailEl.src = newCover;
          } else if (firstTrackLocal?.thumbnail) {
            thumbnailEl.src =
              firstTrackLocal.customThumbnail || firstTrackLocal.thumbnail;
          } else {
            thumbnailEl.removeAttribute("src");
          }
        }

        renderTrackList();
      } catch (err) {
        alert("앨범 커버를 변경하는 중 오류가 발생했어요.");
      } finally {
        hideCoverSheet();
        coverSheetSaveBtn.removeEventListener("click", handleSave);
        coverSheetInput.removeEventListener("keydown", handleKeydown);
      }
    };

    const handleKeydown = (e2) => {
      if (e2.key === "Enter") {
        e2.preventDefault();
        handleSave();
      } else if (e2.key === "Escape") {
        e2.preventDefault();
        hideCoverSheet();
        coverSheetSaveBtn.removeEventListener("click", handleSave);
        coverSheetInput.removeEventListener("keydown", handleKeydown);
      }
    };

    coverSheetSaveBtn.addEventListener("click", handleSave);
    coverSheetInput.addEventListener("keydown", handleKeydown);
  });

  renameItem.addEventListener("click", async (e) => {
    e.stopPropagation();
    albumMenu.classList.remove("open", "open-up");

    const input = prompt("새 앨범 이름을 입력하세요.", album.name);
    if (input === null) return;
    const name = input.trim();
    if (!name || name === album.name) return;

    await renameAlbum(album, name);

    if (currentAlbumId === album.id && titleEl) {
      titleEl.textContent = name;
    }
  });

  deleteItem.addEventListener("click", (e) => {
    e.stopPropagation();
    albumMenu.classList.remove("open", "open-up");

    showDeleteConfirm(async () => {
      await deleteAlbum(album);
    });
  });

  wrapper.appendChild(header);
  wrapper.appendChild(collapsible);
  return wrapper;
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

  [...albums].sort((a, b) => a.name.localeCompare(b.name)).forEach((album) => {
    const albumTracks = albumTrackMap[album.id] || [];
    const wrapper = createAlbumItem(album, albumTracks);
    trackListEl.appendChild(wrapper);
  });

  const mainSection = document.createElement("div");
  mainSection.className = "album-section";
  const mainHeader = document.createElement("div");
  mainHeader.className = "album-header";
  mainHeader.textContent = "Main list";
  const mainUl = document.createElement("ul");
  mainUl.className = "album-track-list";

  mainTracks.forEach((track) => mainUl.appendChild(createTrackListItem(track)));

  mainSection.appendChild(mainHeader);
  mainSection.appendChild(mainUl);
  trackListEl.appendChild(mainSection);
}

function ensureAlbumSheet() {
  if (albumSheetBackdrop) return;

  albumSheetBackdrop = document.createElement("div");
  albumSheetBackdrop.className = "delete-confirm-backdrop";

  const dialog = document.createElement("div");
  dialog.className = "delete-confirm-dialog";

  const titleEl = document.createElement("p");
  titleEl.className = "delete-confirm-message";
  titleEl.textContent = "Move to album";

  const currentEl = document.createElement("p");
  currentEl.className = "album-current-info";

  const listBox = document.createElement("div");
  listBox.className = "album-select-list";

  const newBox = document.createElement("div");
  newBox.className = "album-new-box";

  const newInput = document.createElement("input");
  newInput.type = "text";
  newInput.placeholder = "새 앨범 이름 입력";
  newInput.className = "album-new-input";

  const newBtn = document.createElement("button");
  newBtn.className = "album-new-btn";
  newBtn.textContent = "Create & move";

  newBox.appendChild(newInput);
  newBox.appendChild(newBtn);

  const actions = document.createElement("div");
  actions.className = "delete-confirm-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "delete-confirm-btn no";
  cancelBtn.textContent = "Cancel";

  actions.appendChild(cancelBtn);

  dialog.appendChild(titleEl);
  dialog.appendChild(currentEl);
  dialog.appendChild(listBox);
  dialog.appendChild(newBox);
  dialog.appendChild(actions);

  albumSheetBackdrop.appendChild(dialog);
  document.body.appendChild(albumSheetBackdrop);

  albumSheetDialog = {
    backdrop: albumSheetBackdrop,
    currentEl,
    listBox,
    newInput,
    newBtn,
    cancelBtn,
  };
}

function showAlbumSelectSheet(track) {
  if (!track) return;
  ensureAlbumSheet();
  const { backdrop, currentEl, listBox, newInput, newBtn, cancelBtn } =
    albumSheetDialog;

  const currentAlbum =
    albums.find((a) => a.id === track.albumId)?.name || "Main list";
  currentEl.textContent = `현재 앨범: ${currentAlbum}`;

  listBox.innerHTML = "";

  const close = () => {
    backdrop.classList.remove("show");
    newInput.value = "";
  };

  const mainBtn = document.createElement("button");
  mainBtn.className = "album-select-btn";
  mainBtn.textContent = "Main list";
  mainBtn.addEventListener("click", async () => {
    await moveTrackToAlbum(track, null, null);
    if (currentTrackId === track.id) currentAlbumId = null;
    close();
  });
  listBox.appendChild(mainBtn);

  [...albums]
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((album) => {
      const btn = document.createElement("button");
      btn.className = "album-select-btn";
      btn.textContent = album.name;
      btn.addEventListener("click", async () => {
        await moveTrackToAlbum(track, album.id, null);
        if (currentTrackId === track.id) currentAlbumId = album.id;
        close();
      });
      listBox.appendChild(btn);
    });

  const handleCreate = async () => {
    const name = newInput.value.trim();
    if (!name) {
      newInput.focus();
      return;
    }
    await moveTrackToAlbum(track, null, name);
    const newAlbum = albums.find(
      (a) => a.name.toLowerCase() === name.toLowerCase()
    );
    if (newAlbum && currentTrackId === track.id) currentAlbumId = newAlbum.id;
    close();
  };

  newBtn.onclick = handleCreate;
  newInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    }
  };

  cancelBtn.onclick = () => {
    close();
  };

  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  backdrop.classList.add("show");
  newInput.focus();
}

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
  const handleNo = () => close();
  const handleBackdrop = (e) => {
    if (e.target === backdrop) close();
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

function handleGlobalMenuClose() {
  closeAllTrackMenus();
}

function closeAllTrackMenus() {
  document.querySelectorAll(".track-menu.open").forEach((m) => {
    m.classList.remove("open", "open-up");
  });
  document.querySelectorAll(".album-menu.open").forEach((m) => {
    m.classList.remove("open", "open-up");
  });
}

// ✅ 상단 랜덤 커버는 유지, 텍스트/미니플레이어만 초기화
function resetNowPlayingUI() {
  titleEl.textContent = "제목";
  artistEl.textContent = "";

  const miniThumbNew = document.getElementById("miniThumbNew");
  const miniTitleNew = document.getElementById("miniTitleNew");
  const miniArtistNew = document.getElementById("miniArtistNew");

  if (miniTitleNew) {
    miniTitleNew.classList.remove("marquee-on");
    requestAnimationFrame(() => {
      const parentWidth = miniTitleNew.parentElement
        ? miniTitleNew.parentElement.clientWidth
        : 0;
      if (miniTitleNew.scrollWidth > parentWidth + 8) {
        miniTitleNew.classList.add("marquee-on");
      }
    });
  }

  if (miniThumbNew) miniThumbNew.removeAttribute("src");
  if (miniTitleNew) miniTitleNew.textContent = "제목";
  if (miniArtistNew) miniArtistNew.textContent = "아티스트";

  if ("mediaSession" in navigator) {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  }
}

function updateNowPlaying(track) {
  const coverUrl = track.customThumbnail || track.thumbnail;

  titleEl.textContent = track.title;
  if (coverUrl) {
    thumbnailEl.src = coverUrl;
  } else {
    thumbnailEl.removeAttribute("src");
  }

  const miniThumbNew = document.getElementById("miniThumbNew");
  const miniTitleNew = document.getElementById("miniTitleNew");
  const miniArtistNew = document.getElementById("miniArtistNew");
  const playPauseIcon = document.getElementById("miniPlayPauseIcon");
  const currentEl = document.getElementById("miniCurrentTime");
  const totalEl = document.getElementById("miniTotalTime");
  const fillEl = document.getElementById("miniProgressFill");

  if (miniThumbNew && miniTitleNew && miniArtistNew) {
    if (coverUrl) {
      miniThumbNew.src = coverUrl;
    } else {
      miniThumbNew.removeAttribute("src");
    }
    miniTitleNew.textContent = track.title;
    miniArtistNew.textContent = track.channel;
  }

  if (miniTitleNew) {
    miniTitleNew.classList.remove("marquee-on");
    miniTitleNew.style.removeProperty("--mini-title-offset");

    requestAnimationFrame(() => {
      const wrapper = miniTitleNew.parentElement;
      if (!wrapper) return;

      const parentWidth = wrapper.clientWidth;
      const titleWidth = miniTitleNew.scrollWidth;

      if (titleWidth > parentWidth + 8) {
        const offset = titleWidth - parentWidth;
        miniTitleNew.style.setProperty("--mini-title-offset", `${offset}px`);
        miniTitleNew.classList.add("marquee-on");
      }
    });
  }

  const playingId = getPlayingVideoIdSafe();
  const isPreview = !playingId || playingId !== track.videoId;

  if (isPreview) {
    if (currentEl) currentEl.textContent = "00:00";
    if (totalEl) totalEl.textContent = "00:00";
    if (fillEl) fillEl.style.width = "0%";
    if (playPauseIcon) playPauseIcon.textContent = "▶";
  } else {
    try {
      const currentTime = player.getCurrentTime();
      const duration = player.getDuration();
      if (currentTime && duration) {
        if (currentEl) currentEl.textContent = formatTime(currentTime);
        if (totalEl) totalEl.textContent = formatTime(duration);
        if (fillEl) {
          const percent = (currentTime / duration) * 100;
          fillEl.style.width = percent + "%";
        }
      }
      if (playPauseIcon) {
        const state = player.getPlayerState();
        playPauseIcon.textContent =
          state === YT.PlayerState.PLAYING ? "❚❚" : "▶";
      }
    } catch (e) {}
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

// ========= 트랙 추가/삭제 =========
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
      albumId: null,
    };

    const docId = await addTrackToFirestore(newTrackData);
    const newTrack = { id: docId, ...newTrackData };

    tracks.unshift(newTrack);
    currentTrackId = newTrack.id;
    currentAlbumId = null;
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
            albumId: null,
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
        currentAlbumId = null;
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
      const t = tracks[0];
      currentAlbumId = t.albumId || null;
      updateNowPlaying(t);
      playVideoById(t.videoId);
    } else {
      currentAlbumId = null;
      resetNowPlayingUI();
    }
  }

  renderTrackList();
}

function updatePlayingIndicator() {
  document.querySelectorAll(".track-item.is-playing").forEach((item) => {
    item.classList.remove("is-playing");
  });

  if (!currentTrackId) return;

  const currentLi = document.querySelector(
    `[data-track-id="${currentTrackId}"]`
  );
  if (!currentLi) return;

  const track = tracks.find((t) => t.id === currentTrackId);
  if (!track) return;

  const playingId = getPlayingVideoIdSafe();
  if (playingId && playingId === track.videoId) {
    currentLi.classList.add("is-playing");
  }
}

function playTrack(id) {
  const track = tracks.find((t) => t.id === id);
  if (!track) return;

  document.querySelectorAll(".track-item.active").forEach((item) => {
    item.classList.remove("active");
  });

  const currentLi = document.querySelector(`[data-track-id="${id}"]`);
  if (currentLi) {
    currentLi.classList.add("active");
  }

  currentTrackId = id;
  currentAlbumId = track.albumId || null;
  updateNowPlaying(track);
  playVideoById(track.videoId);

  setTimeout(updatePlayingIndicator, 300);
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
        updateNewMiniPlayer();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        if (!player) return;
        player.pauseVideo();
        updateNewMiniPlayer();
      });

      navigator.mediaSession.setActionHandler("nexttrack", () => {
        if (!currentTrackId || tracks.length === 0) return;
        const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
        if (currentIndex === -1) return;
        const nextIndex = currentIndex + 1;
        if (nextIndex >= tracks.length) return;
        playTrack(tracks[nextIndex].id);
      });

      navigator.mediaSession.setActionHandler("previoustrack", () => {
        if (!currentTrackId || tracks.length === 0) return;
        const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
        if (currentIndex === -1) return;
        const prevIndex = currentIndex - 1;
        if (prevIndex < 0) return;
        playTrack(tracks[prevIndex].id);
      });
    }
  } else {
    player.loadVideoById(videoId);
  }
}

function getPlayingVideoIdSafe() {
  if (!player || !window.YT) return null;

  try {
    const data = player.getVideoData && player.getVideoData();
    if (data && data.video_id) return data.video_id;

    const url = player.getVideoUrl && player.getVideoUrl();
    if (!url) return null;
    const urlObj = new URL(url);
    return (
      urlObj.searchParams.get("v") ||
      urlObj.pathname.split("/").pop() ||
      null
    );
  } catch (e) {
    return null;
  }
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function updateNewMiniPlayer() {
  const playPauseIcon = document.getElementById("miniPlayPauseIcon");
  const currentEl = document.getElementById("miniCurrentTime");
  const totalEl = document.getElementById("miniTotalTime");
  const fillEl = document.getElementById("miniProgressFill");

  if (!player || !window.YT) {
    if (playPauseIcon) playPauseIcon.textContent = "▶";
    if (currentEl) currentEl.textContent = "00:00";
    if (totalEl) totalEl.textContent = "00:00";
    if (fillEl) fillEl.style.width = "0%";
    return;
  }

  const playingId = getPlayingVideoIdSafe();
  const currentTrack = tracks.find((t) => t.id === currentTrackId) || null;
  const isPreview =
    !currentTrack || !playingId || playingId !== currentTrack.videoId;

  if (isPreview) {
    if (currentEl) currentEl.textContent = "00:00";
    if (totalEl) totalEl.textContent = "00:00";
    if (fillEl) fillEl.style.width = "0%";
    if (playPauseIcon) playPauseIcon.textContent = "▶";
    return;
  }

  try {
    const state = player.getPlayerState();
    if (playPauseIcon) {
      if (state === YT.PlayerState.PLAYING) {
        playPauseIcon.textContent = "❚❚";
      } else {
        playPauseIcon.textContent = "▶";
      }
    }

    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();

    if (currentTime && duration) {
      if (currentEl) currentEl.textContent = formatTime(currentTime);
      if (totalEl) totalEl.textContent = formatTime(duration);

      if (fillEl) {
        const percent = (currentTime / duration) * 100;
        fillEl.style.width = percent + "%";
      }
    }
  } catch (e) {
    if (playPauseIcon) playPauseIcon.textContent = "▶";
  }
}

setInterval(updateNewMiniPlayer, 1000);

const progressBar = document.getElementById("miniProgressBar");
if (progressBar) {
  progressBar.addEventListener("click", (e) => {
    if (!player || !window.YT) return;

    try {
      const duration = player.getDuration();
      const rect = progressBar.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = x / rect.width;
      const seekTime = duration * percent;

      player.seekTo(seekTime, true);
    } catch (err) {}
  });
}

const playPauseBtnNew = document.getElementById("miniPlayPauseBtnNew");
if (playPauseBtnNew) {
  playPauseBtnNew.addEventListener("click", () => {
    if (!currentTrackId) return;
    const track = tracks.find((t) => t.id === currentTrackId);
    if (!track) return;

    if (!player || !window.YT) {
      playTrack(track.id);
      return;
    }

    try {
      const playingId = getPlayingVideoIdSafe();

      if (!playingId || playingId !== track.videoId) {
        playTrack(track.id);
        return;
      }

      const state = player.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
      } else {
        player.playVideo();
      }
      updateNewMiniPlayer();
    } catch (e) {
      playTrack(track.id);
    }
  });
}

const miniNextBtn = document.getElementById("miniNextBtn");
if (miniNextBtn) {
  miniNextBtn.addEventListener("click", () => {
    if (!currentTrackId || tracks.length === 0) return;
    const currentIndex = tracks.findIndex((t) => t.id === currentTrackId);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + 1;
    if (nextIndex >= tracks.length) return;
    playTrack(tracks[nextIndex].id);
  });
}

// ========= 로그인/로그아웃 & 초기 로딩 =========
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

// 상단 프로필/닉네임 클릭 → 로그아웃 확인 후 실행
async function confirmAndLogout() {
  const ok = window.confirm("로그아웃 하시겠어요?");
  if (!ok) return;
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    alert("로그아웃 중 문제가 발생했어요.");
  }
}

if (userAvatarEl) {
  userAvatarEl.style.cursor = "pointer";
  userAvatarEl.addEventListener("click", confirmAndLogout);
}
if (userNickEl) {
  userNickEl.style.cursor = "pointer";
  userNickEl.addEventListener("click", confirmAndLogout);
}

// ejtube 로고 클릭 → 전체 초기화 (새로고침)
if (appLogoButton) {
  appLogoButton.addEventListener("click", () => {
    window.location.reload();
  });
}

onAuthStateChanged(auth, async (user) => {
  console.log("auth state changed:", user);

  if (user) {
    try {
      await user.reload();
    } catch (e) {
      console.warn("user.reload() 실패:", e);
    }

    const freshUser = auth.currentUser || user;
    currentUser = freshUser;

    const email = freshUser.email || "";
    const nick = email.includes("@") ? email.split("@")[0] : email;
    if (userNickEl) userNickEl.textContent = nick;

    if (userAvatarEl) {
      if (freshUser.photoURL) {
        userAvatarEl.src = freshUser.photoURL;
      } else {
        userAvatarEl.src = "";
      }
    }

    loginScreen.style.display = "none";
    mainScreen.classList.remove("hidden");

    await loadAlbumsFromFirestore();
    await loadTracksFromFirestore();
    renderTrackList();

    // ✅ 초기에는 아무 것도 선택하지 않음
    currentTrackId = null;
    currentAlbumId = null;
    resetNowPlayingUI();

    // ✅ 로그인 후 랜덤 메인 커버 + 미니플레이어
    setRandomMainCover();
  } else {
    currentUser = null;
    tracks = [];
    currentTrackId = null;
    currentAlbumId = null;

    if (userNickEl) userNickEl.textContent = "";
    if (userAvatarEl) userAvatarEl.src = "";

    resetNowPlayingUI();

    // ✅ 비로그인 화면에서도 랜덤 메인 커버 + 미니플레이어
    setRandomMainCover();

    loginScreen.style.display = "flex";
    mainScreen.classList.add("hidden");
    loginError.textContent = "";
  }
});

// ========= 입력/버튼 핸들러 =========
addButton.addEventListener("click", () => {
  const url = videoUrlInput.value.trim();
  if (!url) return;
  addFromInputUrl(url);
  videoUrlInput.value = "";
});

videoUrlInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addButton.click();
});

// 전체 비우기 버튼은 제거 버전이므로 핸들러도 없음
// clearListButton.addEventListener(...)

// ========= 메인 타이틀 편집 =========
if (titleEl && titleEditBtn) {
  titleEl.addEventListener("click", () => {
    if (!currentTrackId) return;
    titleEditBtn.style.opacity = "1";
  });

  titleEditBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!currentTrackId) return;
    const track = tracks.find((t) => t.id === currentTrackId);
    if (!track) return;
    openTitleRenameSheet(track);
  });
}

// ========= 커버 시트 =========
function ensureCoverSheet() {
  if (coverSheetBackdrop) return;

  coverSheetBackdrop = document.createElement("div");
  coverSheetBackdrop.className = "cover-sheet-backdrop";

  const sheet = document.createElement("div");
  sheet.className = "cover-sheet";

  const title = document.createElement("p");
  title.className = "cover-sheet-title";
  title.textContent = "커버 이미지 변경";

  const desc = document.createElement("p");
  desc.className = "cover-sheet-desc";
  desc.textContent = "이미지 URL을 붙여넣어 주세요.";

  coverSheetInput = document.createElement("input");
  coverSheetInput.type = "text";
  coverSheetInput.className = "cover-sheet-input";
  coverSheetInput.placeholder = "https://example.com/cover.jpg";

  const actions = document.createElement("div");
  actions.className = "cover-sheet-actions";

  coverSheetCancelBtn = document.createElement("button");
  coverSheetCancelBtn.className = "cover-sheet-btn cancel";
  coverSheetCancelBtn.textContent = "Cancel";

  coverSheetSaveBtn = document.createElement("button");
  coverSheetSaveBtn.className = "cover-sheet-btn save";
  coverSheetSaveBtn.textContent = "Save";

  actions.appendChild(coverSheetCancelBtn);
  actions.appendChild(coverSheetSaveBtn);

  sheet.appendChild(title);
  sheet.appendChild(desc);
  sheet.appendChild(coverSheetInput);
  sheet.appendChild(actions);

  coverSheetBackdrop.appendChild(sheet);
  document.body.appendChild(coverSheetBackdrop);

  coverSheetCancelBtn.addEventListener("click", hideCoverSheet);
  coverSheetBackdrop.addEventListener("click", (e) => {
    if (e.target === coverSheetBackdrop) hideCoverSheet();
  });
}

function showCoverSheet(currentUrl) {
  ensureCoverSheet();
  coverSheetInput.value = currentUrl;
  coverSheetBackdrop.classList.add("show");
  coverSheetInput.focus();
  coverSheetInput.select();
}

function hideCoverSheet() {
  if (!coverSheetBackdrop) return;
  coverSheetBackdrop.classList.remove("show");
}

function openTitleRenameSheet(track) {
  ensureCoverSheet();
  if (!coverSheetBackdrop || !coverSheetInput || !coverSheetSaveBtn) return;

  const titleElSheet =
    coverSheetBackdrop.querySelector(".cover-sheet-title");
  const descElSheet = coverSheetBackdrop.querySelector(".cover-sheet-desc");

  if (titleElSheet) titleElSheet.textContent = "제목 변경";
  if (descElSheet)
    descElSheet.textContent = "새 제목을 입력해 주세요.";

  coverSheetInput.value = track.title;
  coverSheetBackdrop.classList.add("show");
  coverSheetInput.focus();
  coverSheetInput.select();

  const handleSave = async () => {
    const newTitle = coverSheetInput.value.trim();
    const finalTitle = newTitle || track.title;
    try {
      if (newTitle && newTitle !== track.title) {
        await updateTrackTitleInFirestore(track.id, newTitle);
        track.title = newTitle;
        updateNowPlaying(track);
        renderTrackList();
      } else {
        if (titleEl) titleEl.textContent = finalTitle;
      }
    } catch (err) {
      console.error("rename error:", err);
      alert("제목을 변경하는 중 오류가 발생했어요.");
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
      console.error("cover update error:", err);
      alert("커버 이미지를 변경하는 중 오류가 발생했어요.");
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

// 상단 메인 커버 버튼: 현재 선택된 앨범 커버 우선, 없으면 현재 트랙 커버
if (changeCoverBtn) {
  changeCoverBtn.addEventListener("click", () => {
    // 1) 현재 선택된 앨범이 있으면 → 앨범 커버 변경
    if (currentAlbumId) {
      const album = albums.find((a) => a.id === currentAlbumId);
      if (!album) return;

      // 이 앨범에 속한 트랙들 중 첫 번째를 찾아서 기본 썸네일 후보로 사용
      const albumTracks = tracks.filter((t) => t.albumId === album.id);
      const firstTrack = albumTracks[0] || null;
      const currentCover =
        album.coverUrl ||
        firstTrack?.customThumbnail ||
        firstTrack?.thumbnail ||
        thumbnailEl.src ||
        "";

      showCoverSheet(currentCover);

      const handleSave = async () => {
        const trimmed = coverSheetInput.value.trim();
        const newCover = trimmed || null;

        try {
          await updateAlbumCoverInFirestore(album.id, newCover);
          album.coverUrl = newCover;

          // 상단에 이 앨범이 선택되어 있으면 썸네일 즉시 반영
          if (currentAlbumId === album.id) {
            if (newCover) {
              thumbnailEl.src = newCover;
            } else if (firstTrack?.thumbnail) {
              thumbnailEl.src =
                firstTrack.customThumbnail || firstTrack.thumbnail;
            } else {
              thumbnailEl.removeAttribute("src");
            }
          }

          renderTrackList();
        } catch (err) {
          alert("앨범 커버를 변경하는 중 오류가 발생했어요.");
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
      return;
    }

    // 2) 선택된 앨범이 없으면 → 기존처럼 현재 트랙 커버 변경
    if (!currentTrackId) {
      alert("먼저 앨범을 선택하거나 재생할 트랙을 선택해 주세요.");
      return;
    }
    const track = tracks.find((t) => t.id === currentTrackId);
    if (!track) return;
    showCoverSheetForTrack(
      track,
      track.customThumbnail || track.thumbnail || ""
    );
  });
}

// iOS 확대 방지
document.addEventListener("gesturestart", function (e) {
  e.preventDefault();
});

if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
  document.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false }
  );

  document.addEventListener(
    "touchmove",
    function (e) {
      if (e.scale && e.scale !== 1) e.preventDefault();
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
