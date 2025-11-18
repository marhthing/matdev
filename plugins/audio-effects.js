
/**
 * MATDEV Audio Effects Plugin
 * Apply various voice and audio effects to audio messages
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { exec } = require('child_process');
const config = require('../config');

class AudioEffectsPlugin {
    constructor() {
        this.name = 'audio-effects';
        this.description = 'Apply various voice and audio effects to audio messages';
        this.version = '2.0.0';
        
        this.effects = {
            deep: {
                filter: 'asetrate=44100*0.75,atempo=1.3333,dynaudnorm=p=0.9:s=5,lowpass=f=2000,volume=1.3',
                description: 'Deep bass voice with enhanced low frequencies',
                category: 'voice'
            },
            slow: {
                filter: 'atempo=0.5,dynaudnorm=p=0.9:s=10,compand=attacks=0.1:points=-90/-90|-60/-40|-30/-20|-10/-10|0/-5:gain=2',
                description: 'Slow motion with enhanced clarity',
                category: 'speed'
            },
            fast: {
                filter: 'atempo=2.0,dynaudnorm=p=0.95:s=3,highpass=f=100,volume=1.1',
                description: 'Fast playback with clarity enhancement',
                category: 'speed'
            },
            bass: {
                filter: 'dynaudnorm=p=0.9:s=5,lowpass=f=150,highpass=f=20,volume=1.4,compand=attacks=0.1:points=-60/-40|-30/-20|-10/-10|0/-5:gain=3',
                description: 'Professional bass boost with dynamic processing',
                category: 'eq'
            }
        };
    }

    async init(bot) {
        this.bot = bot;
        this.registerCommands();

        await fs.ensureDir(path.join(process.cwd(), 'tmp'));
        
        // Check if FFmpeg is available
        try {
            const { exec } = require('child_process');
            await new Promise((resolve, reject) => {
                exec('ffmpeg -version', (error, stdout, stderr) => {
                    if (error) {
                        console.log('⚠️ FFmpeg not found - audio effects may not work');
                        reject(error);
                    } else {
                        console.log('✅ Audio Effects plugin loaded (FFmpeg available)');
                        resolve();
                    }
                });
            });
        } catch (error) {
            console.log('✅ Audio Effects plugin loaded (FFmpeg check failed - will attempt to use anyway)');
        }
    }

    registerCommands() {
        // Register individual effect commands with "audio" category
        Object.keys(this.effects).forEach(effect => {
            this.bot.messageHandler.registerCommand(effect, 
                (messageInfo) => this.applyEffect(messageInfo, effect), {
                description: this.effects[effect].description,
                usage: `${config.PREFIX}${effect} (reply to audio)`,
                category: 'audio',
                plugin: 'audio-effects',
                source: 'voice-changer.js'
            });
        });

    }


    async applyEffect(messageInfo, effectName) {
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
            const media = await this.downloadMediaRobust(messageInfo, quotedMessage, 'audioMessage');
            
            if (!media?.buffer) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Unable to process audio. Please try again.');
                return;
            }

            // Setup file paths
            const timestamp = Date.now();
            inputPath = path.join(process.cwd(), 'tmp', `input_${timestamp}.ogg`);
            outputPath = path.join(process.cwd(), 'tmp', `effect_${effectName}_${timestamp}.ogg`);

            // Write input file
            await fs.writeFile(inputPath, media.buffer);

            // Apply audio effect using FFmpeg with better error handling
            const effect = this.effects[effectName];
            let command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a libopus -b:a 64k "${outputPath}"`;
            
            // Fallback to MP3 if opus fails
            try {
                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error('FFmpeg opus error:', stderr);
                            reject(error);
                        } else {
                            resolve();
                        }
                    });
                });
            } catch (opusError) {
                console.log('⚠️ Opus encoding failed, trying MP3 fallback...');
                const mp3OutputPath = outputPath.replace('.ogg', '.mp3');
                command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a libmp3lame -b:a 64k "${mp3OutputPath}"`;
                
                await new Promise((resolve, reject) => {
                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            console.error('FFmpeg MP3 error:', stderr);
                            reject(new Error(`Audio effect failed: ${stderr}`));
                        } else {
                            // Update output path to MP3 version
                            if (outputPath !== mp3OutputPath) {
                                try {
                                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                                } catch (e) {}
                                outputPath = mp3OutputPath;
                            }
                            resolve();
                        }
                    });
                });
            }

            // Send processed audio
            const isMP3 = outputPath.endsWith('.mp3');
            const isVoiceEffect = effect.category === 'voice';
            
            const audioMessage = {
                audio: { url: outputPath },
                mimetype: isMP3 ? 'audio/mpeg' : 'audio/ogg; codecs=opus',
                ptt: isVoiceEffect, // Voice effects as voice notes, others as audio files
                contextInfo: {
                    externalAdReply: {
                        title: `🎛️ ${effectName.toUpperCase()} Effect`,
                        body: `${effect.description} | MATDEV`,
                        showAdAttribution: false
                    }
                }
            };

            await this.bot.sock.sendMessage(messageInfo.sender, audioMessage);

        } catch (error) {
            console.error(`Audio effect ${effectName} error:`, error);
            let errorMessage = `❌ Error applying ${effectName} effect.`;
            
            if (error.message.includes('FFmpeg')) {
                errorMessage += ' FFmpeg may not be installed.';
            } else if (error.message.includes('format')) {
                errorMessage += ' Audio format not supported.';
            }
            
            await this.bot.messageHandler.reply(messageInfo, errorMessage);
        } finally {
            // Enhanced cleanup with multiple attempts
            const filesToClean = [inputPath, outputPath];
            
            for (const filePath of filesToClean) {
                if (filePath) {
                    try {
                        if (await fs.pathExists(filePath)) {
                            await fs.unlink(filePath);
                        }
                    } catch (cleanupError) {
                        console.log(`Cleanup warning: ${cleanupError.message}`);
                        // Force cleanup attempt
                        setTimeout(async () => {
                            try {
                                if (await fs.pathExists(filePath)) {
                                    await fs.unlink(filePath);
                                }
                            } catch (e) {
                                // Silent failure for delayed cleanup
                            }
                        }, 5000);
                    }
                }
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
