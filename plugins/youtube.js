/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using yt-dlp (2025 most reliable method)
 */

const youtubedl = require('youtube-dl-exec');
const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using yt-dlp (most reliable 2025)';
        this.version = '9.0.0';
        
        // YouTube URL regex
        this.ytIdRegex = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?$/;
        this.ytIdExtractRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        
        // File size limits
        this.videoSizeLimit = 2 * 1024 * 1024 * 1024; // 2GB (WhatsApp document limit as of May 2022)
        this.videoMediaLimit = 30 * 1024 * 1024; // 30MB (for video messages)
        this.audioSizeLimit = 100 * 1024 * 1024; // 100MB
    }

    /**
     * Generate unique filename to prevent concurrency conflicts
     */
    generateUniqueFilename(prefix = 'yt', extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
    }

    /**
     * Validate YouTube URL and extract video ID safely
     */
    validateYouTubeUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        const cleanUrl = url.trim().replace(/[;&|`$(){}\[\]"'\\]/g, '');
        
        try {
            const urlObj = new URL(cleanUrl);
            if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'].includes(urlObj.hostname)) {
                return null;
            }
            
            const match = this.ytIdExtractRegex.exec(cleanUrl);
            if (match && match[1]) {
                return {
                    url: cleanUrl,
                    videoId: match[1]
                };
            }
        } catch {
            return null;
        }
        
        return null;
    }

    /**
     * Format file size for display
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB'];
        const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
        const size = bytes / Math.pow(1024, unitIndex);
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    /**
     * Recursively search for a YouTube URL in any string field of an object
     */
    extractYouTubeUrlFromObject(obj) {
        const ytUrlRegex = /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/i;
        if (!obj || typeof obj !== 'object') return null;
        for (const key in obj) {
            if (typeof obj[key] === 'string') {
                const match = obj[key].match(ytUrlRegex);
                if (match) return match[0];
            } else if (typeof obj[key] === 'object') {
                const found = this.extractYouTubeUrlFromObject(obj[key]);
                if (found) return found;
            }
        }
        return null;
    }

    /**
     * Download video using yt-dlp with anti-bot protection
     */
    async downloadVideoWithYtDlp(url, tempDir) {
        const uniqueFilename = this.generateUniqueFilename('yt_video', 'mp4');
        const outputPath = path.join(tempDir, uniqueFilename);
        
        try {
            // Common options for anti-bot evasion (NO COOKIES - they cause issues on Windows)
            const commonOptions = {
                noWarnings: true,
                noCheckCertificates: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'accept-language:en-US,en;q=0.9'
                ]
            };
            
            // Get video info first to check size
            const info = await youtubedl(url, {
                ...commonOptions,
                dumpSingleJson: true
            });

            // Download video with best format under 2GB
            await youtubedl(url, {
                output: outputPath,
                format: 'best[filesize<2000M][ext=mp4]/best[ext=mp4]/best',
                ...commonOptions
            });

            // Check if file exists and get size
            if (await fs.pathExists(outputPath)) {
                const stats = await fs.stat(outputPath);
                
                if (stats.size > this.videoSizeLimit) {
                    await fs.unlink(outputPath).catch(() => {});
                    throw new Error(`Video too large (${this.formatFileSize(stats.size)}). WhatsApp limit is 2GB.`);
                }
                
                return {
                    path: outputPath,
                    size: stats.size,
                    title: info.title || 'video',
                    isLarge: stats.size > this.videoMediaLimit // Flag if over 16MB
                };
            }
            
            throw new Error('Download failed: file not created');

        } catch (error) {
            // Clean up on error
            if (await fs.pathExists(outputPath)) {
                await fs.unlink(outputPath).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Download audio using yt-dlp with anti-bot protection
     */
    async downloadAudioWithYtDlp(url, tempDir) {
        const uniqueFilename = this.generateUniqueFilename('yt_audio', 'm4a');
        const outputPath = path.join(tempDir, uniqueFilename);
        
        try {
            const commonOptions = {
                noWarnings: true,
                noCheckCertificates: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'accept-language:en-US,en;q=0.9'
                ]
            };
            
            // Get video info
            const info = await youtubedl(url, {
                ...commonOptions,
                dumpSingleJson: true
            });

            // Download audio only
            await youtubedl(url, {
                output: outputPath,
                extractAudio: true,
                audioFormat: 'm4a',
                audioQuality: 0,
                ...commonOptions
            });

            // Check if file exists
            if (await fs.pathExists(outputPath)) {
                const stats = await fs.stat(outputPath);
                
                if (stats.size > this.audioSizeLimit) {
                    await fs.unlink(outputPath).catch(() => {});
                    throw new Error(`Audio too large (${this.formatFileSize(stats.size)}). WhatsApp limit is 100MB.`);
                }
                
                return {
                    path: outputPath,
                    size: stats.size,
                    title: info.title || 'audio'
                };
            }
            
            throw new Error('Download failed: file not created');

        } catch (error) {
            if (await fs.pathExists(outputPath)) {
                await fs.unlink(outputPath).catch(() => {});
            }
            throw error;
        }
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded with yt-dlp (most reliable 2025 method)');
        return this;
    }

    /**
     * Register YouTube commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('ytv', this.downloadVideo.bind(this), {
            description: 'Download YouTube video',
            usage: `${config.PREFIX}ytv <url>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        this.bot.messageHandler.registerCommand('yta', this.downloadAudio.bind(this), {
            description: 'Download YouTube audio',
            usage: `${config.PREFIX}yta <url>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        this.bot.messageHandler.registerCommand('yts', this.searchYouTube.bind(this), {
            description: 'Search YouTube videos',
            usage: `${config.PREFIX}yts <search term>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });
    }

    /**
     * Download YouTube video
     */
    async downloadVideo(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            // Use pinterest.js style quoted message extraction for robust reply/tag support
            if (!url) {
                const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      messageInfo.message?.quotedMessage;
                if (quotedMessage) {
                    url = this.extractYouTubeUrlFromObject(quotedMessage) || '';
                }
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL\n\nUsage: ${config.PREFIX}ytv <url>`);
            }

            const validatedUrl = this.validateYouTubeUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }
            
            url = validatedUrl.url;

            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Download video
                const result = await this.downloadVideoWithYtDlp(url, tempDir);
                
                // Read file as buffer
                const videoBuffer = await fs.readFile(result.path);
                
                // Send as document if over 16MB, otherwise as video
                if (result.isLarge) {
                    // Send as document for files over 16MB
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        document: videoBuffer,
                        mimetype: 'video/mp4',
                        fileName: path.basename(result.path)
                    });
                } else {
                    // Send as video for files under 16MB
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        video: videoBuffer,
                        mimetype: 'video/mp4',
                        fileName: path.basename(result.path)
                    });
                }

                // Clean up
                await fs.unlink(result.path).catch(() => {});

            } catch (error) {
                console.error('YouTube video download failed:', error);
                
                let errorMsg = '❌ Download failed. ';
                if (error.message.includes('private')) {
                    errorMsg += 'Video is private or unavailable.';
                } else if (error.message.includes('age')) {
                    errorMsg += 'Video is age-restricted.';
                } else if (error.message.includes('too large')) {
                    errorMsg += error.message;
                } else {
                    errorMsg += 'Please try again later or try a different video.';
                }
                
                await this.bot.messageHandler.reply(messageInfo, errorMsg);
            }

        } catch (error) {
            console.error('YouTube video download error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the video');
        }
    }

    /**
     * Download YouTube audio
     */
    async downloadAudio(messageInfo) {
        try {
            let input = messageInfo.args.join(' ').trim();
            if (!input && messageInfo.quoted?.text) input = messageInfo.quoted.text;
            
            if (!input) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL\n\nUsage: ${config.PREFIX}yta <url>`);
            }

            const validatedUrl = this.validateYouTubeUrl(input);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }
            
            const url = validatedUrl.url;
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                '⏳ Downloading audio using yt-dlp...');

            const tempDir = path.join(__dirname, '..', 'tmp');
            await fs.ensureDir(tempDir);

            try {
                // Download audio
                const result = await this.downloadAudioWithYtDlp(url, tempDir);
                
                // Read file as buffer
                const audioBuffer = await fs.readFile(result.path);
                
                // Send audio
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    fileName: path.basename(result.path)
                });

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `✅ Audio downloaded successfully!\n🎵 ${result.title}\n📦 Size: ${this.formatFileSize(result.size)}`,
                    edit: processingMsg.key
                });

                // Clean up
                await fs.unlink(result.path).catch(() => {});

            } catch (error) {
                console.error('YouTube audio download failed:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Failed to download audio: ${error.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube audio download error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the audio');
        }
    }

    /**
     * Search YouTube videos
     */
    async searchYouTube(messageInfo) {
        try {
            const query = messageInfo.args.join(' ').trim();
            
            if (!query) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a search term\n\nUsage: ${config.PREFIX}yts <search term>`);
            }

            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching YouTube...');

            try {
                // Use yt-dlp to search YouTube
                const results = await youtubedl(`ytsearch5:${query}`, {
                    dumpSingleJson: true,
                    noWarnings: true,
                    flatPlaylist: true
                });

                if (!results || !results.entries || results.entries.length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No videos found for your search',
                        edit: processingMsg.key
                    });
                    return;
                }

                let resultText = `🔍 *Search Results for "${query}":*\n\n`;
                
                results.entries.slice(0, 5).forEach((video, index) => {
                    const duration = video.duration ? this.formatDuration(video.duration) : 'Unknown';
                    const views = video.view_count ? this.formatViews(video.view_count) : 'No views';
                    const url = `https://www.youtube.com/watch?v=${video.id}`;
                    
                    resultText += `*${index + 1}.* ${video.title}\n`;
                    resultText += `👤 ${video.uploader || 'Unknown'}\n`;
                    resultText += `⏱️ ${duration} | 👁️ ${views}\n`;
                    resultText += `🔗 ${url}\n\n`;
                });

                resultText += `💡 Use ${config.PREFIX}ytv <url> to download video\n`;
                resultText += `💡 Use ${config.PREFIX}yta <url> to download audio`;

                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: resultText,
                    edit: processingMsg.key
                });

            } catch (error) {
                console.error('YouTube search error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Search failed. Please try again later.',
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube search error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while searching');
        }
    }

    /**
     * Format duration in seconds to readable format
     */
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format view count to readable format
     */
    formatViews(count) {
        if (count >= 1000000) {
            return `${(count / 1000000).toFixed(1)}M views`;
        } else if (count >= 1000) {
            return `${(count / 1000).toFixed(1)}K views`;
        }
        return `${count} views`;
    }
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new YouTubePlugin();
        await plugin.init(bot);
        return plugin;
    }
};