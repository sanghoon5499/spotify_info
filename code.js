//===================================================================
// 1. Configuration & Authorization
//===================================================================

const SPOTIFY_CLIENT_ID = 'bb3df46d5ebc4b5baabcb5701b5208ec';
const SPOTIFY_REDIRECT_URI = 'https://sanghoon5499.github.io/spotify_info/';
const SPOTIFY_SCOPE = 'user-top-read';
const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const PKCE_VERIFIER_KEY = 'spotify_pkce_verifier';
const OAUTH_STATE_KEY = 'spotify_oauth_state';

let token = null;

const dataCache = {
    short_term: null,
    medium_term: null,
    long_term: null
};

function clearDataCache() {
    Object.keys(dataCache).forEach(timeRange => {
        dataCache[timeRange] = null;
    });
}

function generateRandomString(length) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const randomValues = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(randomValues, value => characters[value % characters.length]).join('');
}

async function createCodeChallenge(codeVerifier) {
    const encodedVerifier = new TextEncoder().encode(codeVerifier);
    const digest = await crypto.subtle.digest('SHA-256', encodedVerifier);

    return btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

async function startSpotifyAuthorization() {
    const codeVerifier = generateRandomString(64);
    const state = generateRandomString(32);
    const codeChallenge = await createCodeChallenge(codeVerifier);

    sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
    sessionStorage.setItem(OAUTH_STATE_KEY, state);

    const authorizationUrl = new URL(SPOTIFY_AUTHORIZE_URL);
    authorizationUrl.search = new URLSearchParams({
        response_type: 'code',
        client_id: SPOTIFY_CLIENT_ID,
        scope: SPOTIFY_SCOPE,
        redirect_uri: SPOTIFY_REDIRECT_URI,
        state,
        code_challenge_method: 'S256',
        code_challenge: codeChallenge
    }).toString();

    window.location.assign(authorizationUrl.toString());
}

function clearOAuthCallbackParams() {
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('code');
    cleanUrl.searchParams.delete('state');
    cleanUrl.searchParams.delete('error');

    const query = cleanUrl.searchParams.toString();
    const relativeUrl = `${cleanUrl.pathname}${query ? `?${query}` : ''}${cleanUrl.hash}`;
    window.history.replaceState({}, document.title, relativeUrl);
}

function clearTemporaryOAuthData() {
    sessionStorage.removeItem(PKCE_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
}

async function exchangeAuthorizationCode(code, codeVerifier) {
    const response = await fetch(SPOTIFY_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            client_id: SPOTIFY_CLIENT_ID,
            grant_type: 'authorization_code',
            code,
            redirect_uri: SPOTIFY_REDIRECT_URI,
            code_verifier: codeVerifier
        })
    });

    const responseBody = await response.json();
    if (!response.ok || !responseBody.access_token) {
        throw new Error(responseBody.error_description || 'Spotify authorization failed. Connect again.');
    }

    return responseBody.access_token;
}

async function handleOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const hasOAuthResponse = params.has('code') || params.has('error') || params.has('state');
    if (!hasOAuthResponse) {
        return false;
    }

    const code = params.get('code');
    const authorizationError = params.get('error');
    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

    clearTemporaryOAuthData();
    clearOAuthCallbackParams();

    if (!expectedState || !returnedState || returnedState !== expectedState) {
        throw new Error('Spotify authorization could not be verified. Connect again.');
    }

    if (authorizationError) {
        const message = authorizationError === 'access_denied'
            ? 'Spotify authorization was cancelled.'
            : 'Spotify authorization failed.';
        throw new Error(`${message} Connect again.`);
    }

    if (!code || !codeVerifier) {
        throw new Error('Spotify returned an incomplete authorization response. Connect again.');
    }

    token = await exchangeAuthorizationCode(code, codeVerifier);
    clearDataCache();
    return true;
}

//===================================================================
// 2. API Interaction
//===================================================================

