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
        console.log('✅ YouTube plugin loaded with y2mate-dl API');
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

            // Handle quality selection (720p, 480p, 360p)
            if (url.includes('quality:')) {
                const [realUrl, quality] = url.split(' quality:');
                url = realUrl.trim();
                
                // Validate YouTube URL
                if (!this.ytIdRegex.test(url)) {
                    return await this.bot.messageHandler.reply(messageInfo, 
                        '❌ Please provide a valid YouTube URL');
                }

                const processingMsg = await this.bot.messageHandler.reply(messageInfo, `🔄 Downloading ${quality} video...`);

                try {
                    let videoData;
                    switch (quality) {
                        case '720p':
                            videoData = await y2mate.yt720(url);
                            break;
                        case '480p':
                            videoData = await y2mate.yt480(url);
                            break;
                        case '360p':
                            videoData = await y2mate.yt360(url);
                            break;
                        default:
                            videoData = await y2mate.yt480(url); // Default to 480p
                    }

                    if (videoData && videoData.url) {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            video: { url: videoData.url },
                            caption: `✅ ${videoData.title || 'Video'} (${quality})`
                        });
                        
                        // Delete processing message
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            delete: processingMsg.key
                        });
                    } else {
                        await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                            text: '❌ Failed to download video',
                            edit: processingMsg.key
                        });
                    }

                } catch (error) {
                    console.error('Y2mate download error:', error);
                    await this.bot.sock.sendMessage(messageInfo.chat_jid, {
                        text: `❌ Failed to download ${quality} video`,
                        edit: processingMsg.key
                    });
                }
                return;
            }

            // Validate YouTube URL
            if (!this.ytIdRegex.test(url)) {
                return await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please provide a valid YouTube URL');
            }

            // Send quality options
            const qualityText = `🎬 *YouTube Video Download*\n\n📱 *Select Quality:*\n\n1️⃣ 720p HD\n2️⃣ 480p (Recommended)\n3️⃣ 360p (Small size)\n\n💡 Reply with:\n\`${config.PREFIX}ytv ${url} quality:720p\`\n\`${config.PREFIX}ytv ${url} quality:480p\`\n\`${config.PREFIX}ytv ${url} quality:360p\``;

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