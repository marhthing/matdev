/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and shorts using yt-dlp
 */

const { exec } = require('child_process');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Anti-detection measures for YouTube
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

            // Global rate limit - minimum 3 seconds between any requests
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

            // Create temporary file path
            tempFile = path.join(__dirname, '..', 'tmp', `youtube_${Date.now()}.mp4`);

            // Ensure tmp directory exists
            await fs.ensureDir(path.dirname(tempFile));

            // Human-like delay before download
            await humanDelayYT(1500, 2500);

            try {
                // Ensure yt-dlp is available
                try {
                    await execAsync('yt-dlp --version', { timeout: 5000 });
                } catch (versionError) {
                    console.log('Installing yt-dlp...');
                    await execAsync('pip install --upgrade yt-dlp', { timeout: 60000 });
                }

                // Download with yt-dlp using safer options
                const command = `yt-dlp -f "best[height<=720][filesize<50M]/best[filesize<50M]/best" --no-playlist --no-check-certificate "${url}" -o "${tempFile}"`;

                console.log('Executing yt-dlp command...');
                const { stdout, stderr } = await execAsync(command, {
                    timeout: 120000,
                    maxBuffer: 1024 * 1024 * 50 // 50MB buffer
                });

                // Check if file was created and has content
                if (await fs.pathExists(tempFile)) {
                    const stats = await fs.stat(tempFile);

                    if (stats.size < 1000) {
                        throw new Error('Downloaded file is too small');
                    }

                    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
                        await this.bot.messageHandler.reply(messageInfo, '❌ Video file is too large (>50MB). Please try a shorter video.');
                        return;
                    }

                    // Read video file
                    const videoBuffer = await fs.readFile(tempFile);

                    // Send video
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: videoBuffer,
                        mimetype: 'video/mp4'
                    });

                } else {
                    throw new Error('Video file not created');
                }

            } catch (downloadError) {
                console.error('YouTube download error:', downloadError.message);

                // Try alternative method with youtube-dl
                try {
                    // Ensure youtube-dl is available
                    try {
                        await execAsync('youtube-dl --version', { timeout: 5000 });
                    } catch (ytdlVersionError) {
                        console.log('Installing youtube-dl...');
                        await execAsync('pip install --upgrade youtube-dl', { timeout: 60000 });
                    }

                    const altCommand = `youtube-dl -f "best[height<=720][filesize<50M]/best[filesize<50M]" --no-playlist "${url}" -o "${tempFile}"`;

                    console.log('Trying youtube-dl fallback...');
                    await execAsync(altCommand, { timeout: 120000 });

                    if (await fs.pathExists(tempFile)) {
                        const stats = await fs.stat(tempFile);
                        if (stats.size > 1000 && stats.size <= 50 * 1024 * 1024) {
                            const videoBuffer = await fs.readFile(tempFile);
                            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                                video: videoBuffer,
                                mimetype: 'video/mp4'
                            });
                        } else {
                            throw new Error('Invalid file size');
                        }
                    } else {
                        throw new Error('Fallback download failed');
                    }

                } catch (fallbackError) {
                    console.error('Fallback download error:', fallbackError.message);
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download YouTube video. The video may be private, age-restricted, or temporarily unavailable.');
                    return;
                }
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again.');
        } finally {
            // Clean up temporary files
            if (tempFile) {
                await fs.unlink(tempFile).catch(() => {});
            }
        }
    }

    /**
     * Search YouTube videos command (simplified)
     */
    async searchYouTube(messageInfo) {
        try {
            const { args } = messageInfo;

            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`);
                return;
            }

            const searchQuery = args.join(' ');

            try {
                // Use yt-dlp to search
                const searchCmd = `yt-dlp "ytsearch5:${searchQuery}" --get-title --get-id --no-download`;
                const { stdout } = await execAsync(searchCmd, { timeout: 20000 });

                if (stdout.trim()) {
                    const lines = stdout.trim().split('\n');
                    let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;

                    for (let i = 0; i < lines.length; i += 2) {
                        const title = lines[i];
                        const id = lines[i + 1];
                        if (title && id) {
                            resultText += `${Math.floor(i/2) + 1}. ${title}\nhttps://youtu.be/${id}\n\n`;
                        }
                    }

                    resultText += `💡 *Tip:* Use \`${config.PREFIX}ytv <url>\` to download any of these videos.`;

                    await this.bot.messageHandler.reply(messageInfo, resultText);
                } else {
                    await this.bot.messageHandler.reply(messageInfo, '❌ No videos found for your search query.');
                }

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
     * Extract video ID from YouTube URL
     */
    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/.*[?&]v=([a-zA-Z0-9_-]{11})/
        ];

        for (const pattern of patterns) {
            const match = url.match(pattern);
            if (match) return match[1];
        }
        return null;
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