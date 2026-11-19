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

const APP_STATES = {
    disconnected: {
        title: 'Connect to Spotify',
        message: 'Authorize this page to load your listening data.'
    },
    connecting: {
        title: 'Connecting to Spotify',
        message: 'Completing authorization in this browser tab.'
    },
    loading: {
        title: 'Loading your listening data',
        message: 'Fetching your top tracks and artists.'
    },
    empty: {
        title: 'No listening data found',
        message: 'Spotify returned no top tracks or artists for this time range.'
    }
};

const elements = {
    appStatus: document.getElementById('app-status'),
    statusTitle: document.getElementById('status-title'),
    statusMessage: document.getElementById('status-message'),
    dashboard: document.getElementById('dashboard-content'),
    tracksContainer: document.getElementById('top-tracks-container'),
    artistsContainer: document.getElementById('top-artists-container'),
    connectButton: document.getElementById('connect-spotify-btn'),
    disconnectButton: document.getElementById('disconnect-spotify-btn'),
    retryButton: document.getElementById('retry-btn'),
    timeRangeSelect: document.getElementById('time-range-select'),
    infoButton: document.getElementById('info-btn'),
    infoPopup: document.getElementById('disclaimer')
};

class AppError extends Error {
    constructor(kind, message) {
        super(message);
        this.kind = kind;
    }
}

let token = null;
let requestVersion = 0;
let previousModalForArtist = null;

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
    let response;
    try {
        response = await fetch(SPOTIFY_TOKEN_URL, {
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
    } catch {
        throw new AppError('authorization', 'Could not reach Spotify to complete authorization. Connect again.');
    }

    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok || !responseBody.access_token) {
        throw new AppError(
            'authorization',
            responseBody.error_description || 'Spotify authorization failed. Connect again.'
        );
    }

    return responseBody.access_token;
}

function hasOAuthResponse() {
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('error') || params.has('state');
}

