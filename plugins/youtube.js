/**
 * MATDEV YouTube Downloader Plugin
 * Download YouTube videos and audio using simple y2mate-dl API
 */

const y2mate = require('y2mate-dl');
const config = require('../config');
const fs = require('fs-extra');
const path = require('path');
const ytsr = require('ytsr');

class YouTubePlugin {
    constructor() {
        this.name = 'youtube';
        this.description = 'YouTube video and audio downloader using y2mate API';
        this.version = '3.0.0';
        
        // YouTube URL regex
        this.ytIdRegex = /(?:http(?:s|):\/\/|)(?:(?:www\.|)youtube(?:\-nocookie|)\.com\/(?:watch\?.*(?:|\&)v=|embed|shorts\/|v\/)|youtu\.be\/)([-_0-9A-Za-z]{11})/;
    }

    /**
     * Initialize plugin
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        this.setupQualityListener();
        console.log('✅ YouTube plugin loaded with y2mate-dl API');
        return this;
    }

    /**
     * Set up quality selection listener
     */
    setupQualityListener() {
        // Remove existing listener if it exists (for hot reload)
        if (this.qualityListener) {
            this.bot.sock.ev.off('messages.upsert', this.qualityListener);
        }

        // Create bound function for proper removal
        this.qualityListener = async (messageUpdate) => {
            if (messageUpdate.type !== 'notify') return;

            for (const message of messageUpdate.messages) {
                if (!message.message || message.key.fromMe) continue;

                const text = message.message?.conversation || 
                           message.message?.extendedTextMessage?.text || '';
                
                const chatId = message.key.remoteJid;
                const userId = message.key.participant || message.key.remoteJid;

                // Check if this is a quality selection (100, 101, 102)
                if (['100', '101', '102'].includes(text.trim())) {
                    const cacheKey = `ytv_quality_${chatId}_${userId}`;
                    const pendingDownload = this.bot.messageHandler.cache.get(cacheKey);

                    if (pendingDownload) {
                        // Clear the cache
                        this.bot.messageHandler.cache.delete(cacheKey);

                        // Process the quality selection
                        await this.processQualitySelection(text.trim(), pendingDownload, chatId);
                    }
                }
            }
        };

        // Listen to all messages for quality selection numbers
        this.bot.sock.ev.on('messages.upsert', this.qualityListener);
    }

    /**
     * Process quality selection and download video
     */
    async processQualitySelection(qualityNumber, pendingDownload, chatId) {
        try {
            let quality, y2mateMethod;
            
            switch (qualityNumber) {
                case '100':
                    quality = '720p';
                    y2mateMethod = y2mate.yt720;
                    break;
                case '101':
                    quality = '480p';
                    y2mateMethod = y2mate.yt480;
                    break;
                case '102':
                    quality = '360p';
                    y2mateMethod = y2mate.yt360;
                    break;
                default:
                    return;
            }

            // Send processing message
            const processingMsg = await this.bot.sock.sendMessage(chatId, {
                text: `🔄 Downloading ${quality} video...`
            });

            try {
                // Download video using y2mate
                const videoData = await y2mateMethod(pendingDownload.url);

                if (videoData && videoData.url) {
                    // Send video file
                    await this.bot.sock.sendMessage(chatId, {
                        video: { url: videoData.url },
                        caption: `✅ ${videoData.title || 'Video'} (${quality})`
                    });

                    // Delete processing message
                    await this.bot.sock.sendMessage(chatId, {
                        delete: processingMsg.key
                    });

                    console.log(`✅ Video downloaded: ${quality}`, videoData.title);
                } else {
                    await this.bot.sock.sendMessage(chatId, {
                        text: `❌ Failed to download ${quality} video`,
                        edit: processingMsg.key
                    });
                }

            } catch (error) {
                console.error('Y2mate download error:', error);
                await this.bot.sock.sendMessage(chatId, {
                    text: `❌ Failed to download ${quality} video. Please try again.`,
                    edit: processingMsg.key
                });
            }

        } catch (error) {
            console.error('Quality selection processing error:', error);
            await this.bot.sock.sendMessage(chatId, {
                text: '❌ An error occurred while processing your selection'
            });
        }
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

            // Validate YouTube URL
            if (!this.ytIdRegex.test(url)) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }

            // Store pending download info in cache
            const cacheKey = `ytv_quality_${messageInfo.chat_jid}_${messageInfo.from_jid}`;
            this.bot.messageHandler.cache.set(cacheKey, {
                url: url,
                chatId: messageInfo.chat_jid,
                userId: messageInfo.from_jid
            }, 300); // 5 minutes expiry

            // Send quality selection message
            const qualityText = `📱 *Select Quality:*\n\n*100* 720p HD\n*101* 480p (Recommended) \n*102* 360p (Small size)\n\n💡 Just type the number (100, 101, or 102)`;

            await this.bot.messageHandler.reply(messageInfo, qualityText);

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
                    const searchResults = await ytsr(input, { limit: 1 });
                    if (!searchResults.items.length) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ No videos found for your search',
                            edit: processingMsg.key
                        });
                        return;
                    }

                    const firstResult = searchResults.items[0];
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
                // Download audio using y2mate
                const audioData = await y2mate.ytmp3(url);
                
                if (audioData && audioData.url) {
                    // Send audio file
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        audio: { url: audioData.url },
                        mimetype: 'audio/mpeg',
                        fileName: `${audioData.title || 'audio'}.mp3`
                    });

                    // Delete processing message
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        delete: processingMsg.key
                    });

                    console.log('✅ Audio downloaded:', audioData.title);
                } else {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ Failed to download audio',
                        edit: processingMsg.key
                    });
                }

            } catch (error) {
                console.error('Y2mate audio error:', error);
                await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                    text: '❌ Failed to download audio. Please try again later.',
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
                const searchResults = await ytsr(query, { limit: 10 });
                
                if (!searchResults.items.length) {
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: '❌ No videos found for your search',
                        edit: processingMsg.key
                    });
                    return;
                }

                let resultText = `🔍 *Search Results for "${query}":*\n\n`;
                
                searchResults.items.slice(0, 5).forEach((item, index) => {
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