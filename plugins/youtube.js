/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and shorts using Y2mate
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and shorts downloader via Y2mate';
        this.version = '2.0.0';

        // Rate limiting and safety
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
        ];

        // Request queue for rate limiting
        this.requestQueue = [];
        this.processing = false;
        this.maxRequestsPerMinute = 8;
        this.requestTimes = [];

        // Y2mate API endpoints
        this.y2mateEndpoints = [
            'https://www.y2mate.com/mates/analyzeV2/ajax',
            'https://www.y2mate.com/mates/convertV2/index',
            'https://www.y2mate.com/mates/en68/analyze/ajax',
            'https://www.y2mate.com/mates/en68/convert'
        ];
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupSafetyMeasures();
        console.log('✅ YouTube plugin loaded with Y2mate integration');
    }

    /**
     * Setup safety measures and configurations
     */
    setupSafetyMeasures() {
        // Start cleanup interval
        setInterval(() => this.cleanupOldRequests(), 60000); // Every minute
        setInterval(() => this.cleanupTempFiles(), 300000); // Every 5 minutes
    }

    /**
     * Get random user agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Add human-like delays between requests
     */
    async addHumanDelay() {
        const delay = Math.random() * 3000 + 2000; // 2-5 seconds
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Check rate limits
     */
    isRateLimited() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
        return this.requestTimes.length >= this.maxRequestsPerMinute;
    }

    /**
     * Track request
     */
    trackRequest() {
        this.requestTimes.push(Date.now());
        this.requestCount++;
    }

    /**
     * Clean up old request times
     */
    cleanupOldRequests() {
        const oneMinuteAgo = Date.now() - 60000;
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);
    }

    /**
     * Register YouTube commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('ytv', this.downloadYouTube.bind(this), {
            description: 'Download YouTube video or short',
            usage: `${config.PREFIX}ytv <url>`,
            category: 'media',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        this.bot.messageHandler.registerCommand('yts', this.searchYouTube.bind(this), {
            description: 'Search YouTube videos',
            usage: `${config.PREFIX}yts <search term>`,
            category: 'media',
            plugin: 'youtube',
            source: 'youtube.js'
        });
    }

    /**
     * Extract video info using Y2mate API
     */
    async getVideoInfoFromY2mate(url) {
        const userAgent = this.getRandomUserAgent();

        for (const endpoint of this.y2mateEndpoints) {
            try {
                // Analyze video
                const analyzeResponse = await axios.post(endpoint.replace('convert', 'analyze'), {
                    k_query: url,
                    k_page: 'home',
                    hl: 'en',
                    q_auto: 0
                }, {
                    headers: {
                        'User-Agent': userAgent,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://www.y2mate.com',
                        'Referer': 'https://www.y2mate.com/en68',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 15000
                });

                if (analyzeResponse.data && analyzeResponse.data.status === 'ok') {
                    return analyzeResponse.data;
                }
            } catch (error) {
                console.log(`Y2mate endpoint ${endpoint} failed:`, error.message);
                continue;
            }
        }

        throw new Error('All Y2mate endpoints failed');
    }

    /**
     * Get download link using Y2mate API
     */
    async getDownloadLinkFromY2mate(videoId, ftype, fquality) {
        const userAgent = this.getRandomUserAgent();

        for (const endpoint of this.y2mateEndpoints) {
            try {
                const convertEndpoint = endpoint.includes('analyze') 
                    ? endpoint.replace('analyze/ajax', 'convert') 
                    : endpoint;

                const convertResponse = await axios.post(convertEndpoint, {
                    vid: videoId,
                    k: ftype + fquality
                }, {
                    headers: {
                        'User-Agent': userAgent,
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://www.y2mate.com',
                        'Referer': 'https://www.y2mate.com/en68',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    timeout: 20000
                });

                if (convertResponse.data && convertResponse.data.status === 'ok') {
                    return convertResponse.data.dlink;
                }
            } catch (error) {
                console.log(`Y2mate convert endpoint failed:`, error.message);
                continue;
            }
        }

        throw new Error('Failed to get download link from Y2mate');
    }

    /**
     * Download YouTube video using Y2mate
     */
    async downloadYouTube(messageInfo) {
        let tempFile;
        try {
            // Check rate limiting
            if (this.isRateLimited()) {
                await this.bot.messageHandler.reply(messageInfo, '⏰ Too many requests. Please wait a moment before trying again.');
                return;
            }

            const { args } = messageInfo;
            let url = null;

            // Check for quoted/tagged message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
                let quotedText = '';

                if (quotedMessage.conversation) {
                    quotedText = quotedMessage.conversation;
                } else if (quotedMessage.extendedTextMessage?.text) {
                    quotedText = quotedMessage.extendedTextMessage.text;
                } else if (quotedMessage.imageMessage?.caption) {
                    quotedText = quotedMessage.imageMessage.caption;
                } else if (quotedMessage.videoMessage?.caption) {
                    quotedText = quotedMessage.videoMessage.caption;
                }

                const urlRegex = /https?:\/\/[^\s]+/g;
                const urls = quotedText.match(urlRegex) || [];
                const youtubeUrl = urls.find(u => this.isValidYouTubeUrl(u));

                if (youtubeUrl) {
                    url = youtubeUrl;
                }
            }

            if (!url && args && args.length > 0) {
                url = args[0];
            }

            if (!url) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a YouTube URL or reply to a message containing one\n\nUsage: ${config.PREFIX}ytv <url>\nOr reply to a message: ${config.PREFIX}ytv\n\nExample: ${config.PREFIX}ytv https://youtu.be/dQw4w9WgXcQ`);
                return;
            }

            if (!this.isValidYouTubeUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid YouTube URL. Please provide a valid YouTube video link.');
                return;
            }

            this.trackRequest();
            await this.addHumanDelay();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing YouTube video via Y2mate...\n⏳ Please wait...');

            try {
                // Get video info from Y2mate
                const videoInfo = await this.getVideoInfoFromY2mate(url);

                if (!videoInfo.links || !videoInfo.links.mp4) {
                    throw new Error('No MP4 formats available');
                }

                const title = videoInfo.title || 'YouTube Video';
                const duration = parseInt(videoInfo.t || 0);

                // Check video length (limit to 10 minutes)
                if (duration > 600) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video is too long (${this.formatDuration(duration)}). Please use videos shorter than 10 minutes.`);
                    return;
                }

                // Find best quality (prefer 720p, fallback to lower)
                const qualities = Object.keys(videoInfo.links.mp4);
                const preferredQuality = qualities.includes('720') ? '720' : 
                                       qualities.includes('480') ? '480' : 
                                       qualities.includes('360') ? '360' : 
                                       qualities[0];

                const videoFormat = videoInfo.links.mp4[preferredQuality];

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🔄 Downloading video...\n📹 *${title}*\n📊 *Quality:* ${preferredQuality}p\n⏱️ *Duration:* ${this.formatDuration(duration)}\n⏳ Getting download link...`,
                    quoted: processingMsg
                });

                // Get download link
                const downloadLink = await this.getDownloadLinkFromY2mate(videoInfo.vid, videoFormat.f, videoFormat.q);

                if (!downloadLink) {
                    throw new Error('Failed to get download link');
                }

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `🔄 Downloading video file...\n📹 *${title}*\n⏳ Please wait while we download the video...`,
                    quoted: processingMsg
                });

                // Download the video file
                const response = await axios.get(downloadLink, {
                    responseType: 'arraybuffer',
                    timeout: 300000, // 5 minutes timeout
                    headers: {
                        'User-Agent': this.getRandomUserAgent(),
                        'Referer': 'https://www.y2mate.com/'
                    },
                    maxContentLength: 100 * 1024 * 1024 // 100MB limit
                });

                if (!response.data) {
                    throw new Error('Failed to download video file');
                }

                const videoBuffer = Buffer.from(response.data);

                // Check file size
                if (videoBuffer.length > 100 * 1024 * 1024) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Video file is too large (>100MB). Please use a shorter video.');
                    return;
                }

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    fileName: `${title.replace(/[^\w\s]/gi, '')}.mp4`,
                    caption: `📹 *${title}*\n⏱️ *Duration:* ${this.formatDuration(duration)}\n📊 *Quality:* ${preferredQuality}p\n🤖 *Downloaded by:* ${config.BOT_NAME}`
                });

                // Delete processing message
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, { delete: processingMsg.key });
                } catch (e) {
                    // Ignore delete errors
                }

            } catch (downloadError) {
                console.error('Y2mate download error:', downloadError);

                let errorMessage = '❌ Failed to download YouTube video via Y2mate.';

                if (downloadError.message?.includes('timeout')) {
                    errorMessage = '❌ Download timeout. The video may be too large or connection is slow.';
                } else if (downloadError.message?.includes('unavailable')) {
                    errorMessage = '❌ This video is not available for download (may be private or restricted).';
                } else if (downloadError.message?.includes('format')) {
                    errorMessage = '❌ No compatible video format found for this video.';
                }

                await this.bot.messageHandler.reply(messageInfo, errorMessage);
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again later.');
        } finally {
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
        }
    }

    /**
     * Search YouTube videos using simple search
     */
    async searchYouTube(messageInfo) {
        try {
            if (this.isRateLimited()) {
                await this.bot.messageHandler.reply(messageInfo, '⏰ Too many requests. Please wait a moment before trying again.');
                return;
            }

            const { args } = messageInfo;

            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`);
                return;
            }

            const searchQuery = args.join(' ');
            this.trackRequest();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching YouTube...');

            try {
                // Use YouTube search URL (no API needed for basic search)
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;

                const response = await axios.get(searchUrl, {
                    headers: {
                        'User-Agent': this.getRandomUserAgent()
                    },
                    timeout: 15000
                });

                // Extract video IDs and titles using regex (basic parsing)
                const videoMatches = response.data.match(/"videoId":"([^"]+)","title":{"runs":\[{"text":"([^"]+)"/g);

                if (!videoMatches || videoMatches.length === 0) {
                    throw new Error('No search results found');
                }

                let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;

                const results = videoMatches.slice(0, 5).map((match, index) => {
                    const videoIdMatch = match.match(/"videoId":"([^"]+)"/);
                    const titleMatch = match.match(/"text":"([^"]+)"/);

                    if (videoIdMatch && titleMatch) {
                        const videoId = videoIdMatch[1];
                        const title = titleMatch[1].replace(/\\u0026/g, '&');
                        const url = `https://youtu.be/${videoId}`;

                        resultText += `${index + 1}. *${title}*\n`;
                        resultText += `🔗 ${url}\n\n`;
                    }
                });

                resultText += `💡 *Tip:* Use \`${config.PREFIX}ytv <url>\` to download any of these videos.`;

                await this.bot.messageHandler.reply(messageInfo, resultText);

            } catch (searchError) {
                console.error('YouTube search error:', searchError);
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Failed to search YouTube. Please try again later.');
            }

        } catch (error) {
            console.error('Error in YouTube search command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while searching YouTube. Please try again later.');
        }
    }

    /**
     * Validate YouTube URL
     */
    isValidYouTubeUrl(url) {
        const youtubePatterns = [
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/[\w-]+/,
            /(?:https?:\/\/)?youtu\.be\/[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/,
            /(?:https?:\/\/)?(?:m\.)?youtube\.com\/watch\?v=[\w-]+/,
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/v\/[\w-]+/
        ];

        return youtubePatterns.some(pattern => pattern.test(url));
    }

    /**
     * Format duration from seconds to MM:SS
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const remainingSeconds = seconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Format large numbers
     */
    formatNumber(num) {
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(1) + 'B';
        } else if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * Get plugin statistics
     */
    getStats() {
        return {
            totalRequests: this.requestCount,
            recentRequests: this.requestTimes.length,
            rateLimited: this.isRateLimited()
        };
    }

    /**
     * Clean up temp files
     */
    async cleanupTempFiles() {
        const tmpDir = path.join(__dirname, '..', 'tmp');
        try {
            const files = await fs.readdir(tmpDir);
            const videoFiles = files.filter(file => file.startsWith('video_'));

            for (const file of videoFiles) {
                const filePath = path.join(tmpDir, file);
                const stats = await fs.stat(filePath);

                // Delete files older than 1 hour
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    await fs.unlink(filePath).catch(() => {});
                }
            }
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

module.exports = new YouTubePlugin();