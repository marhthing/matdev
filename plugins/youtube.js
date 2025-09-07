/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and shorts
 */

const ytdl = require('@distube/ytdl-core');
const ytsr = require('ytsr');
const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

// Anti-detection measures for YouTube
const YOUTUBE_USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0'
];

const getRandomYTUserAgent = () => YOUTUBE_USER_AGENTS[Math.floor(Math.random() * YOUTUBE_USER_AGENTS.length)];

const humanDelayYT = (min = 1000, max = 3000) => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
};

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and shorts downloader';
        this.version = '1.0.0';
        this.requestTracker = new Map(); // Track requests per user
        this.lastRequest = 0; // Global rate limiting
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded');
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
     * Download YouTube video command
     */
    async downloadYouTube(messageInfo) {
        let tempFile;
        try {
            // Rate limiting - prevent spam requests
            const userId = messageInfo.sender_jid;
            const now = Date.now();
            
            // Global rate limit - minimum 3 seconds between any requests (YouTube is stricter)
            const timeSinceLastRequest = now - this.lastRequest;
            if (timeSinceLastRequest < 3000) {
                await humanDelayYT(3000 - timeSinceLastRequest, 4000);
            }
            
            // Per-user rate limit - max 2 requests per minute for YouTube
            if (!this.requestTracker.has(userId)) {
                this.requestTracker.set(userId, []);
            }
            
            const userRequests = this.requestTracker.get(userId);
            const recentRequests = userRequests.filter(time => now - time < 60000);
            
            if (recentRequests.length >= 2) {
                await this.bot.messageHandler.reply(messageInfo, '⏳ Please wait a moment before making another YouTube request. (Rate limit: 2 per minute)');
                return;
            }
            
            recentRequests.push(now);
            this.requestTracker.set(userId, recentRequests);
            this.lastRequest = now;
            
            // Human-like delay before processing
            await humanDelayYT(1200, 2500);

            const { args } = messageInfo;
            let url = null;

            // Check for quoted/tagged message first
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (quotedMessage) {
                // Extract URL from quoted message
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

                // Look for YouTube URL in the quoted text
                const urlRegex = /https?:\/\/[^\s]+/g;
                const urls = quotedText.match(urlRegex) || [];
                const youtubeUrl = urls.find(u => this.isValidYouTubeUrl(u));

                if (youtubeUrl) {
                    url = youtubeUrl;
                }
            }

            // If no URL from quoted message, check args
            if (!url && args && args.length > 0) {
                url = args[0];
            }

            // If still no URL, show usage
            if (!url) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a YouTube URL or reply to a message containing one\n\nUsage: ${config.PREFIX}ytv <url>\nOr reply to a message: ${config.PREFIX}ytv\n\nExample: ${config.PREFIX}ytv https://youtu.be/dQw4w9WgXcQ`);
                return;
            }

            // Validate YouTube URL
            if (!this.isValidYouTubeUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid YouTube URL. Please provide a valid YouTube video link.');
                return;
            }

            // No processing message needed

            try {
                // Human-like delay before fetching video info
                await humanDelayYT(1000, 2000);
                
                // Create temporary directory for ytdl cache files
                const ytdlTempDir = path.join(__dirname, '..', 'tmp', 'ytdl_cache');
                await fs.ensureDir(ytdlTempDir);

                // Get video info with custom options and temp directory
                const info = await ytdl.getInfo(url, {
                    requestOptions: {
                        headers: {
                            'User-Agent': getRandomYTUserAgent(),
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate',
                            'DNT': '1',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1'
                        }
                    },
                    agent: {
                        localAddress: undefined,
                        jar: true
                    }
                });
                const videoDetails = info.videoDetails;

                // Check video length (limit to 10 minutes for file size)
                const duration = parseInt(videoDetails.lengthSeconds);
                if (duration > 600) { // 10 minutes
                    await this.bot.messageHandler.reply(messageInfo, `❌ Video is too long (${this.formatDuration(duration)}). Please use videos shorter than 10 minutes.`);
                    return;
                }

                // Get best quality format that's not too large
                const format = ytdl.chooseFormat(info.formats, { 
                    quality: 'highest',
                    filter: format => format.container === 'mp4' && format.hasVideo && format.hasAudio
                }) || ytdl.chooseFormat(info.formats, { quality: 'lowest' });

                if (!format) {
                    throw new Error('No suitable video format found');
                }

                // Create temporary file path
                tempFile = path.join(__dirname, '..', 'tmp', `video_${Date.now()}.mp4`);

                // Human-like delay before starting download
                await humanDelayYT(1500, 2500);

                // Download video with proper temp handling
                await new Promise((resolve, reject) => {
                    const stream = ytdl(url, { 
                        format: format,
                        requestOptions: {
                            headers: {
                                'User-Agent': getRandomYTUserAgent()
                            }
                        }
                    });
                    const writeStream = fs.createWriteStream(tempFile);

                    stream.pipe(writeStream);

                    stream.on('error', (error) => {
                        writeStream.destroy();
                        reject(error);
                    });
                    writeStream.on('error', reject);
                    writeStream.on('finish', () => {
                        // Clean up any ytdl temp files immediately
                        this.cleanupYtdlTempFiles().catch(() => {});
                        resolve();
                    });
                });

                // Read video file
                const videoBuffer = await fs.readFile(tempFile);

                // No caption needed

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: videoBuffer,
                    mimetype: 'video/mp4'
                });

                // Clean up temp file
                await fs.unlink(tempFile).catch(() => {});

                // No processing message to delete

            } catch (downloadError) {
                console.error('YouTube download error:', downloadError);

                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download YouTube video.');
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again.');
        } finally {
            // Ensure temp file is deleted even if an error occurs before reading it
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
            
            // Clean up any ytdl temporary files
            await this.cleanupYtdlTempFiles().catch(() => {});
        }
    }

    /**
     * Search YouTube videos command
     */
    async searchYouTube(messageInfo) {
        try {
            // Light rate limiting for search
            const userId = messageInfo.sender_jid;
            const now = Date.now();
            
            if (!this.requestTracker.has(`search_${userId}`)) {
                this.requestTracker.set(`search_${userId}`, []);
            }
            
            const searchRequests = this.requestTracker.get(`search_${userId}`);
            const recentSearches = searchRequests.filter(time => now - time < 30000);
            
            if (recentSearches.length >= 3) {
                await this.bot.messageHandler.reply(messageInfo, '⏳ Please wait before searching again. (Search limit: 3 per 30 seconds)');
                return;
            }
            
            recentSearches.push(now);
            this.requestTracker.set(`search_${userId}`, recentSearches);
            
            // Human-like delay
            await humanDelayYT(800, 1500);

            const { args } = messageInfo;

            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`);
                return;
            }

            const searchQuery = args.join(' ');

            // No processing message needed

            try {
                // Human-like delay before search
                await humanDelayYT(1000, 1800);
                
                const searchResults = await ytsr(searchQuery, { 
                    limit: 5,
                    requestOptions: {
                        headers: {
                            'User-Agent': getRandomYTUserAgent()
                        }
                    }
                });
                const videos = searchResults.items.filter(item => item.type === 'video').slice(0, 5);

                if (videos.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ No videos found for your search query.');
                    return;
                }

                let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;

                videos.forEach((video, index) => {
                    resultText += `${index + 1}. *${video.title}*\n`;
                    resultText += `👤 ${video.author.name}\n`;
                    resultText += `⏱️ ${video.duration}\n`;
                    resultText += `👀 ${video.views} views\n`;
                    resultText += `🔗 ${video.url}\n\n`;
                });

                resultText += `💡 *Tip:* Use \`${config.PREFIX}ytv <url>\` to download any of these videos.`;

                await this.bot.messageHandler.reply(messageInfo, resultText);

            } catch (searchError) {
                console.error('YouTube search error:', searchError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to search YouTube. Please try again.');
            }

        } catch (error) {
            console.error('Error in YouTube search command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while searching YouTube. Please try again.');
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
            /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/[\w-]+/
        ];

        return youtubePatterns.some(pattern => pattern.test(url));
    }

    /**
     * Format duration from seconds to MM:SS
     */
    formatDuration(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    /**
     * Clean up ytdl temporary files
     */
    async cleanupYtdlTempFiles() {
        try {
            // Clean up root directory ytdl files
            const rootDir = path.join(__dirname, '..');
            const rootFiles = await fs.readdir(rootDir);
            
            for (const file of rootFiles) {
                if (file.includes('-watch.html') || file.includes('ytdl-')) {
                    const filePath = path.join(rootDir, file);
                    await fs.unlink(filePath).catch(() => {});
                }
            }

            // Clean up ytdl cache directory
            const ytdlTempDir = path.join(__dirname, '..', 'tmp', 'ytdl_cache');
            if (await fs.pathExists(ytdlTempDir)) {
                const cacheFiles = await fs.readdir(ytdlTempDir);
                for (const file of cacheFiles) {
                    const filePath = path.join(ytdlTempDir, file);
                    await fs.unlink(filePath).catch(() => {});
                }
            }
        } catch (error) {
            // Silent cleanup - don't log errors
        }
    }

    /**
     * Format large numbers
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }
}

module.exports = new YouTubePlugin();