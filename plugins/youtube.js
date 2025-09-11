/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using @distube/ytdl-core
 */

const ytdl = require('@distube/ytdl-core');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const ytsr = require('ytsr');
const axios = require('axios');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using @distube/ytdl-core';
        this.version = '4.0.0';
        
        // YouTube URL regex
        this.ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:watch\?.*(?:|\&)v=|embed|shorts\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ YouTube plugin loaded with @distube/ytdl-core API');
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
     * Download YouTube video
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

            // Handle quality selection
            let quality = '720p'; // Default quality
            if (url.includes('quality:')) {
                const [realUrl, customQuality] = url.split(' quality:');
                url = realUrl.trim();
                quality = customQuality.trim();
            }
            
            // Validate YouTube URL
            if (!this.ytIdRegex.test(url)) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }

            try {
                const info = await ytdl.getInfo(url);
                
                // Filter video formats with strict HLS/DASH filtering and hard size constraints
                let videoFormats = ytdl.filterFormats(info.formats, 'videoandaudio')
                    .filter(format => {
                        // Always exclude HLS/DASH and live streams
                        if (format.isHLS || format.isDashMPD || format.isLive || !format.url || !format.container) {
                            return false;
                        }
                        
                        // Hard size constraint: strict 14MB limit
                        const VIDEO_SIZE_LIMIT = 14 * 1024 * 1024; // 14MB
                        if (format.contentLength) {
                            return parseInt(format.contentLength) <= VIDEO_SIZE_LIMIT;
                        }
                        
                        // Estimate size for missing contentLength using bitrate * duration
                        if (format.bitrate && info.videoDetails.lengthSeconds) {
                            const estimatedSize = (format.bitrate * parseInt(info.videoDetails.lengthSeconds)) / 8;
                            return estimatedSize <= VIDEO_SIZE_LIMIT;
                        }
                        
                        // Reject formats with no size info as they're risky
                        return false;
                    })
                    .sort((a, b) => {
                        // Sort by quality (height) descending, then by bitrate descending
                        const heightDiff = (b.height || 0) - (a.height || 0);
                        if (heightDiff !== 0) return heightDiff;
                        return (b.bitrate || 0) - (a.bitrate || 0);
                    });
                
                if (!videoFormats.length) {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No suitable video format found within size limits (14MB max). Video may be too large.');
                    return;
                }
                
                // Select best format for requested quality with proper degradation
                let selectedFormat;
                const targetHeight = {
                    '1080p': 1080,
                    '720p': 720,
                    '480p': 480, 
                    '360p': 360,
                    '240p': 240,
                    '144p': 144
                }[quality] || 720; // Default to 720p
                
                // Find formats that match or are lower than target quality
                const suitableFormats = videoFormats.filter(f => (f.height || 0) <= targetHeight);
                
                if (suitableFormats.length > 0) {
                    // Choose highest quality within target
                    selectedFormat = suitableFormats[0]; // Already sorted by quality descending
                } else {
                    // Graceful degradation: use lowest available quality
                    selectedFormat = videoFormats[videoFormats.length - 1];
                }

                if (selectedFormat && selectedFormat.url) {
                    // Create temporary file path
                    const tempFile = path.join(__dirname, '..', 'tmp', `youtube_video_${Date.now()}.mp4`);
                    
                    // Ensure tmp directory exists
                    await fs.ensureDir(path.dirname(tempFile));

                    try {
                        // Download video to temp file
                        const axios = require('axios');
                        const videoResponse = await axios.get(selectedFormat.url, {
                            responseType: 'stream',
                            timeout: 90000
                        });

                        // Write video to temp file
                        await new Promise((resolve, reject) => {
                            const writeStream = fs.createWriteStream(tempFile);
                            videoResponse.data.pipe(writeStream);
                            
                            videoResponse.data.on('error', reject);
                            writeStream.on('error', reject);
                            writeStream.on('finish', resolve);
                        });

                        // Read video file as buffer
                        const videoBuffer = await fs.readFile(tempFile);

                        // Send video
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            video: videoBuffer,
                            caption: `✅ ${info.videoDetails.title} (${selectedFormat.qualityLabel || quality})`,
                            mimetype: 'video/mp4'
                        });

                        // Clean up temp file immediately
                        await fs.unlink(tempFile).catch(() => {});

                    } catch (downloadError) {
                        // Clean up temp file on error
                        await fs.unlink(tempFile).catch(() => {});
                        
                        await this.bot.messageHandler.reply(messageInfo, 
                            `❌ Failed to download video: ${downloadError.message}`);
                    }
                } else {
                    await this.bot.messageHandler.reply(messageInfo, 
                        '❌ No suitable video format found');
                }

            } catch (error) {
                console.error('YouTube download error:', error);
                await this.bot.messageHandler.reply(messageInfo, 
                    `❌ Failed to download ${quality} video: ${error.message}`);
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
            const urlMatch = this.ytIdRegex.exec(input);
            if (!urlMatch) {
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
            }

            try {
                // Get video info and audio formats
                const info = await ytdl.getInfo(url);
                
                // Filter audio formats with strict HLS/DASH filtering and hard size constraints
                let audioFormats = ytdl.filterFormats(info.formats, 'audioonly')
                    .filter(format => {
                        // Always exclude HLS/DASH and live streams
                        if (format.isHLS || format.isDashMPD || format.isLive || !format.url || !format.container) {
                            return false;
                        }
                        
                        // Hard size constraint: strict 12MB limit
                        const AUDIO_SIZE_LIMIT = 12 * 1024 * 1024; // 12MB
                        if (format.contentLength) {
                            return parseInt(format.contentLength) <= AUDIO_SIZE_LIMIT;
                        }
                        
                        // Estimate size for missing contentLength using bitrate * duration
                        if (format.audioBitrate && info.videoDetails.lengthSeconds) {
                            const estimatedSize = (format.audioBitrate * 1000 * parseInt(info.videoDetails.lengthSeconds)) / 8;
                            return estimatedSize <= AUDIO_SIZE_LIMIT;
                        }
                        
                        // Reject formats with no size info as they're risky
                        return false;
                    })
                    .sort((a, b) => {
                        // Prefer m4a over webm for better compatibility
                        const aContainer = (a.container || '').toLowerCase();
                        const bContainer = (b.container || '').toLowerCase();
                        
                        const aIsM4a = aContainer.includes('m4a') || aContainer.includes('mp4');
                        const bIsM4a = bContainer.includes('m4a') || bContainer.includes('mp4');
                        
                        if (aIsM4a && !bIsM4a) return -1;
                        if (!aIsM4a && bIsM4a) return 1;
                        
                        // Then sort by audio quality (bitrate) descending
                        return (b.audioBitrate || 0) - (a.audioBitrate || 0);
                    });
                
                if (!audioFormats.length) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No suitable audio format found within size limits (12MB max). Audio may be too large.',
                        edit: processingMsg.key
                    });
                    return;
                }
                
                const selectedFormat = audioFormats[0];

                if (selectedFormat && selectedFormat.url) {
                    // Determine correct mimetype and extension based on container
                    let mimetype = 'audio/mpeg';
                    let extension = 'mp3';
                    
                    const container = selectedFormat.container?.toLowerCase() || '';
                    if (container.includes('webm')) {
                        mimetype = 'audio/webm';
                        extension = 'webm';
                    } else if (container.includes('m4a') || container.includes('mp4')) {
                        mimetype = 'audio/mp4';
                        extension = 'm4a';
                    } else if (container.includes('ogg')) {
                        mimetype = 'audio/ogg';
                        extension = 'ogg';
                    }
                    
                    // Clean filename for WhatsApp compatibility
                    const cleanTitle = info.videoDetails.title
                        .replace(/[^a-zA-Z0-9\s-_]/g, '')
                        .substring(0, 50)
                        .trim();

                    // Send audio file
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        audio: { url: selectedFormat.url },
                        mimetype: mimetype,
                        fileName: `${cleanTitle}.${extension}`
                    });

                    // Delete processing message
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: processingMsg.key
                    });

                    console.log('✅ Audio downloaded:', info.videoDetails.title, `(${container}, ${selectedFormat.audioBitrate}kbps)`);
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No suitable audio format available',
                        edit: processingMsg.key
                    });
                }

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