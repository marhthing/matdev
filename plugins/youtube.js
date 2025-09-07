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
    async downloadYouTube(messageInfo) {
        let tempFile;
        try {
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
                // Get video info
                const info = await ytdl.getInfo(url);
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
        }
    }

    /**
     * Search YouTube videos command
     */
    async searchYouTube(messageInfo) {
        try {
            const { args } = messageInfo;

            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide search terms\n\nUsage: ${config.PREFIX}yts <search term>\n\nExample: ${config.PREFIX}yts funny cats`);
                return;
            }

            const searchQuery = args.join(' ');

            // No processing message needed

            try {
                const searchResults = await ytsr(searchQuery, { limit: 5 });
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