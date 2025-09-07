/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and shorts with enhanced safety measures
 */

const ytdl = require('@distube/ytdl-core');
const ytsr = require('ytsr');
const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and shorts downloader';
        this.version = '1.0.0';

        // Rate limiting and safety
        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/119.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15'
        ];

        // Request queue for rate limiting
        this.requestQueue = [];
        this.processing = false;
        this.maxRequestsPerMinute = 10;
        this.requestTimes = [];
    }

    /**
     * Initialize plugin with safety configurations
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupSafetyMeasures();
        console.log('✅ YouTube plugin loaded with safety measures');
    }

    /**
     * Setup safety measures and configurations
     */
    setupSafetyMeasures() {
        // Configure ytdl with safety options
        this.ytdlOptions = {
            requestOptions: {
                headers: {
                    'User-Agent': this.getRandomUserAgent(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                }
            }
        };

        // Start cleanup interval
        setInterval(() => this.cleanupOldRequests(), 60000); // Every minute
    }

    /**
     * Get random user agent to appear more human
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Add human-like delays between requests
     */
    async addHumanDelay() {
        // Random delay between 1-3 seconds to simulate human behavior
        const delay = Math.random() * 2000 + 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    /**
     * Check rate limits to avoid being flagged
     */
    isRateLimited() {
        const now = Date.now();
        const oneMinuteAgo = now - 60000;

        // Clean old requests
        this.requestTimes = this.requestTimes.filter(time => time > oneMinuteAgo);

        return this.requestTimes.length >= this.maxRequestsPerMinute;
    }

    /**
     * Add request to tracking
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
     * Download YouTube video command with safety measures
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

            // Track this request
            this.trackRequest();

            // Add human-like delay
            await this.addHumanDelay();

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing video... Please wait.');

            try {
                // Get video info with safety options
                const safeYtdlOptions = {
                    ...this.ytdlOptions,
                    requestOptions: {
                        ...this.ytdlOptions.requestOptions,
                        headers: {
                            ...this.ytdlOptions.requestOptions.headers,
                            'User-Agent': this.getRandomUserAgent() // Fresh user agent for each request
                        }
                    }
                };

                const info = await ytdl.getInfo(url, safeYtdlOptions);
                const videoDetails = info.videoDetails;

                // Check video length (limit to 10 minutes for file size)
                const duration = parseInt(videoDetails.lengthSeconds);
                if (duration > 600) { // 10 minutes
                    await this.bot.messageHandler.reply(messageInfo, 
                        `❌ Video is too long (${this.formatDuration(duration)}). Please use videos shorter than 10 minutes.`);
                    return;
                }

                // Check if video is available
                if (videoDetails.isLiveContent) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Cannot download live streams. Please use recorded videos.');
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

                // Send downloading status
                await this.bot.messageHandler.reply(messageInfo, 
                    '⬇️ Downloading video... This may take a moment.');

                // Create temporary file path
                tempFile = path.join(__dirname, '..', 'tmp', `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp4`);

                // Ensure tmp directory exists
                await fs.ensureDir(path.dirname(tempFile));

                // Download video with timeout protection
                await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Download timeout'));
                    }, 300000); // 5 minute timeout

                    const stream = ytdl(url, { 
                        format: format,
                        ...safeYtdlOptions
                    });
                    const writeStream = fs.createWriteStream(tempFile);

                    stream.pipe(writeStream);

                    stream.on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });

                    writeStream.on('error', (error) => {
                        clearTimeout(timeout);
                        reject(error);
                    });

                    writeStream.on('finish', () => {
                        clearTimeout(timeout);
                        resolve();
                    });

                    // Add progress tracking
                    stream.on('progress', (chunkLength, downloaded, total) => {
                        const percent = Math.floor((downloaded / total) * 100);
                        if (percent % 25 === 0 && percent > 0) { // Update every 25%
                            console.log(`Download progress: ${percent}%`);
                        }
                    });
                });

                // Verify file was created and has content
                const stats = await fs.stat(tempFile);
                if (stats.size === 0) {
                    throw new Error('Downloaded file is empty');
                }

                // Check file size (limit to 100MB for WhatsApp)
                if (stats.size > 100 * 1024 * 1024) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Video file is too large (>100MB). Please use a shorter video.');
                    return;
                }

                // Read video file
                const videoBuffer = await fs.readFile(tempFile);

                // Send uploading status
                await this.bot.messageHandler.reply(messageInfo, 
                    '📤 Uploading video...');

                // Create caption with video info
                const caption = `🎬 *${videoDetails.title}*\n👤 ${videoDetails.author.name}\n⏱️ ${this.formatDuration(duration)}\n📊 ${this.formatNumber(parseInt(videoDetails.viewCount))} views`;

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: videoBuffer,
                    mimetype: 'video/mp4',
                    caption: caption,
                    fileName: `${videoDetails.title.replace(/[^\w\s]/gi, '')}.mp4`
                });

                // Processing completed - video sent

            } catch (downloadError) {
                console.error('YouTube download error:', downloadError);

                let errorMessage = '❌ Failed to download YouTube video.';

                if (downloadError.message?.includes('unavailable')) {
                    errorMessage = '❌ This video is not available for download (may be private or restricted).';
                } else if (downloadError.message?.includes('timeout')) {
                    errorMessage = '❌ Download timeout. The video may be too large or connection is slow.';
                } else if (downloadError.message?.includes('format')) {
                    errorMessage = '❌ No compatible video format found for this video.';
                }

                await this.bot.messageHandler.reply(messageInfo, errorMessage);
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again later.');
        } finally {
            // Ensure temp file is deleted even if an error occurs
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
        }
    }

    /**
     * Search YouTube videos command with safety measures
     */
    async searchYouTube(messageInfo) {
        try {
            // Check rate limiting
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

            // Track this request
            this.trackRequest();

            // Add human-like delay
            await this.addHumanDelay();

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching YouTube...');

            try {
                // Search with safety options
                const searchOptions = {
                    limit: 5,
                    requestOptions: {
                        headers: {
                            'User-Agent': this.getRandomUserAgent(),
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5'
                        }
                    }
                };

                const searchResults = await ytsr(searchQuery, searchOptions);
                const videos = searchResults.items.filter(item => item.type === 'video').slice(0, 5);

                if (videos.length === 0) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No videos found for your search query.');
                    return;
                }

                let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;

                videos.forEach((video, index) => {
                    resultText += `${index + 1}. *${video.title}*\n`;
                    resultText += `👤 ${video.author?.name || 'Unknown'}\n`;
                    resultText += `⏱️ ${video.duration || 'Unknown'}\n`;
                    resultText += `👀 ${video.views || 'Unknown'} views\n`;
                    resultText += `🔗 ${video.url}\n\n`;
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
     * Validate YouTube URL with enhanced patterns
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
     * Get plugin statistics for monitoring
     */
    getStats() {
        return {
            totalRequests: this.requestCount,
            recentRequests: this.requestTimes.length,
            rateLimited: this.isRateLimited()
        };
    }

    /**
     * Clean up old temporary files
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