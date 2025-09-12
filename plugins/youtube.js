/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using yt-dlp (2025 reliable method)
 */

const { spawn } = require('child_process');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const ytsr = require('ytsr');
const crypto = require('crypto');
const { URL } = require('url');

// Ensure debug folder exists
const DEBUG_FOLDER = path.join('session', 'youtube-debug');
if (!fs.existsSync(DEBUG_FOLDER)) {
    fs.mkdirSync(DEBUG_FOLDER, { recursive: true });
}

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using yt-dlp (2025 reliable method)';
        this.version = '6.0.0';
        
        // YouTube URL regex - more strict validation
        this.ytIdRegex = /^https?:\/\/(?:(?:www\.|m\.|music\.)?youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:\S+)?$/;
        this.ytIdExtractRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        
        // Proxy configuration
        this.proxyList = this.loadProxies();
        this.currentProxyIndex = 0;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:122.0) Gecko/20100101 Firefox/122.0'
        ];
    }

    /**
     * Load proxy configuration from environment variables
     */
    loadProxies() {
        const proxies = [];
        
        // Load HTTP/HTTPS proxies
        const httpProxies = process.env.YOUTUBE_HTTP_PROXIES || process.env.HTTP_PROXIES || '';
        if (httpProxies) {
            const httpProxyList = httpProxies.split(',').map(p => p.trim()).filter(Boolean);
            proxies.push(...httpProxyList.map(proxy => ({ type: 'http', url: proxy })));
        }
        
        // Load SOCKS proxies
        const socksProxies = process.env.YOUTUBE_SOCKS_PROXIES || process.env.SOCKS_PROXIES || '';
        if (socksProxies) {
            const socksProxyList = socksProxies.split(',').map(p => p.trim()).filter(Boolean);
            proxies.push(...socksProxyList.map(proxy => ({ type: 'socks', url: proxy })));
        }

        if (proxies.length > 0) {
            console.log(`🔄 YouTube plugin: Loaded ${proxies.length} proxy server(s) for IP masking`);
        }
        
        return proxies;
    }

    /**
     * Get next proxy from the list (round-robin)
     */
    getNextProxy() {
        if (this.proxyList.length === 0) return null;
        
        const proxy = this.proxyList[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
        return proxy;
    }

    /**
     * Validate and sanitize proxy URL to prevent injection
     */
    validateProxy(proxyUrl) {
        if (!proxyUrl || typeof proxyUrl !== 'string') return null;
        
        try {
            const url = new URL(proxyUrl);
            // Only allow http, https, socks4, socks5 protocols
            if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
                return null;
            }
            // Ensure hostname is not empty and doesn't contain dangerous chars
            if (!url.hostname || /[;&|`$(){}\[\]"'\\]/.test(url.hostname)) {
                return null;
            }
            return proxyUrl;
        } catch {
            return null;
        }
    }

    /**
     * Get random user agent
     */
    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    /**
     * Generate unique filename to prevent concurrency conflicts
     */
    generateUniqueFilename(prefix = 'yt', extension = '') {
        const timestamp = Date.now();
        const random = crypto.randomBytes(4).toString('hex');
        const ext = extension.startsWith('.') ? extension : (extension ? `.${extension}` : '');
        return `${prefix}_${timestamp}_${random}${ext}`;
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
     * SECURITY FIXED: Safe yt-dlp execution using spawn instead of execAsync
     */
    async executeYtDlpSafely(args, options = {}) {
        return new Promise((resolve, reject) => {
            const process = spawn('yt-dlp', args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                ...options
            });
            
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            const timeout = setTimeout(() => {
                process.kill('SIGKILL');
                reject(new Error('Process timeout'));
            }, options.timeout || 30000);
            
            process.on('close', (code) => {
                clearTimeout(timeout);
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}: ${stderr}`));
                }
            });
            
            process.on('error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    // NOTE: Removed broken ytdl methods that were causing security issues

    /**
     * SECURITY FIXED: Enhanced YouTube info retrieval using yt-dlp with spawn
     */
    async getYouTubeInfoWithRetry(url, maxRetries = 3) {
        const validatedUrl = this.validateYouTubeUrl(url);
        if (!validatedUrl) {
            throw new Error('Invalid YouTube URL');
        }
        
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const proxy = this.getNextProxy();
                
                // Add delay between retries
                if (attempt > 1) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
                }
                
                console.log(`🔄 yt-dlp info attempt ${attempt}/${maxRetries}${proxy ? ` via proxy` : ''}`);
                
                // Build secure argument array
                const args = [
                    '--no-playlist',
                    '--dump-json',
                    '--sleep-interval', '2',
                    '--max-sleep-interval', '5'
                ];
                
                // Add proxy if available and validated
                if (proxy) {
                    const validProxy = this.validateProxy(proxy.url);
                    if (validProxy) {
                        args.push('--proxy', validProxy);
                    }
                }
                
                // Add user agent rotation
                const userAgent = this.getRandomUserAgent();
                args.push('--user-agent', userAgent);
                
                // Add validated URL
                args.push(validatedUrl.url);
                
                const { stdout } = await this.executeYtDlpSafely(args, { timeout: 30000 });
                const info = JSON.parse(stdout.trim());
                
                console.log(`✅ Successfully retrieved YouTube info via yt-dlp on attempt ${attempt}`);
                return this.normalizeVideoInfo(info);
                
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ yt-dlp info attempt ${attempt} failed: ${error.message}`);
                
                // If it's a timeout or network error, try with different proxy
                if ((error.code === 'ENOTFOUND' || error.message.includes('timeout') || 
                     error.message.includes('network')) && attempt < maxRetries) {
                    console.log(`🔄 Network error, trying different proxy...`);
                    continue;
                }
            }
        }
        
        throw new Error(`Failed to get YouTube info after ${maxRetries} attempts: ${lastError?.message}`);
    }

    /**
     * Normalize yt-dlp JSON output to match ytdl-core format
     */
    normalizeVideoInfo(ytdlpInfo) {
        return {
            videoDetails: {
                videoId: ytdlpInfo.id,
                title: ytdlpInfo.title || 'Unknown Title',
                lengthSeconds: ytdlpInfo.duration || 0,
                viewCount: ytdlpInfo.view_count || 0,
                author: {
                    name: ytdlpInfo.uploader || 'Unknown'
                },
                uploadDate: ytdlpInfo.upload_date || '',
                description: ytdlpInfo.description || ''
            },
            formats: ytdlpInfo.formats || [],
            _ytdlp_raw: ytdlpInfo // Keep original for debugging
        };
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded with yt-dlp (2025 reliable method) and proxy support');
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
     * Download YouTube video using yt-dlp (2025 reliable method)
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
            let quality = '720p'; // Default quality
            if (url.includes('quality:')) {
                const [realUrl, customQuality] = url.split(' quality:');
                url = realUrl.trim();
                quality = customQuality.trim();
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
                await this.downloadVideoWithYtDlp(url, quality, messageInfo, processingMsg);
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
     * SECURITY FIXED: Download video using yt-dlp with spawn instead of execAsync
     */
    async downloadVideoWithYtDlp(url, quality, messageInfo, processingMsg) {
        const proxy = this.getNextProxy();
        const userAgent = this.getRandomUserAgent();
        
        // Create temp directory
        const tempDir = path.join(__dirname, '..', 'tmp');
        await fs.ensureDir(tempDir);
        
        // Map quality to yt-dlp format selector with size limits
        const qualityMap = {
            '1080p': 'best[height<=1080][filesize<14M]',
            '720p': 'best[height<=720][filesize<14M]', 
            '480p': 'best[height<=480][filesize<14M]',
            '360p': 'best[height<=360][filesize<14M]',
            '240p': 'best[height<=240][filesize<14M]',
            '144p': 'worst[filesize<14M]'
        };
        
        const formatSelector = qualityMap[quality] || 'best[height<=720][filesize<14M]';
        const uniqueFilename = this.generateUniqueFilename('yt', 'mp4');
        const outputTemplate = path.join(tempDir, uniqueFilename);
        
        // Build secure argument array
        const args = [
            '--no-playlist',
            '--sleep-interval', '3',
            '--max-sleep-interval', '6', 
            '-f', `${formatSelector}/best[filesize<14M]/best`,
            '-o', outputTemplate,
            '--merge-output-format', 'mp4'
        ];
        
        // Add proxy if available and validated
        if (proxy) {
            const validProxy = this.validateProxy(proxy.url);
            if (validProxy) {
                args.push('--proxy', validProxy);
            }
        }
        
        // Add user agent rotation
        args.push('--user-agent', userAgent);
        
        // Add validated URL
        args.push(url);
        
        try {
            console.log(`🔄 Downloading video via yt-dlp${proxy ? ` via proxy` : ''}`);
            
            // Execute yt-dlp download safely
            const { stdout, stderr } = await this.executeYtDlpSafely(args, { 
                timeout: 120000, // 2 minutes timeout
                cwd: tempDir
            });
            
            // Check if file exists
            if (!await fs.pathExists(outputTemplate)) {
                throw new Error('Downloaded video file not found');
            }
            
            const stats = await fs.stat(outputTemplate);
            
            // Check file size (14MB limit)
            if (stats.size > 14 * 1024 * 1024) {
                await fs.remove(outputTemplate);
                throw new Error('Video too large (14MB max). Try a lower quality.');
            }
            
            // Update processing message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '📤 Sending video...',
                edit: processingMsg.key
            });
            
            // Send video file
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                video: { url: outputTemplate },
                caption: `✅ YouTube Video Downloaded\n📱 Quality: ${quality}\n📄 Size: ${(stats.size / 1024 / 1024).toFixed(1)}MB`,
                fileName: uniqueFilename
            });
            
            // Clean up
            await fs.remove(outputTemplate);
            
            // Update final message
            await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                text: '✅ Video sent successfully!',
                edit: processingMsg.key
            });
            
        } catch (error) {
            console.error('yt-dlp download error:', error);
            throw new Error(`Download failed: ${error.message.includes('youtube') ? 'Video unavailable or blocked' : error.message}`);
        }
    }

    /**
     * SECURITY FIXED: Download YouTube audio using yt-dlp with spawn
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
                // Search for the video
                try {
                    const searchResults = await ytsr(input, { limit: 5 });
                    // Filter to videos only
                    const videoResults = searchResults.items.filter(item => item.type === 'video');
                    if (!videoResults.length) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ No videos found for your search',
                            edit: processingMsg.key
                        });
                        return;
                    }

                    const firstResult = videoResults[0];
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
                // Download audio using yt-dlp directly
                const proxy = this.getNextProxy();
                const userAgent = this.getRandomUserAgent();
                
                // Create temp directory
                const tempDir = path.join(__dirname, '..', 'tmp');
                await fs.ensureDir(tempDir);
                
                // Generate unique filename
                const uniqueFilename = this.generateUniqueFilename('yt_audio', 'm4a');
                const outputTemplate = path.join(tempDir, uniqueFilename);
                
                // Build secure argument array for audio download
                const args = [
                    '--no-playlist',
                    '--extract-audio',
                    '--audio-format', 'm4a',
                    '--audio-quality', '128K',
                    '--sleep-interval', '2',
                    '--max-sleep-interval', '4',
                    '-o', outputTemplate,
                    '--max-filesize', '12M'
                ];
                
                // Add proxy if available and validated
                if (proxy) {
                    const validProxy = this.validateProxy(proxy.url);
                    if (validProxy) {
                        args.push('--proxy', validProxy);
                    }
                }
                
                // Add user agent rotation
                args.push('--user-agent', userAgent);
                
                // Add validated URL
                args.push(url);
                
                console.log(`🔄 Downloading audio via yt-dlp${proxy ? ` via proxy` : ''}`);
                
                // Execute yt-dlp audio download safely
                const { stdout, stderr } = await this.executeYtDlpSafely(args, { 
                    timeout: 90000, // 1.5 minutes timeout
                    cwd: tempDir
                });
                
                // Check if file exists
                if (!await fs.pathExists(outputTemplate)) {
                    throw new Error('Downloaded audio file not found');
                }
                
                const stats = await fs.stat(outputTemplate);
                
                // Check file size (12MB limit)
                if (stats.size > 12 * 1024 * 1024) {
                    await fs.remove(outputTemplate);
                    throw new Error('Audio too large (12MB max). Try a shorter video.');
                }
                
                // Update processing message
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '📤 Sending audio...',
                    edit: processingMsg.key
                });
                
                // Send audio file
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    audio: { url: outputTemplate },
                    mimetype: 'audio/mp4',
                    fileName: uniqueFilename
                });
                
                // Clean up
                await fs.remove(outputTemplate);
                
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
     * Search YouTube videos
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
                const searchResults = await ytsr(query, { limit: 15 });
                
                // Filter to videos only, exclude channels, playlists, etc.
                const videoResults = searchResults.items.filter(item => item.type === 'video' && item.url);
                
                if (!videoResults.length) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No videos found for your search',
                        edit: processingMsg.key
                    });
                    return;
                }

                let resultText = `🔍 *Search Results for "${query}":*\n\n`;
                
                videoResults.slice(0, 5).forEach((item, index) => {
                    const duration = item.duration || 'Live';
                    const views = item.views ? `${item.views} views` : 'No view count';
                    
                    resultText += `*${index + 1}.* ${item.title}\n`;
                    resultText += `👤 ${item.author?.name || 'Unknown'}\n`;
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