
/**
 * MATDEV Audio Effects Plugin
 * Apply various audio effects like robot, slow, fast, etc.
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class AudioEffectsPlugin {
    constructor() {
        this.name = 'audio-effects';
        this.description = 'Apply various audio effects to audio messages';
        this.version = '1.0.0';
        
        this.effects = {
            robot: {
                filter: 'aformat=sample_rates=8000:sample_fmts=s16,volume=1.2,atempo=1.1',
                description: 'Robotic voice effect'
            },
            slow: {
                filter: 'atempo=0.5',
                description: 'Slow down audio 2x'
            },
            fast: {
                filter: 'atempo=2.0',
                description: 'Speed up audio 2x'
            },
            nightcore: {
                filter: 'asetrate=44100*1.25,aresample=44100',
                description: 'Nightcore effect (higher pitch and speed)'
            },
            bass: {
                filter: 'bass=g=10,volume=0.8',
                description: 'Bass boost effect'
            },
            treble: {
                filter: 'treble=g=8,volume=0.8',
                description: 'Treble boost effect'
            },
            distortion: {
                filter: 'overdrive=20:0.5,volume=0.7',
                description: 'Audio distortion effect'
            },
            underwater: {
                filter: 'lowpass=f=1000,volume=0.6',
                description: 'Underwater muffled effect'
            },
            telephone: {
                filter: 'highpass=f=300,lowpass=f=3000,volume=1.2',
                description: 'Telephone/radio effect'
            },
            alien: {
                filter: 'asetrate=44100*0.8,aresample=44100,chorus=0.5:0.9:50:0.4:0.25:2',
                description: 'Alien voice effect'
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        console.log('✅ Audio Effects plugin loaded');
    }

    registerCommands() {
        // Register individual effect commands
        Object.keys(this.effects).forEach(effect => {
            this.bot.messageHandler.registerCommand(effect, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${effect} (reply to audio)`,
                category: 'media',
                plugin: 'audio-effects',
                source: 'audio-effects.js'
            });
        });

        // Main effects command with list
        this.bot.messageHandler.registerCommand('effects', this.effectsListCommand.bind(this), {
            description: 'List all available audio effects',
            usage: `${config.PREFIX}effects`,
            category: 'media',
            plugin: 'audio-effects',
            source: 'audio-effects.js'
        });

        // Apply effect with parameter
        this.bot.messageHandler.registerCommand('effect', this.effectCommand.bind(this), {
            description: 'Apply specific audio effect',
            usage: `${config.PREFIX}effect <name> (reply to audio)`,
            category: 'media',
            plugin: 'audio-effects',
            source: 'audio-effects.js'
        });
    }

    async effectsListCommand(messageInfo) {
        const effectsList = Object.entries(this.effects)
            .map(([name, data]) => `🎵 *${name}* - ${data.description}`)
            .join('\n');

        const message = `🎛️ *AUDIO EFFECTS AVAILABLE*\n\n${effectsList}\n\n📝 Usage: Reply to audio and use ${config.PREFIX}<effect_name>\nOr use: ${config.PREFIX}effect <name>`;
        
        await this.bot.messageHandler.reply(messageInfo, message);
    }

    async effectCommand(messageInfo) {
        const text = messageInfo.body.split(' ').slice(1).join(' ').toLowerCase();
        
        if (!text || !this.effects[text]) {
            const effectsList = Object.keys(this.effects).join(', ');
            await this.bot.messageHandler.reply(messageInfo, 
                `❌ Please specify a valid effect.\n\n🎵 Available effects:\n${effectsList}\n\n📝 Usage: ${config.PREFIX}effect <name> (reply to audio)`);
            return;
        }

        await this.applyEffect(messageInfo, text);
    }

    async applyEffect(messageInfo, effectName) {
        let inputPath = null;
        let outputPath = null;

        try {
            const quotedMessage = messageInfo.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                messageInfo.message?.quotedMessage;
            
            if (!quotedMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio message.');
                return;
            }

            if (!quotedMessage.audioMessage) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Please reply to an audio message.');
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
            outputPath = path.join(process.cwd(), 'tmp', `effect_${effectName}_${timestamp}.ogg`);

            // Write input file
            await fs.writeFile(inputPath, buffer.buffer);

            // Apply audio effect using FFmpeg
            const effect = this.effects[effectName];
            const command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a libopus -b:a 128k "${outputPath}"`;

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

            // Check if output file exists
            const stats = await fs.stat(outputPath);
            if (stats.size === 0) {
                throw new Error('Output audio is empty');
            }

            // Send processed audio
            await this.bot.sock.sendMessage(messageInfo.sender, {
                audio: { url: outputPath },
                mimetype: 'audio/ogg; codecs=opus',
                ptt: false,
                contextInfo: {
                    externalAdReply: {
                        title: `🎛️ Audio Effect: ${effectName.toUpperCase()}`,
                        body: `${effect.description} | MATDEV`,
                        showAdAttribution: false
                    }
                }
            });

        } catch (error) {
            console.error(`Audio effect ${effectName} error:`, error);
            await this.bot.messageHandler.reply(messageInfo, `❌ Error applying ${effectName} effect.`);
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

const audioEffectsPlugin = new AudioEffectsPlugin();

module.exports = {
    init: audioEffectsPlugin.init.bind(audioEffectsPlugin),
    name: audioEffectsPlugin.name,
    description: audioEffectsPlugin.description,
    version: audioEffectsPlugin.version
};
