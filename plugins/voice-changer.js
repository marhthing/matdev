
/**
 * MATDEV Voice Changer Plugin
 * Apply various voice effects to audio messages
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class VoiceChangerPlugin {
    constructor() {
        this.name = 'voice-changer';
        this.description = 'Apply voice effects to audio messages';
        this.version = '1.0.0';
        
        this.effects = {
            robot: 'aformat=sample_rates=8000:sample_fmts=s16,volume=1.5',
            chipmunk: 'asetrate=r=44100*1.5,aresample=44100',
            deep: 'asetrate=r=44100*0.7,aresample=44100',
            echo: 'aecho=0.8:0.9:1000:0.3',
            reverb: 'aecho=0.8:0.88:60:0.4',
            whisper: 'volume=0.3,highpass=f=300',
            demon: 'asetrate=r=44100*0.6,aresample=44100,volume=1.3'
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        console.log('✅ Voice Changer plugin loaded');
    }

    registerCommands() {
        // Register individual effect commands
        Object.keys(this.effects).forEach(effect => {
            this.bot.messageHandler.registerCommand(effect, 
                (messageInfo) => this.voiceChangeCommand(messageInfo, effect), {
                description: `Apply ${effect} voice effect`,
                usage: `${config.PREFIX}${effect} (reply to audio/voice)`,
                category: 'media',
                plugin: 'voice-changer',
                source: 'voice-changer.js'
            });
        });

        // Main voice command with effect parameter
        this.bot.messageHandler.registerCommand('voice', this.voiceMainCommand.bind(this), {
            description: 'Apply voice effects to audio',
            usage: `${config.PREFIX}voice <effect> (reply to audio)\nEffects: ${Object.keys(this.effects).join(', ')}`,
            category: 'media',
            plugin: 'voice-changer',
            source: 'voice-changer.js'
        });
    }

    async voiceMainCommand(messageInfo) {
        const text = messageInfo.body.split(' ').slice(1).join(' ').toLowerCase();
        
        if (!text || !this.effects[text]) {
            const effectsList = Object.keys(this.effects).join(', ');
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please specify an effect.\n\n🎵 Available effects:\n${effectsList}\n\n📝 Usage: ${config.PREFIX}voice <effect> (reply to audio)`);
            return;
        }

        await this.voiceChangeCommand(messageInfo, text);
    }

    async voiceChangeCommand(messageInfo, effectType) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or voice message.');
                return;
            }

            if (!quotedMessage.audioMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio or voice message.');
                return;
            }

            // Download audio
            const buffer = await this.downloadMediaRobust(messageInfo, quotedMessage, 'audioMessage');
            
            if (!buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process audio. Please try again.');
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `input_${timestamp}.ogg`);
            outputPath = path.join(process.cwd(), 'tmp', `voice_${effectType}_${timestamp}.ogg`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Apply voice effect using FFmpeg
            const effect = this.effects[effectType];
            const command = `ffmpeg -i "${inputPath}" -af "${effect}" -c:a libopus -b:a 64k "${outputPath}"`;

            await new Promise((resolve, reject) => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error('FFmpeg error:', error);
                        reject(error);
                    } else {
                        resolve();
                    }
                });
            });

            // Send processed audio as voice note
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: { url: outputPath },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                contextInfo: {
                    externalAdReply: {
                        title: `🎵 Voice Effect: ${effectType.toUpperCase()}`,
                        body: 'MATDEV Voice Changer',
                        showAdAttribution: false
                    }
                }
            });

        } catch (error) {
            console.error('Voice changer error:', error);
            await this.bot.messageHandler.reply(messageInfo, `❌ Error applying ${effectType} effect.`);
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

const voiceChangerPlugin = new VoiceChangerPlugin();

module.exports = {
    init: voiceChangerPlugin.init.bind(voiceChangerPlugin),
    name: voiceChangerPlugin.name,
    description: voiceChangerPlugin.description,
    version: voiceChangerPlugin.version
};
