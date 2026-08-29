//===================================================================
// Enable this section to test the Spotify API endpoints independently of the main app functionality.
//===================================================================

// document.getElementById('test-api-btn').addEventListener('click', () => {
//     if (!token || token === 'YOUR_SPOTIFY_ACCESS_TOKEN') {
//         console.warn("⚠️ Please set and save your API key first!");
//         return;
//     }
//     console.log("Button clicked! Triggering diagnostics...");
//     // Uses a hardcoded track ID to test the endpoints independently
//     runApiDiagnostics(token, '4cOdK2wGLETKBW3PvgPWqT'); 
// });



//===================================================================
// 1. Configuration & API Interaction
//===================================================================

let token = 'YOUR_SPOTIFY_ACCESS_TOKEN';
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
    return await res.json();
}

async function getTopTracks(time_range) {
    return (await fetchWebApi(`me/top/tracks?time_range=${time_range}&limit=5`)).items;
}

async function getTopArtists(time_range) {
    return (await fetchWebApi(`me/top/artists?time_range=${time_range}&limit=5`)).items;
}

async function getArtist(artistId) {
    return await fetchWebApi(`artists/${artistId}`);
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

    tracksContainer.innerHTML = '<p class="loading-text">Loading your top tracks...</p>';
    artistsContainer.innerHTML = '<p class="loading-text">Loading your top artists...</p>';

    try {
        let topTracks, topArtists;

        // 1. Check cache first
        if (dataCache[time_range]) {
            topTracks = dataCache[time_range].tracks;
            topArtists = dataCache[time_range].artists;
        } else {
            topTracks = await getTopTracks(time_range);
            topArtists = await getTopArtists(time_range);
            dataCache[time_range] = { tracks: topTracks, artists: topArtists };
        }

        // 2. Render Top Tracks
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

        // 3. Render Top Artists
        if (topArtists.length === 0) {
            artistsContainer.innerHTML = '<p>No top artists found for this time range.</p>';
        } else {
            artistsContainer.innerHTML = '';
            const artistList = document.createElement('ol');
            topArtists.forEach(artist => {
                const listItem = document.createElement('li');
                listItem.textContent = artist.name;
                listItem.dataset.artistId = artist.id; // Saves ID for click
                listItem.classList.add('artist-item');
                artistList.appendChild(listItem);
            });
            artistsContainer.appendChild(artistList);
        }

        // 4. ATTACH LISTENERS FOR BOTH
        // Track Clicks
        document.querySelectorAll('.track-item').forEach(item => {
            item.addEventListener('click', () => {
                const trackId = item.dataset.trackId;
                showTrackDetails(trackId, topTracks);
            });
        });

        // Artist Clicks
        document.querySelectorAll('.artist-item').forEach(item => {
            item.addEventListener('click', () => {
                showArtistDetails(item.dataset.artistId, null); 
            });
        });

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
    
    // The album object inside a track payload usually has its own artists array
    const artists = album.artists ? album.artists.map(a => a.name).join(', ') : trackArtists.map(a => a.name).join(', ');
    const artistsToUse = album.artists ? album.artists : trackArtists;
    renderClickableArtists(artistsToUse, 'modal-album-only-artist', 'album-modal');
    
    // Set up the URI link (Clicking this will try to open the Spotify Desktop App)
    const uriEl = document.getElementById('modal-album-only-uri');
    uriEl.href = album.uri; 

    modal.style.display = "block";
}

let previousModalForArtist = null; // Remembers where to go 'back' to

async function showArtistDetails(artistId, fromModalId) {
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
        span.onclick = () => showArtistDetails(artist.id, currentModalId);
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

// --- Modal Listeners ---
document.getElementById('close-track-modal').addEventListener('click', () => {
    document.getElementById('track-modal').style.display = "none";
});

document.getElementById('close-album-modal').addEventListener('click', () => {
    document.getElementById('album-modal').style.display = "none";
});

// --- Back Button Listener ---
document.getElementById('back-to-track-btn').addEventListener('click', () => {
    document.getElementById('album-modal').style.display = "none";
    document.getElementById('track-modal').style.display = "block";
});

window.addEventListener('click', (event) => {
    const trackModal = document.getElementById('track-modal');
    const albumModal = document.getElementById('album-modal');
    
    // Close whichever modal is currently being clicked outside of
    if (event.target === trackModal) {
        trackModal.style.display = "none";
    } else if (event.target === albumModal) {
        albumModal.style.display = "none";
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
        
        // Clear the cache for the new user
        dataCache.short_term = null;
        dataCache.medium_term = null;
        dataCache.long_term = null;
        
        displayAllData(document.getElementById('time-range-select').value);
    }
});

// --- Time Range Dropdown Listener ---
const timeRangeSelect = document.getElementById('time-range-select');
timeRangeSelect.addEventListener('change', (event) => {
    const selectedTimeRange = event.target.value;
    displayAllData(selectedTimeRange);
});

// --- Modal Listeners (Add these with your existing ones) ---
document.getElementById('close-artist-modal').addEventListener('click', () => {
    document.getElementById('artist-modal').style.display = "none";
});

document.getElementById('back-to-prev-btn').addEventListener('click', () => {
    document.getElementById('artist-modal').style.display = "none";
    if (previousModalForArtist) {
        document.getElementById(previousModalForArtist).style.display = "block";
    }
});

window.addEventListener('click', (event) => {
    const trackModal = document.getElementById('track-modal');
    const albumModal = document.getElementById('album-modal');
    const artistModal = document.getElementById('artist-modal');
    
    if (event.target === trackModal) trackModal.style.display = "none";
    if (event.target === albumModal) albumModal.style.display = "none";
    if (event.target === artistModal) artistModal.style.display = "none";
});

//===================================================================
// 5. Initial Data Load
//===================================================================

displayAllData(document.getElementById('time-range-select').value);


//===================================================================
// 6. API Diagnostic Tool
//===================================================================

async function runApiDiagnostics(token, sampleTrackId) {
    console.log("=========================================");
    console.log("🔍 RUNNING SPOTIFY API DIAGNOSTIC TESTS");
    console.log("=========================================");

    const endpointsToTest = [
        { name: "Current User Profile", path: "me" },
        { name: "Get Single Track (Check for Popularity)", path: `tracks/${sampleTrackId}` },
        { name: "Audio Features (Deprecated Nov 2024)", path: `audio-features/${sampleTrackId}` },
        { name: "Recommendations (Deprecated Nov 2024)", path: `recommendations?seed_tracks=${sampleTrackId}&limit=1` },
        { name: "Check Saved Tracks (Updated 2026 Endpoint)", path: `me/library/contains?ids=${sampleTrackId}` } 
    ];

    for (const endpoint of endpointsToTest) {
        try {
            console.log(`Testing: ${endpoint.name} (/v1/${endpoint.path})`);
            const res = await fetch(`${BASE_API_URL}${endpoint.path}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                console.log(`✅ SUCCESS - Status: ${res.status}`);
                console.log(data);
                
                // Explicitly check for the missing popularity field
                if (endpoint.path.startsWith('tracks/')) {
                    if (data.popularity !== undefined) {
                        console.log(`ℹ️ Popularity value found: ${data.popularity}`);
                    } else {
                        console.warn("⚠️ Popularity field is missing from the track object.");
                    }
                }
            } else {
                console.error(`❌ FAILED - Status: ${res.status} ${res.statusText}`);
                const errorData = await res.json();
                console.error("Error details:", errorData);
            }
        } catch (error) {
            console.error(`🚨 ERROR reaching /v1/${endpoint.path}:`, error.message);
        }
        console.log("-----------------------------------------");
    }
    console.log("🏁 DIAGNOSTICS COMPLETE");
}