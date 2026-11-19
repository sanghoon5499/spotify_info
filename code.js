//===================================================================
// 1. Configuration & API Interaction
//===================================================================

const DEFAULT_TOKEN = 'YOUR_SPOTIFY_ACCESS_TOKEN';
let token = DEFAULT_TOKEN;
const BASE_API_URL = 'https://api.spotify.com/v1/';

const dataCache = {
    short_term: null,
    medium_term: null,
    long_term: null
};

async function fetchWebApi(endpoint) {
    const res = await fetch(`${BASE_API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    
    // Check for rate limiting first
    if (res.status === 429) {
        const retryAfter = res.headers.get('Retry-After') || 5; 
        throw new Error(`Rate limited by Spotify. Please wait ${retryAfter} seconds before trying again.`);
    }
    
    if (!res.ok) {
        throw new Error(`API call to ${endpoint} failed with status: ${res.status}`);
    }
    return res.json();
}

async function getTopTracks(timeRange) {
    const data = await fetchWebApi(`me/top/tracks?time_range=${timeRange}&limit=5`);
    return data.items;
}

async function getTopArtists(timeRange) {
    const data = await fetchWebApi(`me/top/artists?time_range=${timeRange}&limit=5`);
    return data.items;
}

function getArtist(artistId) {
    return fetchWebApi(`artists/${artistId}`);
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

    if (!token || token === DEFAULT_TOKEN) {
        tracksContainer.innerHTML = '';
        artistsContainer.innerHTML = '<p>Please enter your Spotify API Key above to see your data.</p>';
        return;
    }

    tracksContainer.innerHTML = '<p class="loading-text">Loading your top tracks...</p>';
    artistsContainer.innerHTML = '<p class="loading-text">Loading your top artists...</p>';

    try {
        let topTracks, topArtists;

        if (dataCache[time_range]) {
            topTracks = dataCache[time_range].tracks;
            topArtists = dataCache[time_range].artists;
        } else {
            topTracks = await getTopTracks(time_range);
            topArtists = await getTopArtists(time_range);
            dataCache[time_range] = { tracks: topTracks, artists: topArtists };
        }

        if (topTracks.length === 0) {
            tracksContainer.innerHTML = '<p>No top tracks found for this time range.</p>';
        } else {
            tracksContainer.innerHTML = '';
            const trackList = document.createElement('ol');
            topTracks.forEach(track => {
                const listItem = document.createElement('li');
                const artists = track.artists.map(artist => artist.name).join(', ');
                listItem.textContent = `${track.name} by ${artists}`;
                listItem.classList.add('track-item');
                listItem.addEventListener('click', () => showTrackDetails(track.id, topTracks));
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
                listItem.addEventListener('click', () => showArtistDetails(artist.id));
                artistList.appendChild(listItem);
            });
            artistsContainer.appendChild(artistList);
        }

    } catch (error) {
        console.error("Error fetching data:", error);
        tracksContainer.innerHTML = `<p style="color: #ef4444; font-weight: 500;">⚠️ ${error.message}</p>`;
        artistsContainer.innerHTML = '';
    }
}

function showTrackDetails(trackId, topTracks) {
    const track = topTracks.find(t => t.id === trackId);
    if (!track) return;

    const modal = document.getElementById('track-modal');
    
    // Core Track Info
    document.getElementById('modal-album-art').src = track.album.images[0].url;
    document.getElementById('modal-track-name').textContent = track.name;
    document.getElementById('modal-release-date').textContent = formatDate(track.album.release_date);
    document.getElementById('modal-duration').textContent = msToMinutesAndSeconds(track.duration_ms);
    
    // Render the dynamic clickable artist links
    renderClickableArtists(track.artists, 'modal-artist-name', 'track-modal');
    
    // Explicit Badge Toggle
    const explicitBadge = document.getElementById('modal-explicit');
    if (explicitBadge) {
        explicitBadge.style.display = track.explicit ? 'inline-block' : 'none';
    }

    // Clickable Album Name
    const albumNameEl = document.getElementById('modal-album-name');
    if (albumNameEl) {
        albumNameEl.textContent = track.album.name;
        albumNameEl.onclick = () => showAlbumDetails(track.album, track.artists);
    }

    modal.style.display = "block";
}

function showAlbumDetails(album, trackArtists) {
    // Hide the track modal before opening the album modal
    document.getElementById('track-modal').style.display = "none";
    
    const modal = document.getElementById('album-modal');
    
    document.getElementById('modal-album-only-art').src = album.images[0].url;
    document.getElementById('modal-album-only-name').textContent = album.name;
    document.getElementById('modal-album-only-type').textContent = album.album_type;
    document.getElementById('modal-album-only-tracks').textContent = album.total_tracks;
    document.getElementById('modal-album-only-release-date').textContent = formatDate(album.release_date);
    
    const artistsToUse = album.artists || trackArtists;
    renderClickableArtists(artistsToUse, 'modal-album-only-artist', 'album-modal');

    const uriEl = document.getElementById('modal-album-only-uri');
    uriEl.href = album.uri; 

    modal.style.display = "block";
}

let previousModalForArtist = null;

async function showArtistDetails(artistId, fromModalId = null) {
    previousModalForArtist = fromModalId;
    
    // Hide any currently open modals
    document.getElementById('track-modal').style.display = "none";
    document.getElementById('album-modal').style.display = "none";

    try {
        const artist = await getArtist(artistId);
        const modal = document.getElementById('artist-modal');
        
        // Handle images (some obscure artists might not have a profile pic)
        const imgEl = document.getElementById('modal-artist-art');
        imgEl.src = artist.images.length > 0 ? artist.images[0].url : 'https://via.placeholder.com/160?text=No+Image';
        
        document.getElementById('modal-artist-name-title').textContent = artist.name;
        document.getElementById('modal-artist-followers').textContent = 
            (artist.followers && artist.followers.total) 
                ? artist.followers.total.toLocaleString() 
                : 'N/A';
        
        // Render Genre Tags
        const genresContainer = document.getElementById('modal-artist-genres');
        genresContainer.innerHTML = '';
        if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(genre => {
                const span = document.createElement('span');
                span.className = 'genre-tag';
                span.textContent = genre;
                genresContainer.appendChild(span);
            });
        } else {
            genresContainer.innerHTML = '<span class="genre-tag">No genres listed</span>';
        }
        
        document.getElementById('modal-artist-uri').href = artist.uri;
        
        // Toggle the Back button visibility based on if we came from another modal
        document.getElementById('back-to-prev-btn').style.display = fromModalId ? 'inline' : 'none';
        
        modal.style.display = "block";
    } catch (error) {
        console.error("Failed to load artist details", error);
    }
}

// Helper to turn an array of artists into clickable links inside a target element
function renderClickableArtists(artists, targetElementId, currentModalId) {
    const container = document.getElementById(targetElementId);
    container.innerHTML = ''; // Clear existing
    
    artists.forEach((artist, index) => {
        const span = document.createElement('span');
        span.textContent = artist.name;
        span.className = 'clickable-artist';
        span.addEventListener('click', () => showArtistDetails(artist.id, currentModalId));
        container.appendChild(span);
        
        // Add a comma after all but the last artist
        if (index < artists.length - 1) {
            container.appendChild(document.createTextNode(', '));
        }
    });
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown Date';
    
    // Split the date to handle Spotify's varying precisions safely
    const parts = dateString.split('-');
    const year = parts[0];
    const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0; // JS months are 0-indexed
    const day = parts[2] ? parseInt(parts[2], 10) : 1;
    
    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

//===================================================================
// 4. Event Listeners
//===================================================================

document.querySelectorAll('.close-button').forEach(button => {
    button.addEventListener('click', () => {
        button.closest('.modal').style.display = 'none';
    });
});

document.getElementById('back-to-track-btn').addEventListener('click', () => {
    document.getElementById('album-modal').style.display = 'none';
    document.getElementById('track-modal').style.display = 'block';
});

document.getElementById('back-to-prev-btn').addEventListener('click', () => {
    document.getElementById('artist-modal').style.display = 'none';
    if (previousModalForArtist) {
        document.getElementById(previousModalForArtist).style.display = 'block';
    }
});

const infoBtn = document.getElementById('info-btn');
const disclaimerPopup = document.getElementById('disclaimer');

infoBtn.addEventListener('click', () => {
    disclaimerPopup.style.display = disclaimerPopup.style.display === 'block' ? 'none' : 'block';
});

window.addEventListener('click', (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }

    if (event.target !== infoBtn && !disclaimerPopup.contains(event.target)) {
        disclaimerPopup.style.display = 'none';
    }
});

const tokenInputBtn = document.getElementById('token-input-btn');
const tokenForm = document.querySelector('.token-form');
const tokenInput = document.getElementById('token-input');
const tokenSubmitBtn = document.getElementById('token-submit-btn');

tokenInputBtn.addEventListener('click', () => {
    tokenForm.style.display = 'flex';
    tokenInputBtn.style.display = 'none';
    tokenInput.focus();
});

tokenSubmitBtn.addEventListener('click', () => {
    const newToken = tokenInput.value.trim();
    if (newToken) {
        token = newToken;
        tokenForm.style.display = 'none';
        tokenInputBtn.style.display = 'block';

        Object.keys(dataCache).forEach(timeRange => {
            dataCache[timeRange] = null;
        });

        displayAllData(document.getElementById('time-range-select').value);
    }
});

document.getElementById('time-range-select').addEventListener('change', (event) => {
    displayAllData(event.target.value);
});

//===================================================================
// 5. Initial Data Load
//===================================================================

displayAllData(document.getElementById('time-range-select').value);