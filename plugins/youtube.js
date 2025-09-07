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

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and shorts downloader';
        this.version = '1.0.0';
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
    async downloadYouTube(sock, chatJid, senderJid, message, args) {
        try {
            if (!args || args.length === 0) {
                await sock.sendMessage(chatJid, {
                    text: `❌ Please provide a YouTube URL\n\nUsage: ${config.PREFIX}ytv <url>\n\nExample: ${config.PREFIX}ytv https://www.youtube.com/watch?v=dQw4w9WgXcQ`
                });
                return;
            }

            const url = args[0];
            
            // Validate YouTube URL
            if (!this.isValidYouTubeUrl(url)) {
                await sock.sendMessage(chatJid, {
                    text: '❌ Invalid YouTube URL. Please provide a valid YouTube video link.'
                });
                return;
            }

            // Send processing message
            const processingMsg = await sock.sendMessage(chatJid, {
                text: '🔄 Processing YouTube video...\n⏳ Please wait, this may take a moment.'
            });

            try {
                // Get video info
                const info = await ytdl.getInfo(url);
                const videoDetails = info.videoDetails;

                // Check video length (limit to 10 minutes for file size)
                const duration = parseInt(videoDetails.lengthSeconds);
                if (duration > 600) { // 10 minutes
                    await sock.sendMessage(chatJid, {
                        text: `❌ Video is too long (${this.formatDuration(duration)}). Please use videos shorter than 10 minutes.`
                    }, { quoted: processingMsg });
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
                const tempFile = path.join(__dirname, '..', 'tmp', `video_${Date.now()}.mp4`);
                
                // Download video
                await new Promise((resolve, reject) => {
                    const stream = ytdl(url, { format: format });
                    const writeStream = fs.createWriteStream(tempFile);
                    
                    stream.pipe(writeStream);
                    
                    stream.on('error', reject);
                    writeStream.on('error', reject);
                    writeStream.on('finish', resolve);
                });

                // Read video file
                const videoBuffer = await fs.readFile(tempFile);
                
                // Create caption with video info
                const caption = `🎬 *YouTube Video Downloaded*\n\n` +
                               `📝 *Title:* ${videoDetails.title}\n` +
                               `👤 *Channel:* ${videoDetails.author.name}\n` +
                               `⏱️ *Duration:* ${this.formatDuration(duration)}\n` +
                               `👀 *Views:* ${this.formatNumber(videoDetails.viewCount)}\n` +
                               `📅 *Published:* ${videoDetails.publishDate}\n\n` +
                               `📱 *Downloaded by:* ${config.BOT_NAME}`;

                // Send video
                await sock.sendMessage(chatJid, {
                    video: videoBuffer,
                    caption: caption,
                    mimetype: 'video/mp4'
                });

                // Clean up temp file
                await fs.unlink(tempFile).catch(() => {});

                // Delete processing message
                try {
                    await sock.sendMessage(chatJid, { delete: processingMsg.key });
                } catch (e) {
                    // Ignore delete errors
                }

            } catch (downloadError) {
                console.error('YouTube download error:', downloadError);
                
                await sock.sendMessage(chatJid, {
                    text: '❌ Failed to download YouTube video.\n\nPossible reasons:\n• Video is private, age-restricted, or deleted\n• Video is too large or long\n• Network connection issue\n• YouTube server restrictions\n\nPlease try again with a different video.'
                }, { quoted: processingMsg });
            }

        } catch (error) {
            console.error('Error in YouTube command:', error);
            await sock.sendMessage(chatJid, {
                text: '❌ An error occurred while processing the YouTube video. Please try again.'
            });
        }
    }

    /**
     * Search YouTube videos command
     */
    async searchYouTube(sock, chatJid, senderJid, message, args) {
        try {
            if (!args || args.length === 0) {
                await sock.sendMessage(chatJid, {
                    text: `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`
                });
                return;
            }

            const searchQuery = args.join(' ');
            
            // Send processing message
            await sock.sendMessage(chatJid, {
                text: '🔍 Searching YouTube...'
            });

            try {
                const searchResults = await ytsr(searchQuery, { limit: 5 });
                const videos = searchResults.items.filter(item => item.type === 'video').slice(0, 5);

                if (videos.length === 0) {
                    await sock.sendMessage(chatJid, {
                        text: '❌ No videos found for your search query.'
                    });
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

                await sock.sendMessage(chatJid, {
                    text: resultText
                });

            } catch (searchError) {
                console.error('YouTube search error:', searchError);
                await sock.sendMessage(chatJid, {
                    text: '❌ Failed to search YouTube. Please try again.'
                });
            }

        } catch (error) {
            console.error('Error in YouTube search command:', error);
            await sock.sendMessage(chatJid, {
                text: '❌ An error occurred while searching YouTube. Please try again.'
            });
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