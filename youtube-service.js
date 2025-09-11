// Music App JavaScript
class MusicApp {
    constructor() {
        this.currentPage = 'home';
        this.activeTab = 'home';
        this.nowPlaying = null;
        this.isPlaying = false;
        this.songs = [];
        this.recentSongs = [];
        this.recentlyPlayed = []; // Track actually played songs
        this.playlists = [];
        
        // Load recently played songs from localStorage
        this.loadRecentlyPlayed();
        this.currentTime = 0;
        this.duration = 0;
        this.progressInterval = null;
        this.volume = 50; // Default volume 50%
        this.currentPlaylist = null; // Track which playlist is currently playing
        this.currentPlaylistSongs = []; // Songs in current playlist context
        this.isCleanedUp = false; // Track if the app is being cleaned up
        
        // Library filter state
        this.libraryFilter = 'default'; // 'default', 'recent', 'title', 'artist'
        
        // Localization
        this.locale = 'en';
        this.translations = {};
        
        // Debug configuration
        this.debug = false;
        
        // Memory management
        this.eventListeners = new Map(); // Track all event listeners
        this.timeouts = new Set(); // Track all timeouts
        this.intervals = new Set(); // Track all intervals
        this.themeObserver = null; // Track theme mutation observer
        this.mediaQueryListener = null; // Track media query listener
        this.volumeUpdateThrottle = null; // Throttle volume updates during drag
        
        // YouTube service
        this.youtubeService = new YouTubeService();
        
        this.init();
    }

    async init() {
        await this.loadDebugConfig();
        await this.loadLocale();
        this.localizeHTML();
        this.setupThemeDetection();
        this.setupNUI();
        this.setupEventListeners();
        this.loadSongs();
        this.setupCleanup();
        this.setupThemeHandling();
    }

    async loadDebugConfig() {
        try {
            const response = await this.callNUI('getDebugConfig', {});
            if (response && typeof response.debug === 'boolean') {
                this.debug = response.debug;
            }
        } catch (error) {
            // If debug config fails to load, keep debug as false (default)
            this.debug = false;
        }
        
        // Pass debug configuration to YouTube service
        if (this.youtubeService && typeof this.youtubeService.setDebug === 'function') {
            this.youtubeService.setDebug(this.debug);
        }
    }

    debugLog(...args) {
        if (this.debug) {
            console.log(...args);
        }
    }

    debugWarn(...args) {
        if (this.debug) {
            console.warn(...args);
        }
    }

    debugError(...args) {
        if (this.debug) {
            console.error(...args);
        }
    }

    async loadLocale() {
        try {
            const response = await fetch(`./locales/${this.locale}.json`);
            if (response.ok) {
                this.translations = await response.json();
                this.debugLog('Locale loaded:', this.locale);
            } else {
                this.debugWarn('Failed to load locale, using fallback');
                this.translations = {};
            }
        } catch (error) {
            this.debugError('Error loading locale:', error);
            this.translations = {};
        }
    }

    t(key, params = {}) {
        const keys = key.split('.');
        let value = this.translations;
        
        for (const k of keys) {
            if (value && typeof value === 'object' && k in value) {
                value = value[k];
            } else {
                this.debugWarn(`Translation key not found: ${key}`);
                return key; // Return the key as fallback
            }
        }
        
        if (typeof value === 'string') {
            // Replace parameters in the string
            return value.replace(/\{(\w+)\}/g, (match, param) => {
                return params[param] !== undefined ? params[param] : match;
            });
        }
        
        return key; // Return the key as fallback
    }

