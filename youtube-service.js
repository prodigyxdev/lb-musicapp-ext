// YouTube Service - Handles YouTube URL processing and metadata extraction
class YouTubeService {
    constructor() {
        this.oEmbedBaseUrl = 'https://www.youtube.com/oembed';
        this.thumbnailBaseUrl = 'https://img.youtube.com/vi';
        this.debug = false;
    }

    setDebug(debug) {
        this.debug = debug;
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

    /**
     * Gets localized string from the main app's translation system
     * @param {string} key - Translation key
     * @returns {string} - Localized string or fallback
     */
    getLocalizedString(key) {
        // Try to get translation from the main app if available
        if (window.musicApp && window.musicApp.t) {
            return window.musicApp.t(key);
        }
        
        // Fallback to hardcoded English strings
        const fallbacks = {
            'music.unknownTitle': 'Unknown Title',
            'music.unknownArtist': 'Unknown Artist'
        };
        
        return fallbacks[key] || key;
    }

    /**
     * Validates if a URL is a valid YouTube URL
     * @param {string} url - The URL to validate
     * @returns {boolean} - True if valid YouTube URL
     */
    isValidYouTubeUrl(url) {
        const patterns = [
            /^https?:\/\/(www\.)?youtube\.com\/watch\?v=([^&]+)/,
            /^https?:\/\/youtu\.be\/([^?]+)/,
            /^https?:\/\/(www\.)?youtube\.com\/embed\/([^?]+)/,
            /^https?:\/\/(www\.)?youtube\.com\/v\/([^?]+)/
        ];
        
        return patterns.some(pattern => pattern.test(url));
    }

    /**
     * Extracts video ID from YouTube URL
     * @param {string} url - The YouTube URL
     * @returns {string|null} - The video ID or null if not found
     */
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?]+)/,
            /youtube\.com\/watch\?.*v=([^&]+)/
        ];
        
        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return null;
    }

    /**
     * Generates thumbnail URL for a YouTube video
     * @param {string} videoId - The YouTube video ID
     * @param {string} quality - Thumbnail quality (default, mqdefault, hqdefault, sddefault, maxresdefault)
     * @returns {string} - The thumbnail URL
     */
    getThumbnailUrl(videoId, quality = 'hqdefault') {
        return `${this.thumbnailBaseUrl}/${videoId}/${quality}.jpg`;
    }

    /**
     * Fetches video metadata from YouTube oEmbed API
     * @param {string} videoId - The YouTube video ID
     * @returns {Promise<Object>} - Video metadata object
     */
    async fetchVideoMetadata(videoId) {
        try {
            const url = `${this.oEmbedBaseUrl}?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return {
                title: data.title || this.getLocalizedString('music.unknownTitle'),
                author: data.author_name || this.getLocalizedString('music.unknownArtist'),
                thumbnail: data.thumbnail_url || this.getThumbnailUrl(videoId),
                duration: data.duration || null,
                html: data.html || null
            };
        } catch (error) {
            this.debugError('Error fetching YouTube metadata:', error);
            throw error;
        }
    }

    /**
     * Processes a YouTube URL and returns complete music info
     * @param {string} youtubeUrl - The YouTube URL to process
     * @returns {Promise<Object>} - Complete music information object
     */
    async processYouTubeUrl(youtubeUrl) {
        // Validate URL
        if (!this.isValidYouTubeUrl(youtubeUrl)) {
            throw new Error('Invalid YouTube URL');
        }

        // Extract video ID
        const videoId = this.extractVideoId(youtubeUrl);
        if (!videoId) {
            throw new Error('Could not extract video ID from URL');
        }

        try {
            // Fetch metadata
            const metadata = await this.fetchVideoMetadata(videoId);
            
            return {
                url: youtubeUrl,
                videoId: videoId,
                title: metadata.title,
                artist: metadata.author,
                thumbnail: metadata.thumbnail,
                duration: metadata.duration,
                source: 'youtube'
            };
        } catch (error) {
            // Fallback with basic info
            this.debugWarn('Failed to fetch metadata, using fallback:', error);
            return {
                url: youtubeUrl,
                videoId: videoId,
                title: this.getLocalizedString('music.unknownTitle'),
                artist: this.getLocalizedString('music.unknownArtist'),
                thumbnail: this.getThumbnailUrl(videoId),
                duration: null,
                source: 'youtube'
            };
        }
    }

    /**
     * Validates and processes a music URL (supports multiple platforms)
     * @param {string} url - The music URL
     * @returns {Promise<Object>} - Processed music information
     */
    async processMusicUrl(url) {
        // Check if it's a YouTube URL
        if (this.isValidYouTubeUrl(url)) {
            return await this.processYouTubeUrl(url);
        }
        
        // Add support for other platforms here in the future
        // For now, throw error for unsupported URLs
        throw new Error('Unsupported music platform. Currently only YouTube is supported.');
    }

    /**
     * Gets a clean YouTube URL in standard format
     * @param {string} url - Any YouTube URL format
     * @returns {string} - Standard YouTube watch URL
     */
    normalizeYouTubeUrl(url) {
        const videoId = this.extractVideoId(url);
        if (videoId) {
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return url;
    }
}

// Export for use in other files
window.YouTubeService = YouTubeService;