const BASE_API_URL = 'https://api.spotify.com/v1/';

async function fetchWebApi(endpoint) {
    const response = await fetch(`${BASE_API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (response.status === 401) {
        token = null;
        clearDataCache();
        throw new Error('Your Spotify session expired. Connect Spotify again.');
    }

    if (response.status === 403) {
        throw new Error('Spotify did not grant access to this data. Connect Spotify again.');
    }

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 5;
        throw new Error(`Spotify rate limited this request. Try again in ${retryAfter} seconds.`);
    }

    if (!response.ok) {
        throw new Error(`Spotify request failed with status ${response.status}.`);
    }

    return response.json();
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
// 3. Helper Functions
//===================================================================

function msToMinutesAndSeconds(ms) {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown Date';

    const parts = dateString.split('-');
    const year = parts[0];
    const month = parts[1] ? parseInt(parts[1], 10) - 1 : 0;
    const day = parts[2] ? parseInt(parts[2], 10) : 1;

    const date = new Date(year, month, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
}

function showDashboardMessage(message, isError = false) {
    const tracksContainer = document.getElementById('top-tracks-container');
    const artistsContainer = document.getElementById('top-artists-container');
    const messageElement = document.createElement('p');

    messageElement.textContent = message;
    if (isError) {
        messageElement.classList.add('error-text');
    }

    tracksContainer.replaceChildren();
    artistsContainer.replaceChildren(messageElement);
}

//===================================================================
// 4. UI Rendering & Display Logic
//===================================================================

async function displayAllData(timeRange) {
    const tracksContainer = document.getElementById('top-tracks-container');
    const artistsContainer = document.getElementById('top-artists-container');

    if (!token) {
        showDashboardMessage('Connect Spotify to see your data.');
        return;
    }

    tracksContainer.innerHTML = '<p class="loading-text">Loading your top tracks...</p>';
    artistsContainer.innerHTML = '<p class="loading-text">Loading your top artists...</p>';

    try {
        let topTracks;
        let topArtists;

        if (dataCache[timeRange]) {
            topTracks = dataCache[timeRange].tracks;
            topArtists = dataCache[timeRange].artists;
        } else {
            topTracks = await getTopTracks(timeRange);
            topArtists = await getTopArtists(timeRange);
            dataCache[timeRange] = { tracks: topTracks, artists: topArtists };
        }

        if (topTracks.length === 0) {
            tracksContainer.innerHTML = '<p>No top tracks found for this time range.</p>';
        } else {
            tracksContainer.replaceChildren();
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
            artistsContainer.replaceChildren();
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
        console.error('Error fetching Spotify data:', error);
        showDashboardMessage(error.message, true);
    }
}

function showTrackDetails(trackId, topTracks) {
    const track = topTracks.find(item => item.id === trackId);
    if (!track) return;

    const modal = document.getElementById('track-modal');

    document.getElementById('modal-album-art').src = track.album.images[0].url;
    document.getElementById('modal-track-name').textContent = track.name;
    document.getElementById('modal-release-date').textContent = formatDate(track.album.release_date);
    document.getElementById('modal-duration').textContent = msToMinutesAndSeconds(track.duration_ms);

    renderClickableArtists(track.artists, 'modal-artist-name', 'track-modal');

    const explicitBadge = document.getElementById('modal-explicit');
    explicitBadge.style.display = track.explicit ? 'inline-block' : 'none';

    const albumNameElement = document.getElementById('modal-album-name');
    albumNameElement.textContent = track.album.name;
    albumNameElement.onclick = () => showAlbumDetails(track.album, track.artists);

    modal.style.display = 'block';
}

function showAlbumDetails(album, trackArtists) {
    document.getElementById('track-modal').style.display = 'none';

    const modal = document.getElementById('album-modal');

    document.getElementById('modal-album-only-art').src = album.images[0].url;
    document.getElementById('modal-album-only-name').textContent = album.name;
    document.getElementById('modal-album-only-type').textContent = album.album_type;
    document.getElementById('modal-album-only-tracks').textContent = album.total_tracks;
    document.getElementById('modal-album-only-release-date').textContent = formatDate(album.release_date);

    const artistsToUse = album.artists || trackArtists;
    renderClickableArtists(artistsToUse, 'modal-album-only-artist', 'album-modal');

    document.getElementById('modal-album-only-uri').href = album.uri;
    modal.style.display = 'block';
}

let previousModalForArtist = null;

async function showArtistDetails(artistId, fromModalId = null) {
    previousModalForArtist = fromModalId;

    document.getElementById('track-modal').style.display = 'none';
    document.getElementById('album-modal').style.display = 'none';

    try {
        const artist = await getArtist(artistId);
        const modal = document.getElementById('artist-modal');
        const imageElement = document.getElementById('modal-artist-art');

        imageElement.src = artist.images.length > 0
            ? artist.images[0].url
            : 'https://via.placeholder.com/160?text=No+Image';

        document.getElementById('modal-artist-name-title').textContent = artist.name;

        const genresContainer = document.getElementById('modal-artist-genres');
        genresContainer.replaceChildren();
        if (artist.genres && artist.genres.length > 0) {
            artist.genres.forEach(genre => {
                const genreElement = document.createElement('span');
                genreElement.className = 'genre-tag';
                genreElement.textContent = genre;
                genresContainer.appendChild(genreElement);
            });
        } else {
            const emptyGenreElement = document.createElement('span');
            emptyGenreElement.className = 'genre-tag';
            emptyGenreElement.textContent = 'No genres listed';
            genresContainer.appendChild(emptyGenreElement);
        }

        document.getElementById('modal-artist-uri').href = artist.uri;
        document.getElementById('back-to-prev-btn').style.display = fromModalId ? 'inline' : 'none';
        modal.style.display = 'block';
    } catch (error) {
        console.error('Failed to load artist details:', error);
        showDashboardMessage(error.message, true);
    }
}

function renderClickableArtists(artists, targetElementId, currentModalId) {
    const container = document.getElementById(targetElementId);
    container.replaceChildren();

    artists.forEach((artist, index) => {
        const artistElement = document.createElement('span');
        artistElement.textContent = artist.name;
        artistElement.className = 'clickable-artist';
        artistElement.addEventListener('click', () => showArtistDetails(artist.id, currentModalId));
        container.appendChild(artistElement);

        if (index < artists.length - 1) {
            container.appendChild(document.createTextNode(', '));
        }
    });
}

//===================================================================
// 5. Event Listeners
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

const infoButton = document.getElementById('info-btn');
const disclaimerPopup = document.getElementById('disclaimer');

infoButton.addEventListener('click', () => {
    disclaimerPopup.style.display = disclaimerPopup.style.display === 'block' ? 'none' : 'block';
});

window.addEventListener('click', event => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }

    if (event.target !== infoButton && !disclaimerPopup.contains(event.target)) {
        disclaimerPopup.style.display = 'none';
    }
});

document.getElementById('connect-spotify-btn').addEventListener('click', async () => {
    try {
        await startSpotifyAuthorization();
    } catch (error) {
        console.error('Failed to start Spotify authorization:', error);
        showDashboardMessage(error.message, true);
    }
});

document.getElementById('time-range-select').addEventListener('change', event => {
    displayAllData(event.target.value);
});

//===================================================================
// 6. Initialization
//===================================================================

async function initializeApp() {
    try {
        const completedAuthorization = await handleOAuthCallback();
        if (completedAuthorization) {
            await displayAllData(document.getElementById('time-range-select').value);
            return;
        }
    } catch (error) {
        console.error('Spotify authorization error:', error);
        showDashboardMessage(error.message, true);
        return;
    }

    showDashboardMessage('Connect Spotify to see your data.');
}

initializeApp();