    localizeHTML() {
        // Localize all elements with data-locale attributes
        const elements = document.querySelectorAll('[data-locale]');
        elements.forEach(element => {
            const localeKey = element.getAttribute('data-locale');
            if (localeKey) {
                if (element.tagName === 'INPUT' && element.type === 'text') {
                    element.placeholder = this.t(localeKey);
                } else {
                    element.textContent = this.t(localeKey);
                }
            }
        });

        // Localize search placeholder
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.placeholder = this.t('pages.search.placeholder');
        }
    }

    setupEventListeners() {
        // Bottom navigation
        const navItems = document.querySelectorAll('.nav-item');
        this.addEventListenerToElements(navItems, 'click', (e) => {
            const tab = e.currentTarget.dataset.tab;
            this.setActiveTab(tab);
        });

        // Category navigation
        const categoryItems = document.querySelectorAll('.category-item');
        this.addEventListenerToElements(categoryItems, 'click', (e) => {
            const page = e.currentTarget.dataset.page;
            this.navigateToPage(page);
        });

        // Back buttons
        const backButtons = document.querySelectorAll('.back-button');
        this.addEventListenerToElements(backButtons, 'click', (e) => {
            const backTo = e.currentTarget.dataset.back;
            this.navigateToPage(backTo);
        });

        // Add song button
        const addSongBtn = document.getElementById('addSongBtn');
        if (addSongBtn) {
            this.addEventListener(addSongBtn, 'click', () => {
                this.showAddSongContextMenu();
            });
        }

        // Add playlist button
        const addPlaylistBtn = document.getElementById('addPlaylistBtn');
        if (addPlaylistBtn) {
            this.addEventListener(addPlaylistBtn, 'click', () => {
                this.showCreatePlaylistDialog();
            });
        }

        // Library filter button
        const libraryFilterBtn = document.getElementById('libraryFilterBtn');
        if (libraryFilterBtn) {
            this.addEventListener(libraryFilterBtn, 'click', () => {
                this.showLibraryFilterMenu();
            });
        }

        // Library search input
        const librarySearchInput = document.getElementById('librarySearchInput');
        if (librarySearchInput) {
            this.addEventListener(librarySearchInput, 'input', (e) => {
                this.handleLibrarySearch(e.target.value);
            });
        }


        // Now playing controls
        const nowPlayingToggle = document.getElementById('nowPlayingToggle');
        if (nowPlayingToggle) {
            this.addEventListener(nowPlayingToggle, 'click', (e) => {
                e.stopPropagation();
                this.togglePlay();
            });
        }

        const nowPlayingBar = document.getElementById('nowPlayingBar');
        if (nowPlayingBar) {
            this.addEventListener(nowPlayingBar, 'click', () => {
                this.openFullPlayer();
            });
        }

        // Full player controls
        const closeFullPlayer = document.getElementById('closeFullPlayer');
        if (closeFullPlayer) {
            this.addEventListener(closeFullPlayer, 'click', () => {
                this.closeFullPlayer();
            });
        }

        const fullPlayerToggle = document.getElementById('fullPlayerToggle');
        if (fullPlayerToggle) {
            this.addEventListener(fullPlayerToggle, 'click', () => {
                this.togglePlay();
            });
        }

        const prevButton = document.getElementById('prevButton');
        if (prevButton) {
            this.addEventListener(prevButton, 'click', () => {
                this.playPrevious();
            });
        }

        const nextButton = document.getElementById('nextButton');
        if (nextButton) {
            this.addEventListener(nextButton, 'click', () => {
                this.playNext();
            });
        }

        // Close full player on overlay click
        const fullScreenPlayer = document.getElementById('fullScreenPlayer');
        if (fullScreenPlayer) {
            this.addEventListener(fullScreenPlayer, 'click', (e) => {
                if (e.target.id === 'fullScreenPlayer') {
                    this.closeFullPlayer();
                }
            });
        }

        // Volume control
        const volumeBar = document.querySelector('.volume-bar');
        if (volumeBar) {
            this.addEventListener(volumeBar, 'click', (e) => {
                this.handleVolumeClick(e);
            });
            
            // Make volume bar draggable
            this.setupVolumeDragging(volumeBar);
        }

        // Playlist action buttons
        const playPlaylistBtn = document.getElementById('playPlaylistBtn');
        if (playPlaylistBtn) {
            this.addEventListener(playPlaylistBtn, 'click', () => {
                this.playPlaylist();
            });
        }

        const shufflePlaylistBtn = document.getElementById('shufflePlaylistBtn');
        if (shufflePlaylistBtn) {
            this.addEventListener(shufflePlaylistBtn, 'click', () => {
                this.shufflePlaylist();
            });
        }

        // Playlist context menu
        const playlistContextBtn = document.getElementById('playlistContextBtn');
        if (playlistContextBtn) {
            this.addEventListener(playlistContextBtn, 'click', () => {
                this.showPlaylistContextMenu();
            });
        }



        // Keyboard volume control
        this.addEventListener(document, 'keydown', (e) => {
            if (document.getElementById('fullScreenPlayer').style.display === 'flex') {
                if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    this.adjustVolume(5);
                } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
                    e.preventDefault();
                    this.adjustVolume(-5);
                }
            }
        });
    }

    setupNUI() {
        // Check if we're in the actual game environment
        const isInGame = !!(window.invokeNative);

        // NUI functions with proper LB Phone integration
        window.fetchNui = window.fetchNui || ((eventName, data) => {
            this.debugLog('Using MOCK fetchNui - this should only happen in development mode');
            this.debugLog('Mock fetchNui:', eventName, data);
            
        // Mock responses for different events
        switch (eventName) {
            case 'getSongs':
                return Promise.resolve({
                    success: true,
                    songs: []
                });
            case 'addSong':
                return Promise.resolve({
                    success: true,
                    songs: []
                });
            case 'deleteSong':
                return Promise.resolve({
                    success: true,
                    songs: []
                });
                case 'playSound':
                    return Promise.resolve({});
                case 'stopSound':
                    return Promise.resolve({});
                case 'pauseSound':
                    return Promise.resolve({});
                case 'resumeSound':
                    return Promise.resolve({});
                case 'changeVolume':
                    return Promise.resolve({});
                case 'updatePlaylist':
                    return Promise.resolve({
                        success: true,
                        message: 'Playlist updated successfully'
                    });
                case 'deletePlaylist':
                    return Promise.resolve({
                        success: true,
                        message: 'Playlist deleted successfully'
                    });
            case 'getPlaylists':
                return Promise.resolve({
                    success: true,
                    playlists: []
                });
                default:
                    return Promise.resolve({
                        success: true,
                        message: 'Mock response'
                    });
            }
        });

        // Phone notification system is handled via NUI callbacks

        // Components with fallbacks
        window.components = window.components || {
            setPopUp: (data) => {
                this.debugLog('Mock setPopUp:', data);
                // In development mode, just log and simulate the first non-cancel button
                if (data.buttons && data.buttons.length > 0) {
                    const confirmButton = data.buttons.find(btn => btn.title !== this.t('actions.cancel'));
                    if (confirmButton && confirmButton.cb) {
                        // Simulate user input if there's an input field
                        if (data.input && data.input.onChange) {
                            data.input.onChange('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
                        }
                        confirmButton.cb();
                    }
                }
            },
            setContextMenu: (data) => {
                this.debugLog('Mock setContextMenu:', data);
                // In development mode, just log and simulate the first button
                if (data.buttons && data.buttons.length > 0) {
                    const firstButton = data.buttons[0];
                    if (firstButton && firstButton.cb) {
                        firstButton.cb();
                    }
                }
            }
        };

        // Message listener is now set up in setupCleanup()
        
        // Add cleanup for resource shutdown
        this.setupResourceCleanup();
    }
    
    setupResourceCleanup() {
        // Listen for resource shutdown
        this.addEventListener(window, 'beforeunload', () => {
            this.cleanup();
        });
        
        // Listen for visibility change (when resource is being stopped)
        this.addEventListener(document, 'visibilitychange', () => {
            if (document.hidden) {
                this.cleanup();
            }
        });
    }
    
    cleanup() {
        // Mark as cleaned up to prevent further operations
        this.isCleanedUp = true;
        
        // Stop any ongoing operations
        this.isPlaying = false;
        this.nowPlaying = null;
        
        // Clear any intervals or timeouts
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        // Remove event listeners
        window.removeEventListener('beforeunload', this.cleanup);
        document.removeEventListener('visibilitychange', this.cleanup);
    }

    // NUI callback handler
    callNUI(eventName, data = {}) {
        return new Promise((resolve, reject) => {
            // Don't make calls if the app is being cleaned up
            if (this.isCleanedUp) {
                reject(new Error('App is being cleaned up'));
                return;
            }
            
            // Check if we're in the game environment
            if (window.invokeNative) {
                // Use proper NUI callback system
                const resourceName = window.GetParentResourceName ? window.GetParentResourceName() : 'lb-musicapp';
                
                // Check if the global scope is shutting down
                if (typeof window === 'undefined' || !window.fetch) {
                    reject(new Error('Global scope is shutting down'));
                    return;
                }
                
                // Send the NUI callback with timeout and proper error handling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
                
                fetch(`https://${resourceName}/${eventName}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                    },
                    body: JSON.stringify(data),
                    signal: controller.signal
                }).then(res => {
                    clearTimeout(timeoutId);
                    if (!res.ok) {
                        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                    }
                    return res.json();
                }).then(resolve).catch(error => {
                    clearTimeout(timeoutId);
                    // Don't log errors if the global scope is shutting down or if it's a fetch error during cleanup
                    if (error.name !== 'AbortError' && 
                        !error.message.includes('shutting down') && 
                        !error.message.includes('Failed to fetch')) {
                        this.debugError(`NUI callback error for ${eventName}:`, error);
                    }
                    reject(error);
                });
            } else {
                // Fallback to mock fetchNui for development
                window.fetchNui(eventName, data).then(resolve).catch(reject);
            }
        });
    }

    setActiveTab(tab) {
        this.activeTab = tab;
        
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

        // Show corresponding page
        this.showPage(tab);
    }

    navigateToPage(page) {
        this.currentPage = page;
        this.showPage(page);
    }

    showPage(pageId) {
        // Hide all pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.remove('active');
        });

        // Show target page
        const targetPage = document.getElementById(`${pageId}Page`);
        if (targetPage) {
            targetPage.classList.add('active');
            
        }
    }

    async loadSongs() {
        try {
            // Show loading state for library
            const libraryContainer = document.getElementById('librarySongsList');
            if (libraryContainer) {
                this.showSkeletonLoading(libraryContainer, 3);
            }
            
            const response = await this.callNUI('getSongs', {});
            if (response && response.success) {
                this.songs = response.songs || [];
                // Recent songs are already loaded from localStorage in constructor
                // Just ensure the display is updated
                this.recentSongs = this.recentlyPlayed.slice(0, 3);
                this.renderLibrary();
                this.renderRecentSongs();
                this.renderSongsPage();
                this.renderArtistsPage();
            } else {
                throw new Error('Failed to load songs data');
            }
            
            // Load playlists
            const playlistsResponse = await this.callNUI('getPlaylists', {});
            if (playlistsResponse && playlistsResponse.success) {
                this.playlists = playlistsResponse.playlists || [];
            }
            
            // Load saved playlists from localStorage (overrides server data)
            this.loadPlaylists();
            
            // Load saved covers from localStorage
            this.loadPlaylistCovers();
            this.renderPlaylistsPage();
            
            // Load current volume
            const dataResponse = await this.callNUI('getData', {});
            if (dataResponse && dataResponse.volume) {
                this.volume = dataResponse.volume;
            }
        } catch (error) {
            this.debugError('Failed to load songs:', error);
            // Failed to load library - no notification
            
            // Show empty state on error
            const libraryContainer = document.getElementById('librarySongsList');
            if (libraryContainer) {
                libraryContainer.innerHTML = `<div class="empty-state"><p>${this.t('pages.library.failedToLoad')}</p></div>`;
            }
        }
    }

    renderLibrary() {
        const container = document.getElementById('librarySongsList');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (this.songs.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>${this.t('pages.library.empty')}</p></div>`;
            return;
        }

        // Get sorted songs based on current filter
        const sortedSongs = this.getSortedSongs();
        const html = sortedSongs.map((song, index) => {
            // Find the original index in the main songs array
            const originalIndex = this.songs.findIndex(s => s.url === song.url);
            return `
            <div class="song-item" data-index="${originalIndex}">
                <div class="song-thumbnail">
                    <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                </div>
                <div class="song-info">
                    <h3 class="song-title">${this.truncateText(song.title, 10)}</h3>
                    <p class="song-artist">${this.truncateText(song.artist, 25)}</p>
                </div>
                <button class="song-options-button" data-index="${originalIndex}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="1" fill="currentColor"/>
                        <circle cx="19" cy="12" r="1" fill="currentColor"/>
                        <circle cx="5" cy="12" r="1" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `;
        }).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const songItems = container.querySelectorAll('.song-item');
        const songOptionsButtons = container.querySelectorAll('.song-options-button');
        
        this.addEventListenerToElements(songItems, 'click', (e) => {
            if (!e.target.closest('.song-options-button')) {
                const index = parseInt(e.currentTarget.dataset.index);
                this.playSong(this.songs[index]);
            }
        });

        this.addEventListenerToElements(songOptionsButtons, 'click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index);
            this.showSongContextMenu(this.songs[index], index);
        });
    }

    renderRecentSongs() {
        const container = document.getElementById('recentSongsList');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (this.recentSongs.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>No recently played songs</p></div>`;
            return;
        }

        const html = this.recentSongs.map((song, index) => `
            <div class="recent-song-item" data-index="${index}">
                <div class="recent-song-thumbnail">
                    <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                </div>
                <div class="recent-song-info">
                    <h3 class="recent-song-title">${this.truncateText(song.title, 10)}</h3>
                    <p class="recent-song-artist">${this.truncateText(song.artist, 25)}</p>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const recentSongItems = container.querySelectorAll('.recent-song-item');
        this.addEventListenerToElements(recentSongItems, 'click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            this.playSong(this.recentSongs[index]);
        });
    }

    renderSongsPage() {
        const container = document.querySelector('#songsPage .songs-list');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (this.songs.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>${this.t('pages.songs.empty')}</p></div>`;
            return;
        }

        const html = this.songs.map((song, index) => `
            <div class="song-item" data-index="${index}">
                <div class="song-thumbnail">
                    <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                </div>
                <div class="song-info">
                    <h3 class="song-title">${this.truncateText(song.title, 10)}</h3>
                    <p class="song-artist">${this.truncateText(song.artist, 25)}</p>
                </div>
                <button class="song-options-button" data-index="${index}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <circle cx="12" cy="12" r="1" fill="currentColor"/>
                        <circle cx="19" cy="12" r="1" fill="currentColor"/>
                        <circle cx="5" cy="12" r="1" fill="currentColor"/>
                    </svg>
                </button>
            </div>
        `).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const songItems = container.querySelectorAll('.song-item');
        const songOptionsButtons = container.querySelectorAll('.song-options-button');
        
        this.addEventListenerToElements(songItems, 'click', (e) => {
            if (!e.target.closest('.song-options-button')) {
                const index = parseInt(e.currentTarget.dataset.index);
                this.playSong(this.songs[index]);
            }
        });

        this.addEventListenerToElements(songOptionsButtons, 'click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index);
            this.showSongContextMenu(this.songs[index], index);
        });
    }

    // Helper function to normalize artist names for compilation
    normalizeArtistName(artistName) {
        if (!artistName) return '';
        
        // Convert to lowercase for comparison
        let normalized = artistName.toLowerCase().trim();
        
        // Remove common suffixes and variations
        normalized = normalized
            .replace(/\s*-\s*topic$/i, '')           // Remove "- Topic"
            .replace(/\s*vevo$/i, '')                 // Remove "VEVO"
            .replace(/\s*official$/i, '')             // Remove "Official"
            .replace(/\s*channel$/i, '')              // Remove "Channel"
            .replace(/\s*music$/i, '')                // Remove "Music"
            .replace(/\s*records$/i, '')              // Remove "Records"
            .replace(/\s*entertainment$/i, '')        // Remove "Entertainment"
            .replace(/\s*\[.*?\]$/g, '')              // Remove [brackets] content
            .replace(/\s*\(.*?\)$/g, '')              // Remove (parentheses) content
            .trim();
        
        return normalized;
    }

    renderArtistsPage() {
        const container = document.querySelector('#artistsPage .artists-list');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (this.songs.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>${this.t('pages.artists.empty')}</p></div>`;
            return;
        }

        // Extract and compile artists with similar names
        const artists = [];
        const artistMap = new Map();
        
        this.songs.forEach(song => {
            if (!song.artist) return;
            
            const normalizedName = this.normalizeArtistName(song.artist);
            const originalName = song.artist;
            
            if (!artistMap.has(normalizedName)) {
                artistMap.set(normalizedName, {
                    name: originalName, // Keep the most common/clean version
                    normalizedName: normalizedName,
                    thumbnail: song.thumbnail,
                    songCount: 1,
                    allVariations: [originalName]
                });
            } else {
                const artist = artistMap.get(normalizedName);
                artist.songCount++;
                
                // Add variation if not already present
                if (!artist.allVariations.includes(originalName)) {
                    artist.allVariations.push(originalName);
                }
                
                // Update the display name to the shortest/cleanest version
                if (originalName.length < artist.name.length && 
                    !originalName.toLowerCase().includes('topic') && 
                    !originalName.toLowerCase().includes('vevo')) {
                    artist.name = originalName;
                }
            }
        });

        artists.push(...artistMap.values());

        if (artists.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>${this.t('pages.artists.empty')}</p></div>`;
            return;
        }

        const html = artists.map((artist, index) => `
            <div class="artist-item" data-artist="${artist.name}">
                <div class="artist-avatar">
                    <img src="${artist.thumbnail}" alt="${artist.name}" />
                </div>
                <div class="artist-info">
                    <h3 class="artist-name">${this.truncateText(artist.name, 30)}</h3>
                    <p class="artist-role">${this.t('pages.artists.role')}</p>
                </div>
                <svg class="artist-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
        `).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const artistItems = container.querySelectorAll('.artist-item');
        this.addEventListenerToElements(artistItems, 'click', (e) => {
            const artistName = e.currentTarget.dataset.artist;
            this.navigateToArtistPage(artistName);
        });
    }

    navigateToArtistPage(artistName) {
        // Store the current artist for the artist detail page
        this.currentArtist = artistName;
        this.renderArtistDetailPage();
        this.navigateToPage('artistDetail');
    }

    renderPlaylistsPage() {
        const container = document.querySelector('#albumsPage .albums-list');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (this.playlists.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>${this.t('pages.albums.empty')}</p></div>`;
            return;
        }

        const html = this.playlists.map((playlist, index) => `
            <div class="playlist-item" data-playlist-id="${playlist.id}">
                <div class="playlist-cover">
                    ${playlist.cover ? 
                        `<img src="${playlist.cover}" alt="${playlist.name}" />` :
                        `<div class="playlist-icon">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>`
                    }
                </div>
                <div class="playlist-info">
                    <h3 class="playlist-name">${this.truncateText(playlist.name, 25)}</h3>
                    <p class="playlist-count">${playlist.songs.length === 1 ? this.t('music.songCount', {count: playlist.songs.length}) : this.t('music.songCountPlural', {count: playlist.songs.length})}</p>
                </div>
                <svg class="playlist-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 18L15 12L9 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </div>
        `).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const playlistItems = container.querySelectorAll('.playlist-item');
        this.addEventListenerToElements(playlistItems, 'click', (e) => {
            const playlistId = e.currentTarget.dataset.playlistId;
            this.navigateToPlaylistPage(playlistId);
        });
    }

    navigateToPlaylistPage(playlistId) {
        // Store the current playlist for the playlist detail page
        this.currentPlaylist = this.playlists.find(p => p.id === playlistId);
        this.renderPlaylistDetailPage();
        this.navigateToPage('playlistDetail');
    }

    renderArtistDetailPage() {
        if (!this.currentArtist) return;

        // Update page title
        document.getElementById('artistDetailTitle').textContent = this.currentArtist;

        // Get artist's songs from all variations (compiled)
        const normalizedCurrentArtist = this.normalizeArtistName(this.currentArtist);
        const artistSongs = this.songs.filter(song => {
            const normalizedSongArtist = this.normalizeArtistName(song.artist);
            return normalizedSongArtist === normalizedCurrentArtist;
        });
        
        // Update banner
        const bannerImage = document.getElementById('artistBannerImage');
        const bannerName = document.getElementById('artistBannerName');
        
        if (artistSongs.length > 0) {
            bannerImage.src = artistSongs[0].thumbnail;
            bannerName.textContent = this.currentArtist;
        }

        // Render artist's songs
        const container = document.getElementById('artistSongsList');
        
        if (artistSongs.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No songs available</p></div>';
            return;
        }

        const html = artistSongs.map((song, index) => {
            const originalIndex = this.songs.findIndex(s => s.url === song.url);
            return `
                <div class="song-item" data-index="${originalIndex}">
                    <div class="song-thumbnail">
                        <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                    </div>
                    <div class="song-info">
                        <h3 class="song-title">${this.truncateText(song.title, 10)}</h3>
                        <p class="song-artist">${this.truncateText(song.artist, 25)}</p>
                    </div>
                    <button class="song-options-button" data-index="${originalIndex}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="1" fill="currentColor"/>
                            <circle cx="19" cy="12" r="1" fill="currentColor"/>
                            <circle cx="5" cy="12" r="1" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const songItems = container.querySelectorAll('.song-item');
        const songOptionsButtons = container.querySelectorAll('.song-options-button');
        
        this.addEventListenerToElements(songItems, 'click', (e) => {
            if (!e.target.closest('.song-options-button')) {
                const index = parseInt(e.currentTarget.dataset.index);
                this.playSong(this.songs[index]);
            }
        });

        this.addEventListenerToElements(songOptionsButtons, 'click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index);
            this.showSongContextMenu(this.songs[index], index);
        });
    }

    showAddSongContextMenu() {
        window.components.setContextMenu({
            title: this.t('actions.addMusic'),
            buttons: [
                {
                    title: this.t('actions.importSong'),
                    color: 'blue',
                    cb: () => {
                        this.showAddSongDialog();
                    }
                }
            ]
        });
    }

    showLibraryFilterMenu() {
        window.components.setContextMenu({
            title: 'Sort Library',
            buttons: [
                {
                    title: 'Recently Added',
                    color: this.libraryFilter === 'recent' ? 'green' : 'blue',
                    cb: () => {
                        this.setLibraryFilter('recent');
                    }
                },
                {
                    title: 'Artist A-Z',
                    color: this.libraryFilter === 'artist' ? 'green' : 'blue',
                    cb: () => {
                        this.setLibraryFilter('artist');
                    }
                }
            ]
        });
    }

    setLibraryFilter(filter) {
        this.libraryFilter = filter;
        this.renderLibrary();
        this.debugLog('Library filter changed to:', filter);
    }

    getSortedSongs() {
        const songs = [...this.songs];
        
        switch (this.libraryFilter) {
            case 'recent':
                // Show recently added first (reverse order)
                return songs.reverse();
            case 'title':
                // Sort by title A-Z
                return songs.sort((a, b) => {
                    const titleA = (a.title || '').toLowerCase();
                    const titleB = (b.title || '').toLowerCase();
                    return titleA.localeCompare(titleB);
                });
            case 'artist':
                // Sort by artist A-Z
                return songs.sort((a, b) => {
                    const artistA = (a.artist || '').toLowerCase();
                    const artistB = (b.artist || '').toLowerCase();
                    return artistA.localeCompare(artistB);
                });
            default:
                // Default order (as received from server)
                return songs;
        }
    }

    showAddSongDialog() {
        window.components.setPopUp({
            title: this.t('dialogs.addMusic.title'),
            description: this.t('dialogs.addMusic.description'),
            input: {
                placeholder: this.t('dialogs.addMusic.placeholder'),
                value: '',
                onChange: (value) => {
                    window.tempSongUrl = value;
                }
            },
            buttons: [
                {
                    title: this.t('actions.cancel'),
                    color: 'red',
                    cb: () => {
                        this.debugLog('Add song cancelled');
                    }
                },
                {
                    title: this.t('actions.addSong'),
                    color: 'blue',
                    cb: async () => {
                        const songUrl = window.tempSongUrl;
                        if (songUrl && songUrl.trim()) {
                            await this.addSongToLibrary(songUrl.trim());
                        } else {
                            this.showErrorNotification(this.t('notifications.pleaseEnterUrl'));
                        }
                    }
                }
            ]
        });
    }



    showCreatePlaylistDialog() {
        window.components.setPopUp({
            title: this.t('dialogs.createPlaylist.title'),
            description: this.t('dialogs.createPlaylist.description'),
            input: {
                placeholder: this.t('dialogs.createPlaylist.placeholder'),
                value: '',
                maxLength: 10,
                onChange: (value) => {
                    // Limit to 10 characters
                    if (value.length <= 10) {
                        window.tempPlaylistName = value;
                    }
                }
            },
            buttons: [
                {
                    title: this.t('actions.cancel'),
                    color: 'red',
                    cb: () => {
                        this.debugLog('Create playlist cancelled');
                    }
                },
                {
                    title: this.t('actions.create'),
                    color: 'green',
                    cb: () => {
                        const playlistName = window.tempPlaylistName;
                        if (playlistName && playlistName.trim()) {
                            const trimmedName = playlistName.trim();
                            if (trimmedName.length <= 10) {
                                this.createPlaylist(trimmedName);
                            } else {
                                // Playlist name too long - no notification
                            }
                        } else {
                            this.showErrorNotification(this.t('notifications.pleaseEnterPlaylistName'));
                        }
                    }
                }
            ]
        });
    }

    createPlaylist(name) {
        const newPlaylist = {
            id: Date.now().toString(),
            name: name,
            songs: [],
            createdAt: new Date().toISOString()
        };
        
        this.playlists.push(newPlaylist);
        
        // Save playlists to localStorage
        this.savePlaylists();
        
        this.renderPlaylistsPage();
        this.debugLog('Created playlist:', newPlaylist);
    }

    renderPlaylistDetailPage() {
        if (!this.currentPlaylist) return;

        // Update page title
        document.getElementById('playlistDetailTitle').textContent = this.truncateText(this.currentPlaylist.name, 10);

        // Update header info
        document.getElementById('playlistHeaderCount').textContent = 
            `${this.currentPlaylist.songs.length} song${this.currentPlaylist.songs.length !== 1 ? 's' : ''}`;

        // Update cover image if it exists
        if (this.currentPlaylist.cover) {
            this.updatePlaylistCoverDisplay(this.currentPlaylist.cover);
        } else {
            // Reset to default icon if no cover
            const coverElement = document.querySelector('.playlist-cover-large');
            if (coverElement) {
                coverElement.innerHTML = `
                    <div class="playlist-cover-gradient"></div>
                    <div class="playlist-icon-large">
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z" fill="currentColor"/>
                        </svg>
                    </div>
                    <div class="playlist-cover-shine"></div>
                `;
            }
        }

        // Render playlist songs
        const container = document.getElementById('playlistSongsList');
        
        if (this.currentPlaylist.songs.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No songs in this playlist</p></div>';
            return;
        }

        const html = this.currentPlaylist.songs.map((song, index) => {
            const originalIndex = this.songs.findIndex(s => s.url === song.url);
            return `
                <div class="song-item" data-index="${originalIndex}" data-playlist-index="${index}">
                    <div class="song-thumbnail">
                        <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                    </div>
                    <div class="song-info">
                        <h3 class="song-title">${this.truncateText(song.title, 10)}</h3>
                        <p class="song-artist">${this.truncateText(song.artist, 25)}</p>
                    </div>
                    <button class="song-options-button" data-index="${originalIndex}" data-playlist-index="${index}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="1" fill="currentColor"/>
                            <circle cx="19" cy="12" r="1" fill="currentColor"/>
                            <circle cx="5" cy="12" r="1" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        container.innerHTML = html;

        // Add event listeners with proper tracking
        const songItems = container.querySelectorAll('.song-item');
        const songOptionsButtons = container.querySelectorAll('.song-options-button');
        
        this.addEventListenerToElements(songItems, 'click', (e) => {
            if (!e.target.closest('.song-options-button')) {
                const index = parseInt(e.currentTarget.dataset.index);
                this.playSong(this.songs[index], this.currentPlaylist);
            }
        });

        this.addEventListenerToElements(songOptionsButtons, 'click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index);
            const playlistIndex = parseInt(e.currentTarget.dataset.playlistIndex);
            this.showPlaylistSongContextMenu(this.songs[index], index, playlistIndex);
        });
    }

    showAddToPlaylistMenu(song, index) {
        if (this.playlists.length === 0) {
            return;
        }

        const playlistButtons = this.playlists.map(playlist => ({
            title: playlist.name,
            color: 'blue',
            cb: () => {
                this.addSongToPlaylist(song, playlist.id);
            }
        }));

        window.components.setContextMenu({
            title: `Add "${song.title}" to playlist`,
            buttons: playlistButtons
        });
    }

    addSongToPlaylist(song, playlistId) {
        const playlist = this.playlists.find(p => p.id === playlistId);
        if (playlist) {
            // Check if song is already in playlist
            const songExists = playlist.songs.some(s => s.url === song.url);
            if (!songExists) {
                playlist.songs.push(song);
                this.debugLog('Added song to playlist:', { song: song.title, playlist: playlist.name });
                
                // Save playlists to localStorage
                this.savePlaylists();
                
                // Refresh playlists page and playlist detail page if open
                this.renderPlaylistsPage();
                if (this.currentPlaylist && this.currentPlaylist.id === playlistId) {
                    this.renderPlaylistDetailPage();
                }
            }
        }
    }

    playPlaylist() {
        if (!this.currentPlaylist || this.currentPlaylist.songs.length === 0) {
            return;
        }

        // Play the first song in the playlist with playlist context
        const firstSong = this.currentPlaylist.songs[0];
        this.playSong(firstSong, this.currentPlaylist);
    }

    shufflePlaylist() {
        if (!this.currentPlaylist || this.currentPlaylist.songs.length === 0) {
            return;
        }

        // Shuffle the playlist and play a random song with playlist context
        const shuffledSongs = [...this.currentPlaylist.songs].sort(() => Math.random() - 0.5);
        const randomSong = shuffledSongs[0];
        this.playSong(randomSong, this.currentPlaylist);
    }


    showPlaylistContextMenu() {
        if (!this.currentPlaylist) return;

        window.components.setContextMenu({
            title: this.t('dialogs.editPlaylist.title'),
            buttons: [
                {
                    title: 'Edit Name',
                    color: 'blue',
                    cb: () => {
                        this.showEditPlaylistNameDialog();
                    }
                },
                {
                    title: this.t('actions.editCover'),
                    color: 'green',
                    cb: () => {
                        this.showCoverGalleryDialog();
                    }
                },
                {
                    title: this.t('actions.deletePlaylist'),
                    color: 'red',
                    cb: () => {
                        this.showDeletePlaylistDialog();
                    }
                }
            ]
        });
    }

    showEditPlaylistNameDialog() {
        if (!this.currentPlaylist) return;

        window.components.setPopUp({
            title: this.t('dialogs.editPlaylistName.title'),
            description: this.t('dialogs.editPlaylistName.description'),
            input: {
                placeholder: this.t('dialogs.editPlaylistName.placeholder'),
                value: this.currentPlaylist.name,
                maxLength: 10,
                onChange: (value) => {
                    // Limit to 10 characters
                    if (value.length <= 10) {
                        window.tempPlaylistName = value;
                    }
                }
            },
            buttons: [
                {
                    title: this.t('actions.cancel'),
                    color: 'red',
                    cb: () => {
                        this.debugLog('Edit playlist name cancelled');
                    }
                },
                {
                    title: this.t('actions.save'),
                    color: 'blue',
                    cb: () => {
                        const newName = window.tempPlaylistName;
                        if (newName && newName.trim() && newName.trim() !== this.currentPlaylist.name) {
                            const trimmedName = newName.trim();
                            if (trimmedName.length <= 10) {
                                this.updatePlaylistName(trimmedName);
                            } else {
                                // Playlist name too long - no notification
                            }
                        }
                    }
                }
            ]
        });
    }

    showDeletePlaylistDialog() {
        if (!this.currentPlaylist) return;

        window.components.setPopUp({
            title: this.t('dialogs.deletePlaylist.title'),
            description: this.t('dialogs.deletePlaylist.description'),
            buttons: [
                {
                    title: this.t('actions.cancel'),
                    color: 'red',
                    cb: () => {
                        this.debugLog('Delete playlist cancelled');
                    }
                },
                {
                    title: this.t('actions.delete'),
                    color: 'red',
                    cb: () => {
                        this.deletePlaylist();
                    }
                }
            ]
        });
    }

    showEditCoverDialog() {
        if (!this.currentPlaylist) return;

        window.components.setContextMenu({
            title: this.t('dialogs.editCover.title'),
            buttons: [
                {
                    title: this.t('actions.changeCover'),
                    color: 'blue',
                    cb: () => {
                        this.showCoverUrlDialog();
                    }
                },
                {
                    title: 'Gallery',
                    color: 'green',
                    cb: () => {
                        this.showCoverGalleryDialog();
                    }
                }
            ]
        });
    }

    showCoverUrlDialog() {
        window.components.setPopUp({
            title: this.t('dialogs.editCover.title'),
            description: this.t('dialogs.editCover.description'),
            input: {
                placeholder: this.t('dialogs.editCover.placeholder'),
                value: '',
                onChange: (value) => {
                    window.tempCoverUrl = value;
                }
            },
            buttons: [
                {
                    title: this.t('actions.cancel'),
                    color: 'red',
                    cb: () => {
                        this.debugLog('Edit cover cancelled');
                    }
                },
                {
                    title: this.t('actions.save'),
                    color: 'blue',
                    cb: () => {
                        const coverUrl = window.tempCoverUrl;
                        if (coverUrl && coverUrl.trim()) {
                            this.updatePlaylistCover(coverUrl.trim());
                        } else {
                            // Invalid image URL - no notification
                        }
                    }
                }
            ]
        });
    }

    showCoverGalleryDialog() {
        window.components.setGallery({
            includeVideos: true,
            includeImages: true,
            allowExternal: true,
            multiSelect: false,
            onSelect: (data) => {
                const imageSrc = Array.isArray(data) ? data[0].src : data.src;
                if (imageSrc) {
                    this.updatePlaylistCover(imageSrc);
                }
            }
        });
    }

    async updatePlaylistName(newName) {
        try {
            if (!this.currentPlaylist) return;

            // Update the playlist name
            this.currentPlaylist.name = newName;
            
            // Update the UI
            document.getElementById('playlistDetailTitle').textContent = this.truncateText(newName, 10);
            
            // Update the playlists array
            const playlistIndex = this.playlists.findIndex(p => p.id === this.currentPlaylist.id);
            if (playlistIndex !== -1) {
                this.playlists[playlistIndex].name = newName;
            }

            // Save playlists to localStorage
            this.savePlaylists();
            
            // Update locally (server doesn't have playlist endpoints yet)
            // Playlist updated - no notification
            
            // Refresh playlists page if it's open
            this.renderPlaylistsPage();
        } catch (error) {
            this.debugError('Error updating playlist name:', error);
            // Failed to update playlist - no notification
        }
    }

    async updatePlaylistCover(coverUrl) {
        try {
            if (!this.currentPlaylist) return;

            // Validate the URL
            if (!this.isValidImageUrl(coverUrl)) {
                // Invalid image URL - no notification
                return;
            }

            // Update the playlist cover
            this.currentPlaylist.cover = coverUrl;
            
            // Save to localStorage for persistence
            this.savePlaylistCovers();
            
            // Update the UI - we'll need to modify the cover display
            this.updatePlaylistCoverDisplay(coverUrl);
            
            // Update the playlists array
            const playlistIndex = this.playlists.findIndex(p => p.id === this.currentPlaylist.id);
            if (playlistIndex !== -1) {
                this.playlists[playlistIndex].cover = coverUrl;
            }

            // Save playlists to localStorage
            this.savePlaylists();
            
            // Update locally (server doesn't have playlist endpoints yet)
            // Cover updated - no notification
            
            // Refresh playlists page if it's open
            this.renderPlaylistsPage();
        } catch (error) {
            this.debugError('Error updating playlist cover:', error);
            // Failed to update playlist - no notification
        }
    }

    updatePlaylistCoverDisplay(coverUrl) {
        const coverElement = document.querySelector('.playlist-cover-large');
        if (coverElement && coverUrl) {
            // Create image element to test if URL is valid
            const img = new Image();
            img.onload = () => {
                // Replace the icon with the actual cover image
                coverElement.innerHTML = `
                    <img src="${coverUrl}" alt="Playlist Cover" style="width: 100%; height: 100%; object-fit: cover; border-radius: 1.5rem;" />
                    <div class="playlist-cover-shine"></div>
                `;
            };
            img.onerror = () => {
                // Invalid image URL - no notification
            };
            img.src = coverUrl;
        }
    }

    isValidImageUrl(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
        } catch {
            return false;
        }
    }

    savePlaylistCovers() {
        try {
            const covers = {};
            this.playlists.forEach(playlist => {
                if (playlist.cover) {
                    covers[playlist.id] = playlist.cover;
                }
            });
            localStorage.setItem('lb-musicapp-playlist-covers', JSON.stringify(covers));
        } catch (error) {
            this.debugError('Error saving playlist covers:', error);
        }
    }

    savePlaylists() {
        try {
            localStorage.setItem('lb-musicapp-playlists', JSON.stringify(this.playlists));
            this.debugLog('Playlists saved to localStorage:', this.playlists);
        } catch (error) {
            this.debugError('Error saving playlists:', error);
        }
    }

    loadPlaylists() {
        try {
            const savedPlaylists = localStorage.getItem('lb-musicapp-playlists');
            if (savedPlaylists) {
                this.playlists = JSON.parse(savedPlaylists);
                this.debugLog('Playlists loaded from localStorage:', this.playlists);
            }
        } catch (error) {
            this.debugError('Error loading playlists:', error);
        }
    }

    loadPlaylistCovers() {
        try {
            const savedCovers = localStorage.getItem('lb-musicapp-playlist-covers');
            if (savedCovers) {
                const covers = JSON.parse(savedCovers);
                this.playlists.forEach(playlist => {
                    if (covers[playlist.id]) {
                        playlist.cover = covers[playlist.id];
                    }
                });
            }
        } catch (error) {
            this.debugError('Error loading playlist covers:', error);
        }
    }

    async deletePlaylist() {
        try {
            if (!this.currentPlaylist) return;

            const playlistId = this.currentPlaylist.id;
            
            // Update locally (server doesn't have playlist endpoints yet)
            // Remove from local playlists array
            this.playlists = this.playlists.filter(p => p.id !== playlistId);
            
            // Save playlists to localStorage
            this.savePlaylists();
            
            // Save updated covers to localStorage
            this.savePlaylistCovers();
            
            // Navigate back to playlists page
            this.navigateToPage('albums');
            
            // Refresh playlists page
            this.renderPlaylistsPage();
            
            // Playlist deleted - no notification
        } catch (error) {
            this.debugError('Error deleting playlist:', error);
            // Failed to delete playlist - no notification
        }
    }

    async addSongToLibrary(musicUrl) {
        try {
            // Use YouTube service to process the URL
            const musicInfo = await this.youtubeService.processMusicUrl(musicUrl);
            
            // Add to library
            this.debugLog('Attempting to add song to library:', musicInfo);
            const response = await this.callNUI('addSong', {
                song: musicInfo
            });
            this.debugLog('addSong response:', response);
            
            if (response && response.success) {
                this.songs = response.songs;
                // Don't update recent songs here - let it be managed by recently played
                this.debugLog('Added music to library:', musicInfo.title);
                this.renderLibrary();
                this.renderRecentSongs();
                this.renderSongsPage();
                this.renderArtistsPage();
            } else {
                this.debugError('Failed to add music to library, response:', response);
                // Failed to add song - no notification
            }
        } catch (error) {
            this.debugError('Error processing music URL:', error);
            if (error.message.includes('Invalid YouTube URL')) {
                this.showErrorNotification(this.t('notifications.invalidYouTubeUrl'));
            } else if (error.message.includes('Unsupported music platform')) {
                // Unsupported platform - no notification
            } else {
                // Failed to add song - no notification
            }
        }
    }

    showSongContextMenu(song, index) {
        const buttons = [
            {
                title: this.t('actions.addToPlaylist'),
                color: 'blue',
                cb: () => {
                    this.showAddToPlaylistMenu(song, index);
                }
            },
            {
                title: this.t('actions.deleteSong'),
                color: 'red',
                cb: () => {
                    window.components.setPopUp({
                        title: this.t('dialogs.deleteSong.title'),
                        description: this.t('dialogs.deleteSong.description', {title: song.title}),
                        buttons: [
                            {
                                title: this.t('actions.cancel'),
                                color: 'red',
                                cb: () => this.debugLog('Delete cancelled')
                            },
                            {
                                title: this.t('actions.delete'),
                                color: 'red',
                                cb: () => this.deleteSong(song.url, song.title)
                            }
                        ]
                    });
                }
            }
        ];

        window.components.setContextMenu({
            title: `${this.t('navigation.songs')}: ${song.title}`,
            buttons: buttons
        });
    }

    showPlaylistSongContextMenu(song, index, playlistIndex) {
        const buttons = [
            {
                title: 'Remove from Playlist',
                color: 'red',
                cb: () => {
                    window.components.setPopUp({
                        title: 'Remove from Playlist',
                        description: `Remove "${song.title}" from this playlist?`,
                        buttons: [
                            {
                                title: this.t('actions.cancel'),
                                color: 'red',
                                cb: () => this.debugLog('Remove from playlist cancelled')
                            },
                            {
                                title: 'Remove',
                                color: 'red',
                                cb: () => this.removeSongFromPlaylist(playlistIndex)
                            }
                        ]
                    });
                }
            }
        ];

        window.components.setContextMenu({
            title: `${this.t('navigation.songs')}: ${song.title}`,
            buttons: buttons
        });
    }

    async deleteSong(songUrl, songTitle) {
        try {
            const response = await this.callNUI('deleteSong', { songUrl });
            if (response && response.success) {
                this.songs = response.songs;
                // Don't update recent songs here - let it be managed by recently played
                this.renderLibrary();
                this.renderRecentSongs();
                this.renderSongsPage();
                this.renderArtistsPage();
            } else {
                // Failed to delete song - no notification
            }
        } catch (error) {
            this.debugError('Error deleting song:', error);
            // Failed to delete song - no notification
        }
    }

    removeSongFromPlaylist(playlistIndex) {
        try {
            if (!this.currentPlaylist || playlistIndex < 0 || playlistIndex >= this.currentPlaylist.songs.length) {
                // Invalid song index - no notification
                return;
            }

            // Remove the song from the current playlist
            const removedSong = this.currentPlaylist.songs.splice(playlistIndex, 1)[0];
            
            // Update the playlist in the playlists array
            const playlistIndexInArray = this.playlists.findIndex(p => p.id === this.currentPlaylist.id);
            if (playlistIndexInArray !== -1) {
                this.playlists[playlistIndexInArray] = this.currentPlaylist;
            }

            // Save playlists to localStorage
            this.savePlaylists();
            
            // Save playlist covers to localStorage
            this.savePlaylistCovers();

            // Re-render the playlist detail page
            this.renderPlaylistDetailPage();

            // Re-render the playlists page
            this.renderPlaylistsPage();

            // Song removed from playlist - no notification
            this.debugLog('Removed song from playlist:', removedSong.title);
        } catch (error) {
            this.debugError('Error removing song from playlist:', error);
            // Failed to remove song from playlist - no notification
        }
    }

    async playSong(song, playlistContext = null) {
        try {
            this.nowPlaying = song;
            this.isPlaying = true;
            this.currentTime = 0;
            this.duration = 180; // Default 3 minutes, will be updated when we get real duration
            
            // Add to recently played list
            this.addToRecentlyPlayed(song);
            
            // Set playlist context if provided
            if (playlistContext) {
                this.currentPlaylist = playlistContext;
                this.currentPlaylistSongs = playlistContext.songs;
            } else {
                this.currentPlaylist = null;
                this.currentPlaylistSongs = [];
            }
            
            // Update UI
            this.updateNowPlayingBar();
            this.showNowPlayingBar();
            this.startProgressUpdate();
            
            // Play the song
            const response = await this.callNUI('playSound', { url: song.url });
            if (!response || response.error) {
                throw new Error(response?.error || 'Failed to play song');
            }
            
        } catch (error) {
            // Don't show error notifications if the resource is shutting down
            if (!error.message.includes('shutting down') && !error.message.includes('AbortError')) {
                this.debugError('Failed to play song:', error);
                // Failed to play song - no notification
            }
            this.isPlaying = false;
            this.nowPlaying = null;
            this.updateNowPlayingBar();
            this.hideNowPlayingBar();
        }
    }

    loadRecentlyPlayed() {
        try {
            // Check if localStorage is available
            if (typeof localStorage === 'undefined') {
                console.warn('localStorage not available, recently played songs will not persist');
                this.recentlyPlayed = [];
                this.recentSongs = [];
                return;
            }
            
            const saved = localStorage.getItem('lb-musicapp-recently-played');
            if (saved) {
                const parsed = JSON.parse(saved);
                // Validate that it's an array
                if (Array.isArray(parsed)) {
                    this.recentlyPlayed = parsed;
                    // Update the recent songs display (show last 3)
                    this.recentSongs = this.recentlyPlayed.slice(0, 3);
                } else {
                    console.warn('Invalid recently played data, resetting');
                    this.recentlyPlayed = [];
                    this.recentSongs = [];
                }
            }
        } catch (error) {
            console.error('Error loading recently played songs:', error);
            this.recentlyPlayed = [];
            this.recentSongs = [];
        }
    }

    saveRecentlyPlayed() {
        try {
            // Check if localStorage is available
            if (typeof localStorage === 'undefined') {
                console.warn('localStorage not available, cannot save recently played songs');
                return;
            }
            
            localStorage.setItem('lb-musicapp-recently-played', JSON.stringify(this.recentlyPlayed));
        } catch (error) {
            console.error('Error saving recently played songs:', error);
        }
    }

    clearRecentlyPlayed() {
        this.recentlyPlayed = [];
        this.recentSongs = [];
        this.saveRecentlyPlayed();
        this.renderRecentSongs();
    }

    addToRecentlyPlayed(song) {
        // Remove song if it already exists in recently played
        this.recentlyPlayed = this.recentlyPlayed.filter(s => s.url !== song.url);
        
        // Add song to the beginning of the list
        this.recentlyPlayed.unshift(song);
        
        // Keep only the last 10 played songs
        if (this.recentlyPlayed.length > 10) {
            this.recentlyPlayed = this.recentlyPlayed.slice(0, 10);
        }
        
        // Save to localStorage
        this.saveRecentlyPlayed();
        
        // Update the recent songs display (show last 3)
        this.recentSongs = this.recentlyPlayed.slice(0, 3);
        this.renderRecentSongs();
    }

    onSongEnded() {
        // Called when a song finishes playing
        this.debugLog('Song ended, playing next song');
        this.playNext();
    }

    async togglePlay() {
        try {
            const newPlayingState = !this.isPlaying;
            this.isPlaying = newPlayingState;
            
            // Update UI
            this.updateNowPlayingBar();
            
            // Start/stop progress updates
            if (newPlayingState) {
                this.startProgressUpdate();
            } else {
                this.stopProgressUpdate();
            }
            
            const response = await this.callNUI(newPlayingState ? 'resumeSound' : 'pauseSound', {});
            if (!response || response.error) {
                throw new Error(response?.error || 'Failed to toggle playback');
            }
            
        } catch (error) {
            // Don't show error notifications if the resource is shutting down
            if (!error.message.includes('shutting down') && !error.message.includes('AbortError')) {
                this.debugError('Failed to toggle play:', error);
                // Failed to toggle playback - no notification
            }
            // Revert state on error
            this.isPlaying = !this.isPlaying;
            this.updateNowPlayingBar();
        }
    }

    updateNowPlayingBar() {
        if (!this.nowPlaying) return;

        document.getElementById('nowPlayingThumbnail').src = this.nowPlaying.thumbnail;
        document.getElementById('nowPlayingTitle').textContent = this.truncateText(this.nowPlaying.title, 10);
        document.getElementById('nowPlayingArtist').textContent = this.truncateText(this.nowPlaying.artist, 20);

        // Update play/pause icon
        const toggleButton = document.getElementById('nowPlayingToggle');
        const fullPlayerToggle = document.getElementById('fullPlayerToggle');
        
        const playIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 5V19L19 12L8 5Z" fill="currentColor"/></svg>';
        const pauseIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/></svg>';
        
        toggleButton.innerHTML = this.isPlaying ? pauseIcon : playIcon;
        fullPlayerToggle.innerHTML = this.isPlaying ? pauseIcon : playIcon;

        // Also update full player if it's currently open
        this.updateFullPlayerContent();
    }

    updateFullPlayerContent() {
        if (!this.nowPlaying) return;

        // Update full player content (regardless of visibility)
        document.getElementById('fullPlayerThumbnail').src = this.nowPlaying.thumbnail;
        
        const titleElement = document.getElementById('fullPlayerTitle');
        const titleText = this.nowPlaying.title;
        
        // Only apply marquee effect if title is 10+ characters
        if (titleText.length >= 10) {
            // Create a seamless marquee with container and duplicated items
            titleElement.innerHTML = `
                <div class="player-title__container">
                    <div class="player-title__item">${titleText}</div>
                    <div class="player-title__item">${titleText}</div>
                </div>
            `;
            // Remove marquee class since we're using the container-based animation
            titleElement.classList.remove('marquee');
        } else {
            // For short titles, just display the text normally
            titleElement.innerHTML = titleText;
            // Remove marquee class for short titles
            titleElement.classList.remove('marquee');
        }
        
        document.getElementById('fullPlayerArtist').textContent = this.truncateText(this.nowPlaying.artist, 35);

        // Update progress bar
        this.updateProgressBar();
        
        // Force immediate visual update
        const fullPlayer = document.getElementById('fullScreenPlayer');
        if (fullPlayer && fullPlayer.style.display === 'flex') {
            // Trigger a reflow to ensure immediate visual update
            fullPlayer.offsetHeight;
        }
    }

    showNowPlayingBar() {
        document.getElementById('nowPlayingBar').style.display = 'flex';
    }

    hideNowPlayingBar() {
        document.getElementById('nowPlayingBar').style.display = 'none';
    }

    openFullPlayer() {
        if (!this.nowPlaying) return;

        // Update full player content
        this.updateFullPlayerContent();

        // Update volume bar
        this.setVolume(this.getVolume());

        // Show full player
        document.getElementById('fullScreenPlayer').style.display = 'flex';
    }

    closeFullPlayer() {
        document.getElementById('fullScreenPlayer').style.display = 'none';
    }

    stopSong() {
        this.isPlaying = false;
        this.nowPlaying = null;
        this.currentTime = 0;
        this.stopProgressUpdate();
        this.hideNowPlayingBar();
        
        // Reset progress bar
        const progressFill = document.getElementById('progressFill');
        const currentTimeEl = document.getElementById('currentTime');
        const totalTimeEl = document.getElementById('totalTime');
        
        if (progressFill) progressFill.style.width = '0%';
        if (currentTimeEl) currentTimeEl.textContent = '0:00';
        if (totalTimeEl) totalTimeEl.textContent = '0:00';
    }

    playPrevious() {
        if (!this.nowPlaying) return;

        // Determine which song list to use (playlist or library)
        const songList = this.currentPlaylistSongs.length > 0 ? this.currentPlaylistSongs : this.songs;
        
        // Find current song index
        const currentIndex = songList.findIndex(song => song.url === this.nowPlaying.url);
        
        if (currentIndex === -1) {
            this.debugLog('Current song not found in current context');
            return;
        }

        // Calculate previous song index
        let previousIndex = currentIndex - 1;
        
        // If at the beginning, loop to the end
        if (previousIndex < 0) {
            previousIndex = songList.length - 1;
        }

        // Play the previous song
        const previousSong = songList[previousIndex];
        this.playSong(previousSong, this.currentPlaylist);
        this.debugLog('Playing previous song:', previousSong.title);
    }

    playNext() {
        if (!this.nowPlaying) return;

        // Determine which song list to use (playlist or library)
        const songList = this.currentPlaylistSongs.length > 0 ? this.currentPlaylistSongs : this.songs;
        
        // Find current song index
        const currentIndex = songList.findIndex(song => song.url === this.nowPlaying.url);
        
        if (currentIndex === -1) {
            this.debugLog('Current song not found in current context');
            return;
        }

        // Calculate next song index
        let nextIndex = currentIndex + 1;
        
        // If at the end, loop to the beginning
        if (nextIndex >= songList.length) {
            nextIndex = 0;
        }

        // Play the next song
        const nextSong = songList[nextIndex];
        this.playSong(nextSong, this.currentPlaylist);
        this.debugLog('Playing next song:', nextSong.title);
    }


    handleLibrarySearch(query) {
        const container = document.getElementById('librarySongsList');
        
        // Clear existing event listeners before re-rendering
        this.clearContainerEventListeners(container);
        
        if (!query.trim()) {
            this.renderLibrary();
            return;
        }

        const searchTerm = query.toLowerCase();
        const filteredSongs = this.songs.filter(song => 
            (song.title && song.title.toLowerCase().includes(searchTerm)) ||
            (song.artist && song.artist.toLowerCase().includes(searchTerm))
        ).sort((a, b) => {
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
        });

        if (filteredSongs.length === 0) {
            container.innerHTML = `<div class="empty-state"><p>No songs found matching "${query}"</p></div>`;
            return;
        }

        container.innerHTML = filteredSongs.map((song, index) => {
            const originalIndex = this.songs.findIndex(s => s.url === song.url);
            return `
                <div class="song-item" data-index="${originalIndex}">
                    <div class="song-thumbnail">
                        <img src="${song.thumbnail}" alt="${song.title || this.t('music.unknownTitle')}" />
                    </div>
                    <div class="song-info">
                        <h3 class="song-title">${this.truncateText(song.title, 10)}</h3>
                        <p class="song-artist">${this.truncateText(song.artist, 25)}</p>
                    </div>
                    <button class="song-options-button" data-index="${originalIndex}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="1" fill="currentColor"/>
                            <circle cx="19" cy="12" r="1" fill="currentColor"/>
                            <circle cx="5" cy="12" r="1" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
            `;
        }).join('');

        // Add event listeners for songs with proper tracking
        const songItems = container.querySelectorAll('.song-item');
        const songOptionsButtons = container.querySelectorAll('.song-options-button');
        
        this.addEventListenerToElements(songItems, 'click', (e) => {
            if (!e.target.closest('.song-options-button')) {
                const index = parseInt(e.currentTarget.dataset.index);
                this.playSong(this.songs[index]);
            }
        });

        this.addEventListenerToElements(songOptionsButtons, 'click', (e) => {
            e.stopPropagation();
            const index = parseInt(e.currentTarget.dataset.index);
            this.showSongContextMenu(this.songs[index], index);
        });
    }

    showErrorNotification(message) {
        // Only show notifications for the three allowed cases
        if (message === this.t('notifications.pleaseEnterUrl') || 
            message === this.t('notifications.pleaseEnterPlaylistName') || 
            message === this.t('notifications.invalidYouTubeUrl')) {
            // Send notification via lb-phone
            this.callNUI('notify', { 
                title: this.t('app.name'),
                content: message 
            }).catch(error => {
                // Don't log errors if the resource is shutting down or if it's a fetch error
                if (!error.message.includes('shutting down') && 
                    !error.message.includes('AbortError') && 
                    !error.message.includes('Failed to fetch')) {
                    this.debugError('Failed to send notification:', error);
                }
            });
        }
    }

    startProgressUpdate() {
        this.stopProgressUpdate(); // Clear any existing interval
        
        this.progressInterval = this.setInterval(() => {
            if (this.isPlaying && this.nowPlaying) {
                this.currentTime += 1;
                
                // Only update progress bar every 5 seconds to reduce DOM manipulation
                if (this.currentTime % 5 === 0) {
                    this.updateProgressBar();
                }
                
                // Check if song has ended
                if (this.currentTime >= this.duration) {
                    this.onSongEnded();
                }
            }
        }, 1000);
    }

    stopProgressUpdate() {
        if (this.progressInterval) {
            this.clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    updateProgressBar() {
        const progressFill = document.getElementById('progressFill');
        const currentTimeEl = document.getElementById('currentTime');
        const totalTimeEl = document.getElementById('totalTime');
        
        if (progressFill && currentTimeEl && totalTimeEl) {
            const progress = (this.currentTime / this.duration) * 100;
            progressFill.style.width = Math.min(progress, 100) + '%';
            
            currentTimeEl.textContent = this.formatTime(this.currentTime);
            totalTimeEl.textContent = this.formatTime(this.duration);
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setupVolumeDragging(volumeBar) {
        let isDragging = false;
        
        // Mouse events
        this.addEventListener(volumeBar, 'mousedown', (e) => {
            isDragging = true;
            volumeBar.classList.add('dragging');
            this.handleVolumeDrag(e, volumeBar);
            e.preventDefault();
        });
        
        this.addEventListener(document, 'mousemove', (e) => {
            if (isDragging) {
                this.handleVolumeDrag(e, volumeBar);
            }
        });
        
        this.addEventListener(document, 'mouseup', () => {
            if (isDragging) {
                isDragging = false;
                volumeBar.classList.remove('dragging');
                this.addVolumeVisualFeedback(volumeBar);
            }
        });
        
        // Touch events for mobile
        this.addEventListener(volumeBar, 'touchstart', (e) => {
            isDragging = true;
            volumeBar.classList.add('dragging');
            this.handleVolumeDrag(e.touches[0], volumeBar);
            e.preventDefault();
        });
        
        this.addEventListener(document, 'touchmove', (e) => {
            if (isDragging) {
                this.handleVolumeDrag(e.touches[0], volumeBar);
                e.preventDefault();
            }
        });
        
        this.addEventListener(document, 'touchend', () => {
            if (isDragging) {
                isDragging = false;
                volumeBar.classList.remove('dragging');
                this.addVolumeVisualFeedback(volumeBar);
            }
        });
    }

    handleVolumeClick(e) {
        const volumeBar = e.currentTarget;
        this.handleVolumeDrag(e, volumeBar);
        this.addVolumeVisualFeedback(volumeBar);
    }

    handleVolumeDrag(e, volumeBar) {
        const rect = volumeBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = (clickX / rect.width) * 100;
        
        // Update visual feedback immediately for responsive UI
        this.updateVolumeVisualFeedback(volumeBar, percentage);
        
        // Throttle volume updates to reduce server load
        this.throttledVolumeUpdate(Math.max(0, Math.min(100, percentage)));
    }

    addVolumeVisualFeedback(volumeBar) {
        // Add visual feedback
        volumeBar.style.backgroundColor = 'var(--background-highlight)';
        setTimeout(() => {
            volumeBar.style.backgroundColor = 'var(--background-highlight)';
        }, 150);
    }

    updateVolumeVisualFeedback(volumeBar, percentage) {
        // Update the volume bar visual immediately without server calls
        const volumeFill = volumeBar.querySelector('.volume-fill');
        if (volumeFill) {
            volumeFill.style.width = percentage + '%';
        }
        
        // Update volume display
        const volumeDisplay = document.querySelector('.volume-display');
        if (volumeDisplay) {
            volumeDisplay.textContent = Math.round(percentage) + '%';
        }
    }

    throttledVolumeUpdate(percentage) {
        // Clear existing throttle
        if (this.volumeUpdateThrottle) {
            clearTimeout(this.volumeUpdateThrottle);
        }
        
        // Set new throttle - only update server every 100ms during drag
        this.volumeUpdateThrottle = setTimeout(() => {
            this.setVolume(percentage);
            this.volumeUpdateThrottle = null;
        }, 100);
    }

    setVolume(volume) {
        this.volume = volume;
        
        // Update volume bar visual
        const volumeFill = document.getElementById('volumeFill');
        if (volumeFill) {
            volumeFill.style.width = volume + '%';
        }
        
        // Update volume percentage display
        const volumePercentage = document.getElementById('volumePercentage');
        if (volumePercentage) {
            volumePercentage.textContent = Math.round(volume) + '%';
        }
        
        // Send volume change to Lua (throttled to reduce server load)
        this.callNUI('changeVolume', { volume: Math.round(volume) }).catch(error => {
            // Don't log errors if the resource is shutting down or if it's a fetch error
            if (!error.message.includes('shutting down') && 
                !error.message.includes('AbortError') && 
                !error.message.includes('Failed to fetch')) {
                this.debugError('Volume change error:', error);
            }
        });
    }

    getVolume() {
        return this.volume || 50; // Default to 50% if not set
    }

    setupMarqueeEffect(element, animationClass = 'marquee') {
        if (!element) return;
        
        // Remove any existing marquee class
        element.classList.remove('marquee');
        
        // Force a reflow to ensure the reset takes effect
        element.offsetHeight;
        
        // Check if text is long enough to need marquee
        const text = element.textContent || '';
        
        this.debugLog('Marquee check:', {
            text: text,
            length: text.length
        });
        
        // Only enable marquee for long titles (10+ characters)
        if (text.length >= 10) {
            element.classList.add('marquee');
            this.debugLog('Marquee enabled for title:', text);
        } else {
            this.debugLog('Marquee not needed for short title:', text);
        }
    }

    truncateText(text, maxLength = 50) {
        if (!text || text.length <= maxLength) {
            return text || 'Unknown';
        }
        
        // Try to truncate at word boundary
        const truncated = text.substring(0, maxLength);
        const lastSpace = truncated.lastIndexOf(' ');
        
        if (lastSpace > maxLength * 0.7) {
            return truncated.substring(0, lastSpace) + '...';
        }
        
        return truncated + '...';
    }

    adjustVolume(delta) {
        const newVolume = Math.max(0, Math.min(100, this.getVolume() + delta));
        this.setVolume(newVolume);
        
        // Add visual feedback
        const volumeBar = document.querySelector('.volume-bar');
        if (volumeBar) {
            this.addVolumeVisualFeedback(volumeBar);
        }
    }

    showLoadingState(element, message = 'Loading...') {
        if (!element) return;
        
        element.innerHTML = `
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p class="loading-message">${message}</p>
            </div>
        `;
    }

    hideLoadingState(element, content = '') {
        if (!element) return;
        
        const loadingState = element.querySelector('.loading-state');
        if (loadingState) {
            loadingState.remove();
        }
        
        if (content) {
            element.innerHTML = content;
        }
    }

    showSkeletonLoading(container, count = 5) {
        if (!container) return;
        
        const skeletonHTML = Array(count).fill(0).map(() => `
            <div class="skeleton-item">
                <div class="skeleton-thumbnail"></div>
                <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-subtitle"></div>
                </div>
            </div>
        `).join('');
        
        container.innerHTML = skeletonHTML;
    }

    // Memory management helpers
    addEventListener(element, event, handler, options = {}) {
        element.addEventListener(event, handler, options);
        
        // Track the event listener for cleanup
        const key = `${element.id || element.tagName}_${event}`;
        if (!this.eventListeners.has(key)) {
            this.eventListeners.set(key, []);
        }
        this.eventListeners.get(key).push({ element, event, handler, options });
    }

    addEventListenerToElements(elements, event, handler, options = {}) {
        elements.forEach(element => {
            this.addEventListener(element, event, handler, options);
        });
    }

    removeEventListenersFromContainer(container) {
        // Remove all event listeners from a container and its children
        const allElements = container.querySelectorAll('*');
        allElements.forEach(element => {
            // Clone the element to remove all event listeners
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
        });
    }

    clearContainerEventListeners(container) {
        // Clear event listeners from a specific container before re-rendering
        if (container) {
            this.removeEventListenersFromContainer(container);
        }
    }

    removeEventListener(element, event, handler) {
        element.removeEventListener(event, handler);
        
        // Remove from tracking
        const key = `${element.id || element.tagName}_${event}`;
        if (this.eventListeners.has(key)) {
            const listeners = this.eventListeners.get(key);
            const index = listeners.findIndex(l => l.handler === handler);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    setTimeout(callback, delay) {
        const timeoutId = window.setTimeout(() => {
            this.timeouts.delete(timeoutId);
            callback();
        }, delay);
        
        this.timeouts.add(timeoutId);
        return timeoutId;
    }

    clearTimeout(timeoutId) {
        window.clearTimeout(timeoutId);
        this.timeouts.delete(timeoutId);
    }

    setInterval(callback, delay) {
        const intervalId = window.setInterval(callback, delay);
        this.intervals.add(intervalId);
        return intervalId;
    }

    clearInterval(intervalId) {
        window.clearInterval(intervalId);
        this.intervals.delete(intervalId);
    }

    cleanup() {
        this.debugLog('Starting cleanup...');
        console.log('Music App: Starting cleanup - app is closing');
        
        // Pause music when app is closing
        this.pauseMusicOnClose();
        
        // Stop any ongoing operations
        this.isPlaying = false;
        this.nowPlaying = null;
        
        // Clear all intervals
        this.intervals.forEach(intervalId => {
            window.clearInterval(intervalId);
        });
        this.intervals.clear();
        
        // Clear all timeouts
        this.timeouts.forEach(timeoutId => {
            window.clearTimeout(timeoutId);
        });
        this.timeouts.clear();
        
        // Clear progress interval specifically
        if (this.progressInterval) {
            this.clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        // Clear theme check timeout
        if (this.themeCheckTimeout) {
            clearTimeout(this.themeCheckTimeout);
            this.themeCheckTimeout = null;
        }
        
        // Clear volume update throttle
        if (this.volumeUpdateThrottle) {
            clearTimeout(this.volumeUpdateThrottle);
            this.volumeUpdateThrottle = null;
        }
        
        // Disconnect theme mutation observer
        if (this.themeObserver) {
            this.themeObserver.disconnect();
            this.themeObserver = null;
        }
        
        // Remove media query listener
        if (this.mediaQueryListener) {
            this.mediaQueryListener.removeEventListener('change', this.checkTheme);
            this.mediaQueryListener = null;
        }
        
        // Remove all tracked event listeners
        this.removeAllEventListeners();
        
        // Clear all container event listeners
        const containers = [
            document.getElementById('librarySongsList'),
            document.getElementById('recentSongsList'),
            document.querySelector('#songsPage .songs-list'),
            document.querySelector('#artistsPage .artists-list'),
            document.querySelector('#albumsPage .albums-list')
        ];
        
        containers.forEach(container => {
            if (container) {
                this.clearContainerEventListeners(container);
            }
        });
        
        // Clear caches
        this.clearCaches();
        
        // Clean up temporary window variables
        delete window.tempSongUrl;
        delete window.tempPlaylistName;
        delete window.tempCoverUrl;
        
        this.isCleanedUp = true;
        this.debugLog('Music app cleaned up successfully');
        console.log('Music App: Cleanup completed - app is closed');
    }

    removeAllEventListeners() {
        // Remove all tracked event listeners
        this.eventListeners.forEach((listeners, key) => {
            listeners.forEach(({ element, event, handler }) => {
                try {
                    element.removeEventListener(event, handler);
                } catch (error) {
                    this.debugWarn(`Failed to remove event listener: ${error.message}`);
                }
            });
        });
        this.eventListeners.clear();
        
        // Remove global event listeners that might not be tracked
        // Note: Most event listeners are now tracked and cleaned up above
        // Only remove the message listener if it exists
        if (this.handleMessage) {
            window.removeEventListener('message', this.handleMessage);
        }
    }

    clearCaches() {
        // Clear any cached data (but keep recently played in localStorage)
        this.songs = [];
        this.recentSongs = [];
        // Don't clear recentlyPlayed - it's saved in localStorage
        this.playlists = [];
        this.nowPlaying = null;
        this.currentPlaylist = null;
        this.currentPlaylistSongs = [];
        
        // Clear DOM references
        this.eventListeners.clear();
        this.timeouts.clear();
        this.intervals.clear();
    }

    setupThemeDetection() {
        let currentTheme = null;
        this.themeCheckTimeout = null;
        
        // Check if lb-phone has set a theme attribute
        this.checkTheme = () => {
            const body = document.body;
            const html = document.documentElement;
            
            let newTheme = null;
            
            // Check for lb-phone theme attributes (highest priority)
            if (body.hasAttribute('data-theme')) {
                newTheme = body.getAttribute('data-theme');
            } else if (body.classList.contains('dark-theme')) {
                newTheme = 'dark';
            } else if (body.classList.contains('light-theme')) {
                newTheme = 'light';
            } else {
                // Fallback to system preference
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                newTheme = prefersDark ? 'dark' : 'light';
            }
            
            // Only update if theme actually changed
            if (newTheme !== currentTheme) {
                currentTheme = newTheme;
                html.setAttribute('data-theme', newTheme);
                this.debugLog('Theme changed to:', newTheme);
            }
        };

        // Initial check
        this.checkTheme();

        // Watch for changes in system preference
        this.mediaQueryListener = window.matchMedia('(prefers-color-scheme: dark)');
        this.mediaQueryListener.addEventListener('change', this.checkTheme);

        // Watch for lb-phone theme changes with debouncing
        this.themeObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'data-theme' || 
                     mutation.attributeName === 'class')) {
                    shouldCheck = true;
                }
            });
            
            if (shouldCheck) {
                // Debounce theme checks to prevent spam
                if (this.themeCheckTimeout) {
                    clearTimeout(this.themeCheckTimeout);
                }
                this.themeCheckTimeout = setTimeout(this.checkTheme, 100);
            }
        });

        this.themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['data-theme', 'class']
        });

        // Also observe the html element for theme changes
        this.themeObserver.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ['data-theme']
        });
    }


    // Add cleanup on page unload
    setupCleanup() {
        this.handleMessage = (e) => {
            // Debug: Log all incoming messages
            this.debugLog('Received message:', e.data);
            
            if (e.data.action === "songChanged") {
                // Auto-play next song notification from Lua
                const { url, index } = e.data;
                const song = this.songs[index - 1];
                if (song) {
                    this.nowPlaying = song;
                    this.isPlaying = true;
                    this.updateNowPlayingBar();
                    this.showNowPlayingBar();
                }
            } else if (e.data.action === "playlistEnded") {
                // Playlist has ended
                this.isPlaying = false;
                this.nowPlaying = null;
                this.hideNowPlayingBar();
            } else if (e.data.action === "appClosing") {
                // App is being closed
                this.debugLog('App is closing...');
                console.log('Music App: App is closing');
            }
        };

        this.addEventListener(window, 'beforeunload', () => {
            console.log('Music App: beforeunload event triggered - app is closing');
            // Also try to send a message to the server (ignore errors during shutdown)
            this.callNUI('appClosing', {}).catch(() => {
                // Silently ignore errors during app closing
            });
            this.cleanup();
        });
        
        this.addEventListener(window, 'unload', () => {
            console.log('Music App: unload event triggered - app is closing');
            this.cleanup();
        });
        
        // Also listen for visibility change (when app is hidden)
        this.addEventListener(document, 'visibilitychange', () => {
            if (document.hidden) {
                console.log('Music App: visibilitychange - app is hidden/closing');
            }
        });

        this.addEventListener(window, 'message', this.handleMessage);
    }

    async pauseMusicOnClose() {
        try {
            // Don't make NUI calls if the app is already being cleaned up
            if (this.isCleanedUp) {
                return;
            }
            
            // Pause the music on the server side if it's currently playing
            if (this.isPlaying) {
                await this.callNUI('pauseSound', {});
                console.log('Music App: Music paused on app close');
            }
        } catch (error) {
            // Don't show error notifications if the resource is shutting down or if it's a fetch error
            if (!error.message.includes('shutting down') && 
                !error.message.includes('AbortError') && 
                !error.message.includes('Failed to fetch')) {
                this.debugError('Failed to pause music on app close:', error);
            }
        }
    }

    setupThemeHandling() {
        // Handle theme changes
        if (typeof onSettingsChange === 'function') {
            onSettingsChange((settings) => {
                const theme = settings.display.theme;
                const appElement = document.getElementsByClassName('app')[0];
                if (appElement) {
                    appElement.dataset.theme = theme;
                }
            });
        }

        // Get initial theme
        if (typeof getSettings === 'function') {
            getSettings().then((settings) => {
                const theme = settings.display.theme;
                const appElement = document.getElementsByClassName('app')[0];
                if (appElement) {
                    appElement.dataset.theme = theme;
                }
            });
        }
    }
}

// Initialize the app when components are loaded
window.musicApp = new MusicApp();
