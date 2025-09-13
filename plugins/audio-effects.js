
/**
 * MATDEV Audio Effects Plugin
 * Apply various voice and audio effects to audio messages
 */

const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('baileys');
const { exec } = require('child_process');
const config = require('../config');

class AudioEffectsPlugin {
    constructor() {
        this.name = 'audio-effects';
        this.description = 'Apply various voice and audio effects to audio messages';
        this.version = '2.0.0';
        
        this.effects = {
            // Voice effects
            robot: {
                filter: 'aformat=sample_rates=8000:sample_fmts=s16,volume=1.5',
                description: 'Robotic voice effect',
                category: 'voice'
            },
            chipmunk: {
                filter: 'asetrate=r=44100*1.5,aresample=44100',
                description: 'High-pitched chipmunk voice',
                category: 'voice'
            },
            deep: {
                filter: 'asetrate=r=44100*0.7,aresample=44100',
                description: 'Deep/low-pitched voice',
                category: 'voice'
            },
            echo: {
                filter: 'aecho=0.8:0.9:1000:0.3',
                description: 'Echo voice effect',
                category: 'voice'
            },
            reverb: {
                filter: 'aecho=0.8:0.88:60:0.4',
                description: 'Reverb voice effect',
                category: 'voice'
            },
            whisper: {
                filter: 'volume=0.3,highpass=f=300',
                description: 'Whisper/quiet voice',
                category: 'voice'
            },
            demon: {
                filter: 'asetrate=r=44100*0.6,aresample=44100,volume=1.3',
                description: 'Demonic voice effect',
                category: 'voice'
            },
            alien: {
                filter: 'asetrate=44100*0.8,aresample=44100,chorus=0.5:0.9:50:0.4:0.25:2',
                description: 'Alien voice effect',
                category: 'voice'
            },
            
            // Audio effects
            slow: {
                filter: 'atempo=0.5',
                description: 'Slow down audio 2x',
                category: 'speed'
            },
            fast: {
                filter: 'atempo=2.0',
                description: 'Speed up audio 2x',
                category: 'speed'
            },
            nightcore: {
                filter: 'asetrate=44100*1.25,aresample=44100',
                description: 'Nightcore effect (higher pitch and speed)',
                category: 'speed'
            },
            bass: {
                filter: 'bass=g=10,volume=0.8',
                description: 'Bass boost effect',
                category: 'eq'
            },
            treble: {
                filter: 'treble=g=8,volume=0.8',
                description: 'Treble boost effect',
                category: 'eq'
            },
            distortion: {
                filter: 'overdrive=20:0.5,volume=0.7',
                description: 'Audio distortion effect',
                category: 'fx'
            },
            underwater: {
                filter: 'lowpass=f=1000,volume=0.6',
                description: 'Underwater muffled effect',
                category: 'fx'
            },
            telephone: {
                filter: 'highpass=f=300,lowpass=f=3000,volume=1.2',
                description: 'Telephone/radio effect',
                category: 'fx'
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

        // Main effects list command
        this.bot.messageHandler.registerCommand('effects', this.effectsListCommand.bind(this), {
            description: 'List all available audio effects',
            usage: `${config.PREFIX}effects`,
            category: 'audio',
            plugin: 'audio-effects',
            source: 'voice-changer.js'
        });
    }

    async effectsListCommand(messageInfo) {
        const voiceEffects = Object.entries(this.effects)
            .filter(([name, data]) => data.category === 'voice')
            .map(([name, data]) => `🎵 *${name}* - ${data.description}`)
            .join('\n');

        const speedEffects = Object.entries(this.effects)
            .filter(([name, data]) => data.category === 'speed')
            .map(([name, data]) => `⚡ *${name}* - ${data.description}`)
            .join('\n');

        const eqEffects = Object.entries(this.effects)
            .filter(([name, data]) => data.category === 'eq')
            .map(([name, data]) => `🎛️ *${name}* - ${data.description}`)
            .join('\n');

        const fxEffects = Object.entries(this.effects)
            .filter(([name, data]) => data.category === 'fx')
            .map(([name, data]) => `🔊 *${name}* - ${data.description}`)
            .join('\n');

        const message = `🎛️ *AUDIO EFFECTS AVAILABLE*\n\n` +
                       `*🎵 Voice Effects:*\n${voiceEffects}\n\n` +
                       `*⚡ Speed Effects:*\n${speedEffects}\n\n` +
                       `*🎛️ EQ Effects:*\n${eqEffects}\n\n` +
                       `*🔊 FX Effects:*\n${fxEffects}\n\n` +
                       `📝 *Usage:* Reply to audio and use ${config.PREFIX}<effect_name>`;
        
        await this.bot.messageHandler.reply(messageInfo, message);
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
                command = `ffmpeg -i "${inputPath}" -af "${effect.filter}" -c:a mp3 -b:a 64k "${mp3OutputPath}"`;
                
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
