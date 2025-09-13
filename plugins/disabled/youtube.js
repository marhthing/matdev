/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using MATDEV API (2025 reliable method)
 */

const axios = require('axios');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using MATDEV API (2025 reliable method)';
        this.version = '7.0.0';
        
        // API Configuration
        this.apiBase = 'https://matdev-api-xdry.vercel.app';
        this.apiTimeout = 30000; // 30 seconds
        
        // YouTube URL regex - more strict validation
        this.ytIdRegex = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?$/;
        this.ytIdExtractRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        
        // File size limits
        this.videoSizeLimit = 14 * 1024 * 1024; // 14MB
        this.audioSizeLimit = 12 * 1024 * 1024; // 12MB
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
     * Call MATDEV API to download media
     */
    async callDownloadAPI(url, quality = 'medium') {
        try {
            const response = await axios.post(`${this.apiBase}/api/download`, {
                url: url,
                type: 'youtube',
                quality: quality
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'MATDEV-Bot/7.0'
                },
                timeout: this.apiTimeout
            });

            if (!response.data.success) {
                throw new Error(response.data.message || 'API download failed');
            }

            return response.data.data;
        } catch (error) {
            if (error.response) {
                const errorMsg = error.response.data?.message || `API error: ${error.response.status}`;
                throw new Error(errorMsg);
            } else if (error.code === 'ECONNABORTED') {
                throw new Error('Download timeout - video may be too large or slow to process');
            } else {
                throw new Error(`Network error: ${error.message}`);
            }
        }
    }

    /**
     * Call MATDEV API to search YouTube
     */
    async callSearchAPI(query, limit = 5) {
        try {
            const response = await axios.post(`${this.apiBase}/api/search`, {
                query: query,
                limit: limit
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'MATDEV-Bot/7.0'
                },
                timeout: 15000 // 15 seconds for search
            });

            if (!response.data.success) {
                throw new Error(response.data.message || 'Search failed');
            }

            return response.data.results;
        } catch (error) {
            if (error.response) {
                const errorMsg = error.response.data?.message || `Search API error: ${error.response.status}`;
                throw new Error(errorMsg);
            } else {
                throw new Error(`Search failed: ${error.message}`);
            }
        }
    }

    /**
     * Validate YouTube URL and extract video ID safely
     */
    validateYouTubeUrl(url) {
        if (!url || typeof url !== 'string') return null;
        
        // Remove any potential dangerous characters
        const cleanUrl = url.trim().replace(/[;&|`$(){}\[\]"'\\]/g, '');
        
        try {
            // Validate as proper URL
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
     * Download media file from URL and save temporarily
     */
    async downloadMediaFile(mediaUrl, filename) {
        const tempDir = path.join(__dirname, '..', 'tmp');
        await fs.ensureDir(tempDir);
        
        const tempFile = path.join(tempDir, filename);
        
        try {
            const response = await axios.get(mediaUrl, {
                responseType: 'stream',
                timeout: 60000, // 1 minute timeout
                headers: {
                    'User-Agent': 'MATDEV-Bot/7.0'
                }
            });

            // Check content length
            const contentLength = parseInt(response.headers['content-length'] || '0');
            if (contentLength > this.videoSizeLimit) {
                throw new Error('File too large for WhatsApp');
            }

            // Write to temp file
            await new Promise((resolve, reject) => {
                const writeStream = fs.createWriteStream(tempFile);
                response.data.pipe(writeStream);
                
                response.data.on('error', reject);
                writeStream.on('error', reject);
                writeStream.on('finish', resolve);
            });

            // Verify file size after download
            const stats = await fs.stat(tempFile);
            return {
                path: tempFile,
                size: stats.size
            };

        } catch (error) {
            // Clean up on error
            await fs.unlink(tempFile).catch(() => {});
            throw error;
        }
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
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded with MATDEV API (2025 reliable method) and proxy support');
        return this;
    }

    /**
     * Register YouTube commands
     */
    registerCommands() {
        // Video download command
        this.bot.messageHandler.registerCommand('ytv', this.downloadVideo.bind(this), {
            description: 'Download YouTube video',
            usage: `${config.PREFIX}ytv <url>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        // Audio download command  
        this.bot.messageHandler.registerCommand('yta', this.downloadAudio.bind(this), {
            description: 'Download YouTube audio',
            usage: `${config.PREFIX}yta <url or search term>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });

        // Search command
        this.bot.messageHandler.registerCommand('yts', this.searchYouTube.bind(this), {
            description: 'Search YouTube videos',
            usage: `${config.PREFIX}yts <search term>`,
            category: 'download',
            plugin: 'youtube',
            source: 'youtube.js'
        });
    }

    /**
     * Download YouTube video using MATDEV API
     */
    async downloadVideo(messageInfo) {
        try {
            let url = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!url && messageInfo.quoted?.text) {
                url = messageInfo.quoted.text;
            }
            
            if (!url) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL\n\nUsage: ${config.PREFIX}ytv <url>`);
            }

            // Handle quality selection from URL parameters
            let quality = 'medium'; // Default quality for API
            if (url.includes('quality:')) {
                const [realUrl, customQuality] = url.split(' quality:');
                url = realUrl.trim();
                quality = customQuality.trim().toLowerCase();
            }
            
            // Validate YouTube URL
            const validatedUrl = this.validateYouTubeUrl(url);
            if (!validatedUrl) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }
            url = validatedUrl.url;

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, 
                '⏳ Processing YouTube video download...');

            try {
                await this.downloadVideoWithAPI(url, quality, messageInfo, processingMsg);
            } catch (error) {
                console.error('YouTube video download failed:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: `❌ Download failed: ${error.message}`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('YouTube video download error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ An error occurred while processing the video');
        }
    }

    /**
     * Download video using MATDEV API
     */
    async downloadVideoWithAPI(url, quality, messageInfo, processingMsg) {
        try {
            // Update processing message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '🔄 Fetching video from API...',
                edit: processingMsg.key
            });

            // Call API to get download data
            const apiData = await this.callDownloadAPI(url, quality);
            
            if (!apiData.media || apiData.media.length === 0) {
                throw new Error('No video found or video is unavailable');
            }

            const videoMedia = apiData.media.find(m => m.type === 'video') || apiData.media[0];
            
            if (!videoMedia || !videoMedia.url) {
                throw new Error('No video download URL found');
            }

            // Update processing message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '📥 Downloading video file...',
                edit: processingMsg.key
            });

            // Generate unique filename
            const uniqueFilename = this.generateUniqueFilename('yt_video', 'mp4');
            
            // Download the video file
            const downloadedFile = await this.downloadMediaFile(videoMedia.url, uniqueFilename);
            
            // Check file size (14MB limit)
            if (downloadedFile.size > this.videoSizeLimit) {
                await fs.unlink(downloadedFile.path).catch(() => {});
                throw new Error('Video too large (14MB max). Try a lower quality.');
            }
            
            // Update processing message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '📤 Sending video...',
                edit: processingMsg.key
            });
            
            // Send video file
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                video: { url: downloadedFile.path },
                caption: `✅ YouTube Video Downloaded\n🎬 ${apiData.title || 'Video'}\n👤 ${apiData.author || 'Unknown'}\n📄 Size: ${this.formatFileSize(downloadedFile.size)}`,
                fileName: uniqueFilename
            });
            
            // Clean up
            await fs.unlink(downloadedFile.path).catch(() => {});
            
            // Update final message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '✅ ytv completed',
                edit: processingMsg.key
            });
            
        } catch (error) {
            console.error('API video download error:', error);
            throw new Error(`${error.message}`);
        }
    }

    /**
     * Download YouTube audio using MATDEV API
     */
    async downloadAudio(messageInfo) {
        try {
            let input = messageInfo.args.join(' ').trim();
            
            // Check if it's a reply to a message
            if (!input && messageInfo.quoted?.text) {
                input = messageInfo.quoted.text;
            }
            
            if (!input) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a YouTube URL or search term\n\nUsage: ${config.PREFIX}yta <url or search>`);
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing audio...');

            let url = input;

            // Check if it's a URL or search term
            const validatedUrl = this.validateYouTubeUrl(input);
            if (!validatedUrl) {
                // Search for the video using our API
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '🔍 Searching for video...',
                        edit: processingMsg.key
                    });

                    const searchResults = await this.callSearchAPI(input, 1);
                    if (!searchResults || searchResults.length === 0) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ No videos found for your search',
                            edit: processingMsg.key
                        });
                        return;
                    }

                    const firstResult = searchResults[0];
                    url = firstResult.url;
                } catch (searchError) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Search failed. Please provide a direct YouTube URL.',
                        edit: processingMsg.key
                    });
                    return;
                }
            } else {
                url = validatedUrl.url;
            }

            try {
                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '🔄 Fetching audio from API...',
                    edit: processingMsg.key
                });

                // Call API to get download data with low quality for audio
                const apiData = await this.callDownloadAPI(url, 'low');
                
                if (!apiData.media || apiData.media.length === 0) {
                    throw new Error('No audio found or video is unavailable');
                }

                // Look for video media (we'll extract audio from it)
                const videoMedia = apiData.media.find(m => m.type === 'video') || apiData.media[0];
                
                if (!videoMedia || !videoMedia.url) {
                    throw new Error('No download URL found');
                }

                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '📥 Downloading audio file...',
                    edit: processingMsg.key
                });

                // Generate unique filename
                const uniqueFilename = this.generateUniqueFilename('yt_audio', 'mp4');
                
                // Download the video file (we'll send it as audio)
                const downloadedFile = await this.downloadMediaFile(videoMedia.url, uniqueFilename);
                
                // Check file size (12MB limit for audio)
                if (downloadedFile.size > this.audioSizeLimit) {
                    await fs.unlink(downloadedFile.path).catch(() => {});
                    throw new Error('Audio too large (12MB max). Try a shorter video.');
                }
                
                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '📤 Sending audio...',
                    edit: processingMsg.key
                });
                
                // Send as audio file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: { url: downloadedFile.path },
                    mimetype: 'audio/mp4',
                    fileName: uniqueFilename.replace('.mp4', '.m4a')
                });
                
                // Clean up
                await fs.unlink(downloadedFile.path).catch(() => {});
                
                // Update final message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '✅ Audio sent successfully!',
                    edit: processingMsg.key
                });

                console.log('✅ Audio downloaded and sent successfully');

            } catch (error) {
                console.error('YouTube audio error:', error);
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
     * Search YouTube videos using MATDEV API
     */
    async searchYouTube(messageInfo) {
        try {
            const query = messageInfo.args.join(' ').trim();
            
            if (!query) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Please provide a search term\n\nUsage: ${config.PREFIX}yts <search term>`);
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔍 Searching...');

            try {
                const searchResults = await this.callSearchAPI(query, 5);
                
                if (!searchResults || searchResults.length === 0) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No videos found for your search',
                        edit: processingMsg.key
                    });
                    return;
                }

                let resultText = `🔍 *Search Results for "${query}":*\n\n`;
                
                searchResults.forEach((item, index) => {
                    const duration = item.duration || 'Unknown';
                    const views = item.views || 'No view count';
                    
                    resultText += `*${index + 1}.* ${item.title}\n`;
                    resultText += `👤 ${item.author || 'Unknown'}\n`;
                    resultText += `⏱️ ${duration} | 👁️ ${views}\n`;
                    resultText += `🔗 ${item.url}\n\n`;
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
}

// Export function for plugin initialization
module.exports = {
    init: async (bot) => {
        const plugin = new YouTubePlugin();
        await plugin.init(bot);
        return plugin;
    }
};