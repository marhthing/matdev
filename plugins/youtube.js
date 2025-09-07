
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
        let tempDir;
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

            try {
                // Create temporary directory for this download
                tempDir = path.join(__dirname, '..', 'tmp', `yt_${Date.now()}`);
                await fs.ensureDir(tempDir);
                
                // Human-like delay before download
                await humanDelayYT(1500, 2500);

                // Use youtube-dl python package or fallback methods
                let downloadSuccess = false;
                
                // Method 1: Try with python3 and yt-dlp
                try {
                    const ytDlpCmd = `cd "${tempDir}" && python3 -m pip install --user yt-dlp --quiet && python3 -m yt_dlp -f "best[height<=720][ext=mp4]/best[ext=mp4]/best" --max-filesize 50M "${url}" -o "video.%(ext)s"`;
                    await execAsync(ytDlpCmd, { timeout: 60000 });
                    
                    const videoFiles = await fs.readdir(tempDir);
                    const videoFile = videoFiles.find(f => f.startsWith('video.') && (f.endsWith('.mp4') || f.endsWith('.webm')));
                    
                    if (videoFile) {
                        tempFile = path.join(tempDir, videoFile);
                        downloadSuccess = true;
                    }
                } catch (ytDlpError) {
                    // Try Method 2: Alternative approach with curl and ffmpeg
                    try {
                        // Get video info first
                        const infoCmd = `python3 -c "
import re, urllib.request, json, sys
url = '${url}'
page = urllib.request.urlopen(url).read().decode()
video_id = re.search(r'videoId\":\"([^\"]+)', page)
if video_id:
    print(video_id.group(1))
else:
    sys.exit(1)
"`;
                        const { stdout: videoId } = await execAsync(infoCmd, { timeout: 10000 });
                        
                        if (videoId.trim()) {
                            // Try to download using a simple approach
                            const simpleCmd = `cd "${tempDir}" && wget -q --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" -O video.mp4 "https://www.youtube.com/watch?v=${videoId.trim()}"`;
                            await execAsync(simpleCmd, { timeout: 45000 });
                            
                            tempFile = path.join(tempDir, 'video.mp4');
                            const stats = await fs.stat(tempFile);
                            if (stats.size > 1000) { // At least 1KB
                                downloadSuccess = true;
                            }
                        }
                    } catch (altError) {
                        // Method 3: Use a public API service
                        try {
                            const videoId = this.extractVideoId(url);
                            if (videoId) {
                                const apiUrl = `https://api.cobalt.tools/api/json`;
                                const response = await fetch(apiUrl, {
                                    method: 'POST',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Accept': 'application/json'
                                    },
                                    body: JSON.stringify({
                                        url: url,
                                        vQuality: '720',
                                        vFormat: 'mp4',
                                        isAudioOnly: false
                                    })
                                });
                                
                                const data = await response.json();
                                if (data.status === 'success' && data.url) {
                                    const downloadCmd = `cd "${tempDir}" && wget -q --user-agent="Mozilla/5.0" -O video.mp4 "${data.url}"`;
                                    await execAsync(downloadCmd, { timeout: 45000 });
                                    
                                    tempFile = path.join(tempDir, 'video.mp4');
                                    const stats = await fs.stat(tempFile);
                                    if (stats.size > 1000) {
                                        downloadSuccess = true;
                                    }
                                }
                            }
                        } catch (apiError) {
                            // All methods failed
                        }
                    }
                }

                if (!downloadSuccess || !tempFile || !(await fs.pathExists(tempFile))) {
                    await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download YouTube video. The video may be private, age-restricted, or temporarily unavailable.');
                    return;
                }

                // Check file size
                const stats = await fs.stat(tempFile);
                if (stats.size > 50 * 1024 * 1024) { // 50MB limit
                    await this.bot.messageHandler.reply(messageInfo, '❌ Video file is too large (>50MB). Please try a shorter video.');
                    return;
                }

                if (stats.size < 1000) { // Less than 1KB is probably not a valid video
                    await this.bot.messageHandler.reply(messageInfo, '❌ Downloaded file appears to be invalid. Please try again.');
                    return;
                }

                // Read video file
                const videoBuffer = await fs.readFile(tempFile);

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: videoBuffer,
                    mimetype: 'video/mp4'
                });

            } catch (downloadError) {
                console.error('YouTube download error:', downloadError);
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to download YouTube video. Please try again later.');
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the YouTube video. Please try again.');
        } finally {
            // Clean up temporary files and directory
            if (tempDir) {
                await fs.remove(tempDir).catch(() => {});
            }
            
            // Clean up any remaining temporary files
            await this.cleanupTempFiles().catch(() => {});
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
            
            // Simple search using web scraping
            try {
                const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
                const searchCmd = `python3 -c "
import re, urllib.request
import urllib.parse
query = '${searchQuery.replace(/'/g, "\\'")}'
url = 'https://www.youtube.com/results?search_query=' + urllib.parse.quote(query)
page = urllib.request.urlopen(url).read().decode()
videos = re.findall(r'\"videoId\":\"([^\"]+)\".*?\"title\":{\"runs\":\\[{\"text\":\"([^\"]+)\"', page)
for i, (vid_id, title) in enumerate(videos[:5]):
    print(f'{i+1}. {title}')
    print(f'https://youtu.be/{vid_id}')
    print()
"`;
                
                const { stdout } = await execAsync(searchCmd, { timeout: 15000 });
                
                if (stdout.trim()) {
                    let resultText = `🔍 *YouTube Search Results*\n\nQuery: *${searchQuery}*\n\n`;
                    resultText += stdout.trim();
                    resultText += `\n\n💡 *Tip:* Use \`${config.PREFIX}ytv <url>\` to download any of these videos.`;
                    
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
     * Clean up temporary files
     */
    async cleanupTempFiles() {
        try {
            // Clean up root directory temp files
            const rootDir = path.join(__dirname, '..');
            const rootFiles = await fs.readdir(rootDir);
            
            for (const file of rootFiles) {
                if (file.includes('-watch.html') || file.includes('ytdl-') || file.startsWith('watch-')) {
                    const filePath = path.join(rootDir, file);
                    await fs.unlink(filePath).catch(() => {});
                }
            }

            // Clean up tmp directory
            const tmpDir = path.join(__dirname, '..', 'tmp');
            if (await fs.pathExists(tmpDir)) {
                const tmpFiles = await fs.readdir(tmpDir);
                for (const file of tmpFiles) {
                    if (file.startsWith('yt_') || file.includes('ytdl') || file.includes('watch')) {
                        const filePath = path.join(tmpDir, file);
                        const stat = await fs.stat(filePath).catch(() => null);
                        if (stat) {
                            if (stat.isDirectory()) {
                                await fs.remove(filePath).catch(() => {});
                            } else {
                                await fs.unlink(filePath).catch(() => {});
                            }
                        }
                    }
                }
            }
        } catch (error) {
            // Silent cleanup
        }
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
