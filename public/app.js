(() => {
  const $ = (sel) => document.querySelector(sel);
  let currentRange = "short_term";

  async function api(path) {
    const res = await fetch(path);
    if (res.status === 401) {
      window.location.href = "/";
      return null;
    }
    if (res.status === 400) {
      window.location.href = "/loading.html";
      return null;
    }
    return res.json();
  }

  function skeleton(count = 5) {
    return Array.from({ length: count }, () => '<li class="skeleton"></li>').join("");
  }

  // ---------- Renderers ----------

  function renderListeningArtists(items) {
    if (!items.length) return '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No data</div></div></li>';
    return items
      .map(
        (a, i) => `
      <li class="stat-item">
        <span class="stat-rank">${i + 1}</span>
        <img class="stat-img round" src="${a.images?.[2]?.url || a.images?.[0]?.url || ""}" alt="${a.name}" />
        <div class="stat-info">
          <div class="stat-title">${a.name}</div>
          <div class="stat-sub">${a.genres?.slice(0, 2).join(", ") || "—"}</div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderListeningTracks(items) {
    if (!items.length) return '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No data</div></div></li>';
    return items
      .map(
        (t, i) => `
      <li class="stat-item">
        <span class="stat-rank">${i + 1}</span>
        <img class="stat-img" src="${t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || ""}" alt="${t.name}" />
        <div class="stat-info">
          <div class="stat-title">${t.name}</div>
          <div class="stat-sub">${t.artists?.map((a) => a.name).join(", ")}</div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderCuratedArtists(items) {
    if (!items.length) return '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No artists match filters</div></div></li>';
    return items
      .map(
        (a, i) => `
      <li class="stat-item">
        <span class="stat-rank">${i + 1}</span>
        ${a.image ? `<img class="stat-img round" src="${a.image}" alt="${a.name}" />` : '<div class="stat-img round" style="background:var(--surface-hover)"></div>'}
        <div class="stat-info">
          <div class="stat-title">${a.name}</div>
          <div class="stat-sub">${a.genres.join(", ") || "—"} · ${a.trackCount} tracks</div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderCuratedTracks(items) {
    if (!items.length) return '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No tracks match filters</div></div></li>';
    return items
      .map(
        (t, i) => `
      <li class="stat-item">
        <span class="stat-rank">${i + 1}</span>
        <img class="stat-img" src="${t.image}" alt="${t.name}" />
        <div class="stat-info">
          <div class="stat-title">${t.name}</div>
          <div class="stat-sub">${t.artists} · in ${t.playlistCount} playlists</div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderBarChart(items, labelKey, countKey) {
    if (!items.length) return '<li class="genre-item"><span class="genre-label">No data</span></li>';
    const max = items[0]?.[countKey] || 1;
    return items
      .map(
        (g) => `
      <li class="genre-item">
        <span class="genre-label">${g[labelKey]}</span>
        <div class="genre-bar-container">
          <div class="genre-bar" style="width:${(g[countKey] / max) * 100}%"></div>
        </div>
        <span class="genre-count">${g[countKey]}</span>
      </li>`
      )
      .join("");
  }

  function renderAppearances(items) {
    if (!items.length) return '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No songs appear in multiple playlists</div></div></li>';
    return items
      .map(
        (t, i) => `
      <li class="stat-item">
        <span class="stat-rank">${i + 1}</span>
        <img class="stat-img" src="${t.image}" alt="${t.name}" />
        <div class="stat-info">
          <div class="stat-title">${t.name}</div>
          <div class="stat-sub">${t.artists} · in ${t.count} of ${t.totalPlaylists} playlists</div>
        </div>
      </li>`
      )
      .join("");
  }

  function renderRecent(items) {
    return items
      .map((r) => {
        const t = r.track;
        const time = new Date(r.played_at).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `
      <li class="stat-item">
        <img class="stat-img" src="${t.album?.images?.[2]?.url || t.album?.images?.[0]?.url || ""}" alt="${t.name}" />
        <div class="stat-info">
          <div class="stat-title">${t.name}</div>
          <div class="stat-sub">${t.artists?.map((a) => a.name).join(", ")} · ${time}</div>
        </div>
      </li>`;
      })
      .join("");
  }

  function renderLibraryStats(data) {
    return `
      <div class="library-stat">
        <span class="library-stat-number">${data.totalUniqueTracksScanned.toLocaleString()}</span>
        <span class="library-stat-label">Unique Tracks</span>
      </div>
      <div class="library-stat">
        <span class="library-stat-number">${data.totalUniqueArtistsScanned.toLocaleString()}</span>
        <span class="library-stat-label">Unique Artists</span>
      </div>
      <div class="library-stat">
        <span class="library-stat-number">${data.totalPlaylists.toLocaleString()}</span>
        <span class="library-stat-label">Your Playlists</span>
      </div>
      <div class="library-stat">
        <span class="library-stat-number">${data.savedTracks.toLocaleString()}</span>
        <span class="library-stat-label">Saved Tracks</span>
      </div>
      <div class="library-stat">
        <span class="library-stat-number">${data.savedAlbums.toLocaleString()}</span>
        <span class="library-stat-label">Saved Albums</span>
      </div>`;
  }

  // ---------- Loaders ----------

  async function loadProfile() {
    const me = await api("/api/me");
    if (!me) return;
    const img = me.images?.[0]?.url;
    $("#profile-info").innerHTML = `
      ${img ? `<img class="profile-avatar" src="${img}" alt="avatar" />` : ""}
      <span class="profile-name">${me.display_name}<small>${me.product === "premium" ? "Premium" : "Free"} · ${me.country || ""}</small></span>
    `;
  }

  async function loadListeningHistory() {
    ["listening-artists", "listening-tracks", "recently-played"].forEach((id) => {
      document.getElementById(id).innerHTML = skeleton();
    });

    const [artists, tracks, recent] = await Promise.all([
      api(`/api/top-artists?range=${currentRange}`),
      api(`/api/top-tracks?range=${currentRange}`),
      api("/api/recently-played"),
    ]);

    if (artists) $("#listening-artists").innerHTML = renderListeningArtists(artists.items || []);
    if (tracks) $("#listening-tracks").innerHTML = renderListeningTracks(tracks.items || []);
    if (recent) $("#recently-played").innerHTML = renderRecent(recent.items || []);
  }

  async function loadPlaylistAnalysis() {
    const genre = $("#genre-filter").value;
    const decade = $("#decade-filter").value;

    ["top-artists", "top-tracks", "genre-breakdown", "decade-breakdown", "playlist-appearances"].forEach((id) => {
      document.getElementById(id).innerHTML = skeleton();
    });

    const params = new URLSearchParams();
    if (genre) params.set("genre", genre);
    if (decade) params.set("decade", decade);

    const data = await api(`/api/dashboard?${params}`);
    if (!data) return;

    if (!genre && !decade) {
      $("#library-stats").innerHTML = renderLibraryStats(data);
    }

    populateFilters(data.filterOptions, genre, decade);

    $("#top-artists").innerHTML = renderCuratedArtists(data.topArtists || []);
    $("#top-tracks").innerHTML = renderCuratedTracks(data.topTracks || []);
    $("#genre-breakdown").innerHTML = renderBarChart(data.genres || [], "genre", "count");
    $("#decade-breakdown").innerHTML = renderBarChart(data.decades || [], "decade", "count");

    if (data.appearances?.length) {
      $("#playlist-subtitle").textContent = `Songs appearing in 2+ of your ${data.totalPlaylists} playlists`;
      $("#playlist-appearances").innerHTML = renderAppearances(data.appearances);
    } else {
      $("#playlist-subtitle").textContent = "";
      $("#playlist-appearances").innerHTML = '<li class="stat-item"><div class="stat-info"><div class="stat-sub">No songs appear in multiple playlists</div></div></li>';
    }

    $("#filter-clear").style.display = genre || decade ? "" : "none";
  }

  function populateFilters(options, currentGenre, currentDecade) {
    const genreSelect = $("#genre-filter");
    const decadeSelect = $("#decade-filter");

    genreSelect.innerHTML = '<option value="">All genres</option>' +
      options.genres.map((g) => `<option value="${g}"${g === currentGenre ? " selected" : ""}>${g}</option>`).join("");

    decadeSelect.innerHTML = '<option value="">All decades</option>' +
      options.decades.map((d) => `<option value="${d}"${d === currentDecade ? " selected" : ""}>${d}</option>`).join("");
  }

  // ---------- Event listeners ----------

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      loadListeningHistory();
    });
  });

  $("#genre-filter").addEventListener("change", loadPlaylistAnalysis);
  $("#decade-filter").addEventListener("change", loadPlaylistAnalysis);
  $("#filter-clear").addEventListener("click", () => {
    $("#genre-filter").value = "";
    $("#decade-filter").value = "";
    $("#filter-clear").style.display = "none";
    loadPlaylistAnalysis();
  });

  // ---------- Init ----------

  async function init() {
    const status = await api("/api/scan-status");
    if (!status?.scanned) {
      window.location.href = "/loading.html";
      return;
    }

    loadProfile();
    loadListeningHistory();
    loadPlaylistAnalysis();
  }

  init();
})();
