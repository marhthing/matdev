/**
 * MATDEV Video Editor Plugin
 * Trim, compress, merge and edit videos
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class VideoEditorPlugin {
    constructor() {
        this.name = 'video-editor';
        this.description = 'Edit videos with trim, compress, and merge features';
        this.version = '1.0.0';
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        console.log('✅ Video Editor plugin loaded');
    }

    registerCommands() {
        this.bot.messageHandler.registerCommand('trim', this.trimCommand.bind(this), {
            description: 'Trim video to specified duration',
            usage: `${config.PREFIX}trim <start> <duration> (reply to video)\nExample: ${config.PREFIX}trim 5 10 (start at 5s, duration 10s)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('compress', this.compressCommand.bind(this), {
            description: 'Compress video to reduce file size',
            usage: `${config.PREFIX}compress [quality] (reply to video)\nQuality: low, medium, high (default: medium)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('speed', this.speedCommand.bind(this), {
            description: 'Change video playback speed',
            usage: `${config.PREFIX}speed <factor> (reply to video)\nExample: ${config.PREFIX}speed 2 (2x faster), ${config.PREFIX}speed 0.5 (2x slower)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });

        this.bot.messageHandler.registerCommand('reverse', this.reverseCommand.bind(this), {
            description: 'Reverse video playback',
            usage: `${config.PREFIX}reverse (reply to video)`,
            category: 'video editing',
            plugin: 'video-editor',
            source: 'video-editor.js'
        });
    }

    async trimCommand(messageInfo) {
        const args = messageInfo.body.split(' ').slice(1);

        if (args.length < 2) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please specify start time and duration.\n\n📝 Usage: ${config.PREFIX}trim <start> <duration>\nExample: ${config.PREFIX}trim 5 10`);
            return;
        }

        const startTime = parseFloat(args[0]);
        const duration = parseFloat(args[1]);

        if (isNaN(startTime) || isNaN(duration) || startTime < 0 || duration <= 0) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Invalid time values. Please use positive numbers.');
            return;
        }

        await this.processVideo(messageInfo, 'trim', { startTime, duration });
    }

    async compressCommand(messageInfo) {
        const args = messageInfo.body.split(' ').slice(1);
        const quality = args[0]?.toLowerCase() || 'medium';

        const validQualities = ['low', 'medium', 'high'];
        if (!validQualities.includes(quality)) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Invalid quality. Use: ${validQualities.join(', ')}`);
            return;
        }

        await this.processVideo(messageInfo, 'compress', { quality });
    }

    async speedCommand(messageInfo) {
        const args = messageInfo.body.split(' ').slice(1);

        if (args.length < 1) {
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please specify speed factor.\n\n📝 Usage: ${config.PREFIX}speed <factor>\nExample: ${config.PREFIX}speed 2 (2x faster)`);
            return;
        }

        const speed = parseFloat(args[0]);

        if (isNaN(speed) || speed <= 0 || speed > 4) {
            await this.bot.messageHandler.reply(messageInfo, '❌ Speed factor must be between 0.1 and 4.0');
            return;
        }

        await this.processVideo(messageInfo, 'speed', { speed });
    }

    async reverseCommand(messageInfo) {
        await this.processVideo(messageInfo, 'reverse', {});
    }

    async processVideo(messageInfo, operation, params) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;

            if (!quotedMessage || !quotedMessage.videoMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to a video.');
                return;
            }

            // Download video
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, 'videoMessage');

            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process video. Please try again.');
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `input_${timestamp}.mp4`);
            outputPath = path.join(process.cwd(), 'tmp', `edited_${operation}_${timestamp}.mp4`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Build FFmpeg command based on operation
            let command = '';

            switch (operation) {
                case 'trim':
                    command = `ffmpeg -i "${inputPath}" -ss ${params.startTime} -t ${params.duration} -c copy "${outputPath}"`;
                    break;

                case 'compress':
                    const crf = params.quality === 'low' ? '35' : params.quality === 'high' ? '20' : '28';
                    command = `ffmpeg -i "${inputPath}" -c:v libx264 -crf ${crf} -preset fast -c:a aac -b:a 128k "${outputPath}"`;
                    break;

                case 'speed':
                    const audioSpeed = 1 / params.speed;
                    command = `ffmpeg -i "${inputPath}" -filter:v "setpts=${audioSpeed}*PTS" -filter:a "atempo=${params.speed}" "${outputPath}"`;
                    break;

                case 'reverse':
                    command = `ffmpeg -i "${inputPath}" -vf reverse -af areverse "${outputPath}"`;
                    break;
            }

            // Execute FFmpeg command
            await new Promise((resolve, reject) => {
                exec(command, { maxBuffer: 1024 * 1024 * 50 }, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg error:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Check if output file exists and has content
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output video is empty');
            }

            // Send processed video
            await this.bot.sock.sendMessage(messageInfo.sender, {
                video: { url: outputPath },
                mimetype: 'video/mp4',
                caption: `🎬 Video ${operation} completed by MATDEV`,
            });

        } catch (error) {
            console.error(`Video ${operation} error:`, error);
            await this.bot.messageHandler.reply(messageInfo, `❌ Error during video ${operation}.`);
        } finally {
            // Cleanup
            try {
                if (inputPath) await fs.unlink(inputPath);
                if (outputPath) await fs.unlink(outputPath);
            } catch (cleanupError) {
                console.log('Cleanup error (non-critical):', cleanupError.message);
            }
        }
    }

    async downloadMediaRobust(messageInfo, quoted, mediaType) {
        try {
            const ctx = messageInfo.message?.extendedTextMessage?.contextInfo;

            if (!ctx || !ctx.stanzaId) {
                throw new Error('No quoted message context found');
            }

            const quotedKey = {
                id: ctx.stanzaId,
                remoteJid: messageInfo.key?.remoteJid || messageInfo.sender,
                fromMe: ctx.participant ? (ctx.participant === this.bot.sock.user?.id) : false,
                participant: ctx.participant || undefined
            };

            const messageToDownload = {
                key: quotedKey,
                message: quoted
            };

            const stream = await downloadMediaMessage(messageToDownload, 'stream', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            const buffer = Buffer.concat(chunks);

            return { buffer };

        } catch (error) {
            console.error('Download failed:', error);
            return null;
        }
    }
}

const videoEditorPlugin = new VideoEditorPlugin();

module.exports = {
    init: videoEditorPlugin.init.bind(videoEditorPlugin),
    name: videoEditorPlugin.name,
    description: videoEditorPlugin.description,
    version: videoEditorPlugin.version
};