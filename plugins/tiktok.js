/**
 * MATDEV TikTok Downloader Plugin
 * Download TikTok videos without watermark
 */

const TiktokDL = require('@tobyg74/tiktok-api-dl');
const config = require('../config');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class TikTokPlugin {
    constructor() {
        this.name = 'tiktok';
        this.description = 'TikTok video downloader';
        this.version = '1.0.0';
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        console.log('✅ TikTok plugin loaded');
    }

    /**
     * Register TikTok commands
     */
    registerCommands() {
        this.bot.messageHandler.registerCommand('tiktok', this.downloadTikTok.bind(this), {
            description: 'Download TikTok video without watermark',
            usage: `${config.PREFIX}tiktok <url>`,
            category: 'media',
            plugin: 'tiktok',
            source: 'tiktok.js'
        });
    }

    /**
     * Download TikTok video command
     */
    async downloadTikTok(messageInfo) {
        try {
            const { args } = messageInfo;
            
            if (!args || args.length === 0) {
                await this.bot.messageHandler.reply(messageInfo, `❌ Please provide a TikTok URL\n\nUsage: ${config.PREFIX}tiktok <url>\n\nExample: ${config.PREFIX}tiktok https://vm.tiktok.com/ZMxxxxxl/`);
                return;
            }

            const url = args[0];
            
            // Validate TikTok URL
            if (!this.isValidTikTokUrl(url)) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Invalid TikTok URL. Please provide a valid TikTok video link.');
                return;
            }

            // Send processing message
            const processingMsg = await this.bot.messageHandler.reply(messageInfo, '🔄 Processing TikTok video...\n⏳ Please wait, this may take a moment.');

            try {
                // Download video info and link
                const result = await TiktokDL.Downloader(url, {
                    version: "v3"
                });

                if (!result || !result.result) {
                    throw new Error('Failed to get video data');
                }

                const videoData = result.result;
                
                // Get video download URL (try different quality options)
                let videoUrl = null;
                
                if (videoData.video) {
                    videoUrl = videoData.video.noWatermark || videoData.video.watermark || videoData.video[0];
                } else if (videoData.type === 'video' && videoData.video_data) {
                    videoUrl = videoData.video_data.nwm_video_url_HQ || videoData.video_data.nwm_video_url || videoData.video_data.wm_video_url;
                }

                if (!videoUrl) {
                    throw new Error('No video download URL found');
                }

                // Download the video
                const videoResponse = await axios.get(videoUrl, {
                    responseType: 'arraybuffer',
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                if (!videoResponse.data) {
                    throw new Error('Failed to download video data');
                }

                // Create caption with video info
                const title = videoData.title || videoData.desc || 'TikTok Video';
                const author = videoData.author?.nickname || videoData.author?.username || 'Unknown';
                const stats = videoData.stats || {};
                
                const caption = `🎵 *TikTok Video Downloaded*\n\n` +
                               `👤 *Author:* ${author}\n` +
                               `📝 *Title:* ${title.length > 100 ? title.substring(0, 100) + '...' : title}\n` +
                               `❤️ *Likes:* ${this.formatNumber(stats.likeCount || 0)}\n` +
                               `💬 *Comments:* ${this.formatNumber(stats.commentCount || 0)}\n` +
                               `🔄 *Shares:* ${this.formatNumber(stats.shareCount || 0)}\n\n` +
                               `📱 *Downloaded by:* ${config.BOT_NAME}`;

                // Send video
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    video: Buffer.from(videoResponse.data),
                    caption: caption,
                    mimetype: 'video/mp4'
                });

                // Delete processing message
                try {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, { delete: processingMsg.key });
                } catch (e) {
                    // Ignore delete errors
                }

            } catch (downloadError) {
                console.error('TikTok download error:', downloadError);
                
                // Update processing message with error
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Failed to download TikTok video.\n\nPossible reasons:\n• Video is private or deleted\n• Network connection issue\n• TikTok server blocked the request\n\nPlease try again with a different video.',
                    quoted: processingMsg
                });
            }

        } catch (error) {
            console.error('Error in TikTok command:', error);
            await this.bot.messageHandler.reply(messageInfo, '❌ An error occurred while processing the TikTok video. Please try again.');
        }
    }

    /**
     * Validate TikTok URL
     */
    isValidTikTokUrl(url) {
        const tiktokPatterns = [
            /tiktok\.com\/@[\w.-]+\/video\/\d+/,
            /vm\.tiktok\.com\/[\w-]+/,
            /vt\.tiktok\.com\/[\w-]+/,
            /tiktok\.com\/t\/[\w-]+/,
            /tiktok\.com\/v\/\d+/
        ];
        
        return tiktokPatterns.some(pattern => pattern.test(url));
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

module.exports = new TikTokPlugin();