async function handleOAuthCallback() {
    if (!hasOAuthResponse()) {
        return false;
    }

    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const authorizationError = params.get('error');
    const returnedState = params.get('state');
    const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
    const codeVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);

    clearTemporaryOAuthData();
    clearOAuthCallbackParams();

    if (!expectedState || !returnedState || returnedState !== expectedState) {
        throw new AppError('authorization', 'Spotify authorization could not be verified. Connect again.');
    }

    if (authorizationError) {
        const message = authorizationError === 'access_denied'
            ? 'Spotify authorization was cancelled.'
            : 'Spotify authorization failed.';
        throw new AppError('authorization', `${message} Connect again.`);
    }

    if (!code || !codeVerifier) {
        throw new AppError(
            'authorization',
            'Spotify returned an incomplete authorization response. Connect again.'
        );
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
    let response;
    try {
        response = await fetch(`${BASE_API_URL}${endpoint}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
    } catch {
        throw new AppError('general', 'Could not reach Spotify. Check your connection and try again.');
    }

    if (response.status === 401) {
        token = null;
        clearDataCache();
        throw new AppError('authorization', 'Your Spotify session expired. Connect Spotify again.');
    }

    if (response.status === 403) {
        token = null;
        clearDataCache();
        throw new AppError(
            'authorization',
            'Spotify did not grant access to this data. Check that your account is allowed to use this app.'
        );
    }

    if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After') || 5;
        throw new AppError('rate-limit', `Spotify asked this page to wait ${retryAfter} seconds before trying again.`);
    }

    if (!response.ok) {
        throw new AppError('general', `Spotify returned an unexpected ${response.status} response. Try again.`);
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
// 3. UI State & Helpers
//===================================================================

function setAppState(state, options = {}) {
    const defaultContent = APP_STATES[state] || {};
    const isConnected = Boolean(token);
    const showDashboard = state === 'loaded' || state === 'empty';

    elements.appStatus.dataset.state = state;
    elements.statusTitle.textContent = options.title || defaultContent.title || '';
    elements.statusMessage.textContent = options.message || defaultContent.message || '';
    elements.appStatus.hidden = state === 'loaded';
    elements.dashboard.hidden = !showDashboard;
    elements.connectButton.hidden = isConnected || state === 'connecting';
    elements.connectButton.disabled = state === 'connecting';
    elements.disconnectButton.hidden = !isConnected;
    elements.retryButton.hidden = !options.canRetry;
    elements.timeRangeSelect.disabled = !isConnected || state === 'loading' || state === 'connecting';
}

function showAppError(error) {
    const appError = error instanceof AppError
        ? error
        : new AppError('general', 'Something went wrong while loading Spotify data. Try again.');

    const titles = {
        authorization: 'Spotify connection failed',
        'rate-limit': 'Spotify is temporarily rate limiting requests',
        general: 'Spotify request failed'
    };

    if (!token) {
        clearRenderedData();
    } else {
        closeAllModals();
    }

    setAppState('error', {
        title: titles[appError.kind] || titles.general,
        message: appError.message,
        canRetry: Boolean(token) && appError.kind !== 'authorization'
    });
}

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

function openModal(modal) {
    if (!modal.open) {
        modal.showModal();
    }
}

function closeModal(modal) {
    if (modal.open) {
        modal.close();
    }
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(closeModal);
}

function clearRenderedData() {
    requestVersion += 1;
    elements.tracksContainer.replaceChildren();
    elements.artistsContainer.replaceChildren();
    closeAllModals();

    const textElementIds = [
        'modal-track-name',
        'modal-release-date',
        'modal-duration',
        'modal-artist-name',
        'modal-album-name',
        'modal-album-only-name',
        'modal-album-only-artist',
        'modal-album-only-type',
        'modal-album-only-tracks',
        'modal-album-only-release-date',
        'modal-artist-name-title'
    ];
    textElementIds.forEach(elementId => {
        document.getElementById(elementId).textContent = '';
    });
    document.getElementById('modal-artist-genres').replaceChildren();
    document.getElementById('modal-explicit').style.display = 'none';
    document.getElementById('back-to-prev-btn').hidden = true;

    document.querySelectorAll('.modal img').forEach(image => {
        image.removeAttribute('src');
        image.alt = '';
    });

    document.querySelectorAll('.spotify-link-button').forEach(link => {
        link.removeAttribute('href');
    });

    document.getElementById('modal-album-name').onclick = null;
    previousModalForArtist = null;
}

function disconnectSpotify() {
    token = null;
    clearDataCache();
    clearTemporaryOAuthData();
    clearRenderedData();
    setAppState('disconnected');
}

function renderEmptyState(container, message) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'empty-state';
    emptyMessage.textContent = message;
    container.replaceChildren(emptyMessage);
}

//===================================================================
// 4. Dashboard Rendering
//===================================================================

async function displayAllData(timeRange) {
    if (!token) {
        setAppState('disconnected');
        return;
    }

    const currentRequest = ++requestVersion;
    setAppState('loading');

    try {
        let topTracks;
        let topArtists;

        if (dataCache[timeRange]) {
            topTracks = dataCache[timeRange].tracks;
            topArtists = dataCache[timeRange].artists;
        } else {
            [topTracks, topArtists] = await Promise.all([
                getTopTracks(timeRange),
                getTopArtists(timeRange)
            ]);
            dataCache[timeRange] = { tracks: topTracks, artists: topArtists };
        }

        if (currentRequest !== requestVersion || !token) {
            return;
        }

        renderTopTracks(topTracks);
        renderTopArtists(topArtists);
        setAppState(topTracks.length === 0 && topArtists.length === 0 ? 'empty' : 'loaded');
    } catch (error) {
        if (currentRequest !== requestVersion) {
            return;
        }
        console.error('Error fetching Spotify data:', error);
        showAppError(error);
    }
}

function renderTopTracks(topTracks) {
    if (topTracks.length === 0) {
        renderEmptyState(elements.tracksContainer, 'No top tracks found for this time range.');
        return;
    }

    const trackList = document.createElement('ol');
    topTracks.forEach(track => {
        const listItem = document.createElement('li');
        const itemButton = document.createElement('button');
        const artists = track.artists.map(artist => artist.name).join(', ');

        itemButton.type = 'button';
        itemButton.className = 'list-item-button';
        itemButton.textContent = `${track.name} by ${artists}`;
        itemButton.addEventListener('click', () => showTrackDetails(track.id, topTracks));
        listItem.appendChild(itemButton);
        trackList.appendChild(listItem);
    });

    elements.tracksContainer.replaceChildren(trackList);
}

function renderTopArtists(topArtists) {
    if (topArtists.length === 0) {
        renderEmptyState(elements.artistsContainer, 'No top artists found for this time range.');
        return;
    }

    const artistList = document.createElement('ol');
    topArtists.forEach(artist => {
        const listItem = document.createElement('li');
        const itemButton = document.createElement('button');

        itemButton.type = 'button';
        itemButton.className = 'list-item-button';
        itemButton.textContent = artist.name;
        itemButton.addEventListener('click', () => showArtistDetails(artist.id));
        listItem.appendChild(itemButton);
        artistList.appendChild(listItem);
    });

    elements.artistsContainer.replaceChildren(artistList);
}

function showTrackDetails(trackId, topTracks) {
    const track = topTracks.find(item => item.id === trackId);
    if (!track) return;

    const modal = document.getElementById('track-modal');
    const albumArt = document.getElementById('modal-album-art');

    albumArt.src = track.album.images[0].url;
    albumArt.alt = `${track.album.name} album cover`;
    document.getElementById('modal-track-name').textContent = track.name;
    document.getElementById('modal-release-date').textContent = formatDate(track.album.release_date);
    document.getElementById('modal-duration').textContent = msToMinutesAndSeconds(track.duration_ms);
    renderClickableArtists(track.artists, 'modal-artist-name', 'track-modal');

    document.getElementById('modal-explicit').style.display = track.explicit ? 'inline-block' : 'none';

    const albumNameElement = document.getElementById('modal-album-name');
    albumNameElement.textContent = track.album.name;
    albumNameElement.onclick = () => showAlbumDetails(track.album, track.artists);

    openModal(modal);
}

function showAlbumDetails(album, trackArtists) {
    closeModal(document.getElementById('track-modal'));

    const modal = document.getElementById('album-modal');
    const albumArt = document.getElementById('modal-album-only-art');

    albumArt.src = album.images[0].url;
    albumArt.alt = `${album.name} album cover`;
    document.getElementById('modal-album-only-name').textContent = album.name;
    document.getElementById('modal-album-only-type').textContent = album.album_type;
    document.getElementById('modal-album-only-tracks').textContent = album.total_tracks;
    document.getElementById('modal-album-only-release-date').textContent = formatDate(album.release_date);

    renderClickableArtists(album.artists || trackArtists, 'modal-album-only-artist', 'album-modal');

    document.getElementById('modal-album-only-uri').href = album.uri;
    openModal(modal);
}

async function showArtistDetails(artistId, fromModalId = null) {
    const activeToken = token;
    const activeRequestVersion = requestVersion;
    previousModalForArtist = fromModalId;
    closeModal(document.getElementById('track-modal'));
    closeModal(document.getElementById('album-modal'));

    try {
        const artist = await getArtist(artistId);
        if (!token || token !== activeToken || requestVersion !== activeRequestVersion) {
            return;
        }

        const modal = document.getElementById('artist-modal');
        const imageElement = document.getElementById('modal-artist-art');

        imageElement.src = artist.images.length > 0
            ? artist.images[0].url
            : 'https://via.placeholder.com/160?text=No+Image';
        imageElement.alt = artist.images.length > 0 ? `${artist.name} profile` : '';

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
        document.getElementById('back-to-prev-btn').hidden = !fromModalId;
        openModal(modal);
    } catch (error) {
        if (requestVersion !== activeRequestVersion) {
            return;
        }
        console.error('Failed to load artist details:', error);
        showAppError(error);
    }
}

function renderClickableArtists(artists, targetElementId, currentModalId) {
    const container = document.getElementById(targetElementId);
    container.replaceChildren();

    artists.forEach((artist, index) => {
        const artistButton = document.createElement('button');
        artistButton.type = 'button';
        artistButton.className = 'artist-link';
        artistButton.textContent = artist.name;
        artistButton.addEventListener('click', () => showArtistDetails(artist.id, currentModalId));
        container.appendChild(artistButton);

        if (index < artists.length - 1) {
            container.appendChild(document.createTextNode(', '));
        }
    });
}

//===================================================================
// 5. Event Listeners & Initialization
//===================================================================

document.querySelectorAll('.close-button').forEach(button => {
    button.addEventListener('click', () => closeModal(button.closest('.modal')));
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', event => {
        if (event.target === modal) {
            closeModal(modal);
        }
    });
});

document.getElementById('back-to-track-btn').addEventListener('click', () => {
    closeModal(document.getElementById('album-modal'));
    openModal(document.getElementById('track-modal'));
});

document.getElementById('back-to-prev-btn').addEventListener('click', () => {
    closeModal(document.getElementById('artist-modal'));
    if (previousModalForArtist && token) {
        openModal(document.getElementById(previousModalForArtist));
    }
});

function setInfoPopupOpen(isOpen) {
    elements.infoPopup.hidden = !isOpen;
    elements.infoButton.setAttribute('aria-expanded', String(isOpen));
}

elements.infoButton.addEventListener('click', () => {
    setInfoPopupOpen(elements.infoPopup.hidden);
});

window.addEventListener('click', event => {
    if (!elements.infoPopup.hidden
        && event.target !== elements.infoButton
        && !elements.infoPopup.contains(event.target)) {
        setInfoPopupOpen(false);
    }
});

window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !elements.infoPopup.hidden) {
        setInfoPopupOpen(false);
        elements.infoButton.focus();
    }
});

elements.connectButton.addEventListener('click', async () => {
    setAppState('connecting');
    try {
        await startSpotifyAuthorization();
    } catch (error) {
        console.error('Failed to start Spotify authorization:', error);
        showAppError(new AppError('authorization', 'Could not start Spotify authorization. Try again.'));
    }
});

elements.disconnectButton.addEventListener('click', disconnectSpotify);
elements.retryButton.addEventListener('click', () => displayAllData(elements.timeRangeSelect.value));
elements.timeRangeSelect.addEventListener('change', event => displayAllData(event.target.value));

async function initializeApp() {
    if (hasOAuthResponse()) {
        setAppState('connecting');
    }

    try {
        const completedAuthorization = await handleOAuthCallback();
        if (completedAuthorization) {
            await displayAllData(elements.timeRangeSelect.value);
            return;
        }
    } catch (error) {
        console.error('Spotify authorization error:', error);
        showAppError(error);
        return;
    }

    setAppState('disconnected');
}

initializeApp();
