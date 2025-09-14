//===================================================================
// 1. Configuration & API Interaction
//===================================================================

let token = 'YOUR_SPOTIFY_ACCESS_TOKEN';
const BASE_API_URL = 'https://api.spotify.com/v1/';

async function fetchWebApi(endpoint) {
    const res = await fetch(`${BASE_API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        throw new Error(`API call to ${endpoint} failed with status: ${res.status}`);
    }
    return await res.json();
}

async function getTopTracks(time_range) {
    return (await fetchWebApi(`me/top/tracks?time_range=${time_range}&limit=5`)).items;
}

async function getTopArtists(time_range) {
    return (await fetchWebApi(`me/top/artists?time_range=${time_range}&limit=5`)).items;
}

//===================================================================
// 2. Helper Functions
//===================================================================

function msToMinutesAndSeconds(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ":" + (seconds < 10 ? '0' : '') + seconds;
}

//===================================================================
// 3. UI Rendering & Display Logic
//===================================================================

async function displayAllData(time_range) {
    const tracksContainer = document.getElementById('top-tracks-container');
    const artistsContainer = document.getElementById('top-artists-container');

    if (!token || token === 'YOUR_SPOTIFY_ACCESS_TOKEN') {
        tracksContainer.innerHTML = '';
        artistsContainer.innerHTML = '<p>Please enter your Spotify API Key above to see your data.</p>';
        return;
    }

    tracksContainer.innerHTML = '<p>Loading your top tracks...</p>';
    artistsContainer.innerHTML = '<p>Loading your top artists...</p>';

    try {
        const topTracks = await getTopTracks(time_range);
        const topArtists = await getTopArtists(time_range);

        if (topTracks.length === 0) {
            tracksContainer.innerHTML = '<p>No top tracks found for this time range.</p>';
        } else {
            tracksContainer.innerHTML = '';
            const trackList = document.createElement('ol');
            topTracks.forEach(track => {
                const listItem = document.createElement('li');
                const artists = track.artists.map(artist => artist.name).join(', ');
                listItem.textContent = `${track.name} by ${artists}`;
                listItem.dataset.trackId = track.id;
                listItem.classList.add('track-item');
                trackList.appendChild(listItem);
            });
            tracksContainer.appendChild(trackList);
        }

        if (topArtists.length === 0) {
            artistsContainer.innerHTML = '<p>No top artists found for this time range.</p>';
        } else {
            artistsContainer.innerHTML = '';
            const artistList = document.createElement('ol');
            topArtists.forEach(artist => {
                const listItem = document.createElement('li');
                listItem.textContent = artist.name;
                listItem.classList.add('artist-item');
                artistList.appendChild(listItem);
            });
            artistsContainer.appendChild(artistList);
        }

        document.querySelectorAll('.track-item').forEach(item => {
            item.addEventListener('click', () => {
                const trackId = item.dataset.trackId;
                showTrackDetails(trackId, topTracks);
            });
        });

    } catch (error) {
        console.error("Error fetching data:", error);
        tracksContainer.innerHTML = '<p>There was an error loading your data. Your API key may be invalid or expired.</p>';
        artistsContainer.innerHTML = '';
    }
}

function showTrackDetails(trackId, topTracks) {
    const track = topTracks.find(t => t.id === trackId);
    if (!track) return;

    const modal = document.getElementById('track-modal');
    const modalAlbumArt = document.getElementById('modal-album-art');
    const modalTrackName = document.getElementById('modal-track-name');
    const modalArtistName = document.getElementById('modal-artist-name');
    const modalAlbumName = document.getElementById('modal-album-name');
    const modalPopularity = document.getElementById('modal-popularity');
    const modalDuration = document.getElementById('modal-duration');

    modalAlbumArt.src = track.album.images[0].url;
    modalAlbumArt.alt = `${track.album.name} album cover`;

    modalTrackName.textContent = track.name;
    modalArtistName.textContent = track.artists.map(artist => artist.name).join(', ');
    modalAlbumName.textContent = track.album.name;
    modalPopularity.textContent = track.popularity;
    modalDuration.textContent = msToMinutesAndSeconds(track.duration_ms);

    modal.style.display = "block";
}

//===================================================================
// 4. Event Listeners
//===================================================================

// --- Modal Listeners ---
document.querySelector('.close-button').addEventListener('click', () => {
    document.getElementById('track-modal').style.display = "none";
});

window.addEventListener('click', (event) => {
    const modal = document.getElementById('track-modal');
    if (event.target === modal) {
        modal.style.display = "none";
    }
});

// --- Info Button Listener ---
const infoBtn = document.getElementById('info-btn');
const disclaimerPopup = document.getElementById('disclaimer');

infoBtn.addEventListener('click', () => {
    if (disclaimerPopup.style.display === 'block') {
        disclaimerPopup.style.display = 'none';
    } else {
        disclaimerPopup.style.display = 'block';
    }
});

window.addEventListener('click', (event) => {
    if (event.target !== infoBtn && !disclaimerPopup.contains(event.target)) {
        disclaimerPopup.style.display = 'none';
    }
});

// --- API Key Input Listeners ---
const tokenInputBtn = document.getElementById('token-input-btn');
const tokenForm = document.querySelector('.token-form');
const tokenInput = document.getElementById('token-input');
const tokenSubmitBtn = document.getElementById('token-submit-btn');

tokenInputBtn.addEventListener('click', () => {
    tokenForm.style.display = 'block';
    tokenInputBtn.style.display = 'none';
    tokenInput.focus();
});

tokenSubmitBtn.addEventListener('click', () => {
    const newToken = tokenInput.value.trim();
    if (newToken) {
        token = newToken;
        tokenForm.style.display = 'none';
        tokenInputBtn.style.display = 'block';
        displayAllData(document.getElementById('time-range-select').value);
    }
});

// --- Time Range Dropdown Listener ---
const timeRangeSelect = document.getElementById('time-range-select');
timeRangeSelect.addEventListener('change', (event) => {
    const selectedTimeRange = event.target.value;
    displayAllData(selectedTimeRange);
});

//===================================================================
// 5. Initial Data Load
//===================================================================

displayAllData(document.getElementById('time-range-select').value);