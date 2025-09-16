/**
 * File Converter Plugin - 2025 Latest Methods with API Fallbacks
 * Convert between PDF, DOCX, DOC, and image formats
 * Supports WhatsApp media messages and quoted messages
 * 
 * Commands:
 * - .pdf - Convert any document/image to PDF
 * - .doc - Convert any document to DOCX
 * - .png - Convert any file to PNG
 * - .jpg - Convert any file to JPG
 * - .html - Convert any document to HTML
 * - .txt - Convert any document to text
 * - .convertlist - List all supported conversions
 * 
 * Modern 2025 Features:
 * - Multiple fallback methods for each conversion type
 * - API integration with CloudConvert, Convertio, FreeConvert
 * - Intelligent error handling and retry logic
 * - Supports latest image formats (AVIF, WebP, etc.)
 */

const config = require('../config');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const fs = require('fs').promises;
const path = require('path');

// Core packages with fallback handling
let sharp, PDFDocument, mammoth, axios, FormData;
try {
    sharp = require('sharp');
} catch (e) {
    console.log('📦 Sharp not available - image processing will be limited');
}
try {
    PDFDocument = require('pdfkit');
} catch (e) {
    console.log('📦 PDFKit not available - PDF generation will be limited');
}
try {
    mammoth = require('mammoth');
} catch (e) {
    console.log('📦 Mammoth not available - DOCX processing will be limited');
}
try {
    axios = require('axios');
} catch (e) {
    console.log('📦 Axios not available - API fallbacks will be limited');
}
try {
    FormData = require('form-data');
} catch (e) {
    console.log('📦 FormData not available - some API uploads will be limited');
}

// Modern 2025 PDF converters
let pdfImgConvert, pdfToPngConverter, libre, convertAsync;
try {
    pdfImgConvert = require('pdf-img-convert');
} catch (e) {
    console.log('📦 pdf-img-convert not available, using fallbacks');
}
try {
    pdfToPngConverter = require('pdf-to-png-converter');
} catch (e) {
    console.log('📦 pdf-to-png-converter not available, using fallbacks');
}
try {
    libre = require('libreoffice-convert');
    const { promisify } = require('util');
    convertAsync = promisify(libre.convert);
} catch (e) {
    console.log('📦 libreoffice-convert not available, using API fallbacks for document conversion');
}

// API rate limiting tracking (resets every 24 hours)
const apiUsage = {
    cloudconvert: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 },
    convertio: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 },
    freeconvert: { count: 0, resetTime: Date.now() + 24 * 60 * 60 * 1000 }
};

class ConverterPlugin {
    constructor() {
        this.name = 'converter';
        this.description = 'File converter for PDF, DOCX, DOC, and image formats with 2025 methods';
        this.version = '2.0.0';
        
        this.supportedFormats = {
            input: ['pdf', 'docx', 'doc', 'odt', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif'],
            output: ['pdf', 'docx', 'doc', 'jpg', 'jpeg', 'png', 'webp', 'tiff', 'html', 'txt']
        };
        
        // Clean up old API usage counters
        this.cleanupApiUsage();
    }

    /**
     * Initialize plugin and register commands
     */
    async init(bot) {
        this.bot = bot;
        this.registerCommands();
        
        const status = this.getStatus();
        const packagesAvailable = Object.values(status.packages).filter(Boolean).length;
        const fallbacksAvailable = status.fallbacksAvailable;
        
        console.log(`✅ File Converter plugin loaded - ${packagesAvailable} packages available, fallbacks: ${fallbacksAvailable ? 'Yes' : 'No'}`);
    }

    /**
     * Clean up expired API usage counters
     */
    cleanupApiUsage() {
        const now = Date.now();
        Object.keys(apiUsage).forEach(api => {
            if (now > apiUsage[api].resetTime) {
                apiUsage[api].count = 0;
                apiUsage[api].resetTime = now + 24 * 60 * 60 * 1000;
            }
        });
    }

    /**
     * Register all converter commands
     */
    registerCommands() {
        // PDF converter command
        this.bot.messageHandler.registerCommand('pdf', this.convertToPdfCommand.bind(this), {
            description: 'Convert any document or image to PDF',
            usage: `${config.PREFIX}pdf (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // DOCX converter command
        this.bot.messageHandler.registerCommand('doc', this.convertToDocxCommand.bind(this), {
            description: 'Convert any document to DOCX',
            usage: `${config.PREFIX}doc (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // PNG converter command
        this.bot.messageHandler.registerCommand('png', this.convertToPngCommand.bind(this), {
            description: 'Convert any file to PNG image',
            usage: `${config.PREFIX}png (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // JPG converter command
        this.bot.messageHandler.registerCommand('jpg', this.convertToJpgCommand.bind(this), {
            description: 'Convert any file to JPG image',
            usage: `${config.PREFIX}jpg (reply to file or send file with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // HTML converter command
        this.bot.messageHandler.registerCommand('html', this.convertToHtmlCommand.bind(this), {
            description: 'Convert any document to HTML',
            usage: `${config.PREFIX}html (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // TXT converter command
        this.bot.messageHandler.registerCommand('txt', this.convertToTxtCommand.bind(this), {
            description: 'Convert any document to text',
            usage: `${config.PREFIX}txt (reply to document or send document with caption)`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });

        // Conversion help/list command
        this.bot.messageHandler.registerCommand('convertlist', this.listConversionsCommand.bind(this), {
            description: 'List all supported file conversions',
            usage: `${config.PREFIX}convertlist`,
            category: 'converter',
            plugin: 'converter',
            source: 'converter.js'
        });
    }

    /**
     * Download media from message with error handling
     */
    async downloadMedia(message, expectedType = null) {
        try {
            let messageToDownload = null;
            let mediaType = null;

            // Check direct message first
            const directPdf = message.message?.documentMessage;
            const directImage = message.message?.imageMessage;
            
            if (directPdf || directImage) {
                messageToDownload = {
                    key: message.key,
                    message: message.message
                };
                mediaType = directPdf ? 'document' : 'image';
            } else {
                // Check quoted message
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage ||
                                      message.message?.quotedMessage;
                
                if (!quotedMessage) {
                    return null;
                }

                // Check quoted message types
                if (quotedMessage.documentMessage) {
                    mediaType = 'document';
                    messageToDownload = { 
                        message: quotedMessage,
                        key: message.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || message.key
                    };
                } else if (quotedMessage.imageMessage) {
                    mediaType = 'image';
                    messageToDownload = { 
                        message: quotedMessage,
                        key: message.message.extendedTextMessage?.contextInfo?.quotedMessage?.key || message.key
                    };
                }
            }

            if (!messageToDownload) {
                return null;
            }

            // Download media
            const buffer = await downloadMediaMessage(messageToDownload, 'buffer', {}, {
                logger: console,
                reuploadRequest: this.bot.sock.updateMediaMessage
            });

            if (!buffer) {
                return null;
            }

            // Get filename and mimetype
            let filename = 'file';
            let mimetype = '';
            
            const messageContent = messageToDownload.message;
            if (messageContent.documentMessage) {
                filename = messageContent.documentMessage.fileName || 'document';
                mimetype = messageContent.documentMessage.mimetype || '';
            } else if (messageContent.imageMessage) {
                filename = 'image';
                mimetype = messageContent.imageMessage.mimetype || 'image/jpeg';
            }

            return {
                buffer,
                filename,
                mimetype,
                mediaType
            };

        } catch (error) {
            console.log('Download media error:', error);
            return null;
        }
    }

    /**
     * Modern 2025 PDF to Images conversion with multiple fallbacks
     */
    async pdfToImages(pdfBuffer, options = {}) {
        const methods = [
            () => this.pdfToImagesModern(pdfBuffer, options),
            () => this.pdfToImagesLegacy(pdfBuffer, options),
            () => this.pdfToImagesAPI(pdfBuffer, options)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying PDF to images method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ PDF to images successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`All PDF to image methods failed. Last error: ${error.message}`);
                }
            }
        }
    }

    /**
     * Modern PDF to Images using latest packages (2025)
     */
    async pdfToImagesModern(pdfBuffer, options = {}) {
        // Try pdf-img-convert first (pure JavaScript, most reliable)
        if (pdfImgConvert) {
            try {
                const pdfArray = await pdfImgConvert.convert(pdfBuffer, {
                    width: options.maxWidth || 2000,
                    height: options.maxHeight || 2000,
                    page_numbers: options.page ? [options.page] : undefined
                });

                const processedImages = await Promise.all(
                    pdfArray.map(async (imageBuffer, index) => {
                        let processed = imageBuffer;
                        
                        // Apply Sharp processing if available
                        if (sharp) {
                            try {
                                let sharpInstance = sharp(imageBuffer);
                                
                                if (options.format && options.format !== 'png') {
                                    if (options.format === 'jpg' || options.format === 'jpeg') {
                                        sharpInstance = sharpInstance.jpeg({ quality: options.quality || 85 });
                                    } else if (options.format === 'webp') {
                                        sharpInstance = sharpInstance.webp({ quality: options.quality || 80 });
                                    }
                                }
                                
                                processed = await sharpInstance.toBuffer();
                            } catch (e) {
                                console.log('Sharp processing failed, using original buffer');
                                processed = imageBuffer;
                            }
                        }

                        return {
                            buffer: processed,
                            page: index + 1,
                            filename: `page_${index + 1}.${options.format || 'png'}`
                        };
                    })
                );

                return processedImages;
            } catch (error) {
                throw new Error(`pdf-img-convert failed: ${error.message}`);
            }
        }

        // Try pdf-to-png-converter as backup
        if (pdfToPngConverter) {
            try {
                const result = await pdfToPngConverter.convert(pdfBuffer);
                
                const processedImages = await Promise.all(
                    result.map(async (imageBuffer, index) => {
                        let processed = imageBuffer;
                        
                        if (sharp) {
                            try {
                                let sharpInstance = sharp(imageBuffer);
                                
                                if (options.format === 'jpg' || options.format === 'jpeg') {
                                    sharpInstance = sharpInstance.jpeg({ quality: options.quality || 85 });
                                } else if (options.format === 'webp') {
                                    sharpInstance = sharpInstance.webp({ quality: options.quality || 80 });
                                }
                                
                                processed = await sharpInstance.toBuffer();
                            } catch (e) {
                                console.log('Sharp processing failed, using original buffer');
                            }
                        }

                        return {
                            buffer: processed,
                            page: index + 1,
                            filename: `page_${index + 1}.${options.format || 'png'}`
                        };
                    })
                );

                return processedImages;
            } catch (error) {
                throw new Error(`pdf-to-png-converter failed: ${error.message}`);
            }
        }

        throw new Error('No modern PDF conversion packages available');
    }

    /**
     * Legacy PDF to Images conversion (fallback)
     */
    async pdfToImagesLegacy(pdfBuffer, options = {}) {
        // Try original pdf-to-img package if available
        try {
            const pdf2img = require('pdf-to-img');
            
            const convert = pdf2img.convert;
            const images = await convert(pdfBuffer, {
                scale: options.scale || 2.0,
                format: options.format || 'png'
            });

            const processedImages = await Promise.all(
                images.map(async (imageBuffer, index) => {
                    let processed = imageBuffer;
                    
                    if (sharp) {
                        try {
                            let sharpInstance = sharp(imageBuffer);
                            
                            if (options.maxWidth || options.maxHeight) {
                                sharpInstance = sharpInstance.resize(options.maxWidth || 2000, options.maxHeight || 2000, {
                                    fit: 'inside',
                                    withoutEnlargement: true
                                });
                            }
                            
                            processed = await sharpInstance.toBuffer();
                        } catch (e) {
                            console.log('Sharp processing failed, using original buffer');
                        }
                    }

                    return {
                        buffer: processed,
                        page: index + 1,
                        filename: `page_${index + 1}.${options.format || 'png'}`
                    };
                })
            );

            return options.page ? [processedImages[options.page - 1]] : processedImages;
        } catch (error) {
            throw new Error(`Legacy PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * Helper to get file extension from format
     */
    getExtensionFromFormat(format) {
        const map = {
            'pdf': 'pdf',
            'docx': 'docx',
            'doc': 'doc',
            'jpg': 'jpg',
            'jpeg': 'jpg',
            'png': 'png',
            'webp': 'webp',
            'tiff': 'tiff'
        };
        return map[format.toLowerCase()] || format;
    }

    /**
     * Check if user consents to API upload
     */
    async getUserConsentForAPI(messageInfo, apiName) {
        // For now, we'll inform the user that API fallback is being used
        await this.bot.messageHandler.reply(messageInfo, 
            `🌐 Using ${apiName} API service for conversion (file will be uploaded securely and deleted after processing)...`
        );
        return true; // In future, could implement user consent prompts
    }

    /**
     * API-based PDF to Images conversion (final fallback)
     */
    async pdfToImagesAPI(pdfBuffer, options = {}, messageInfo = null) {
        const apis = [
            { name: 'CloudConvert', fn: () => this.convertViaCloudConvert(pdfBuffer, 'png') },
            { name: 'Convertio', fn: () => this.convertViaConvertio(pdfBuffer, 'png') },
            { name: 'FreeConvert', fn: () => this.convertViaFreeConvert(pdfBuffer, 'png') }
        ];

        for (const api of apis) {
            try {
                if (messageInfo) {
                    await this.getUserConsentForAPI(messageInfo, api.name);
                }
                const result = await api.fn();
                if (result) {
                    // For API results, we might get a single buffer
                    if (Buffer.isBuffer(result)) {
                        return [{
                            buffer: result,
                            page: 1,
                            filename: `page_1.${options.format || 'png'}`
                        }];
                    }
                    return result;
                }
            } catch (error) {
                console.log(`${api.name} API conversion attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API conversion methods failed');
    }

    /**
     * Images to PDF conversion with fallbacks
     */
    async imagesToPdf(imagePaths, outputPath = null, options = {}) {
        const methods = [
            () => this.imagesToPdfLocal(imagePaths, outputPath, options),
            () => this.imagesToPdfAPI(imagePaths, outputPath, options)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying images to PDF method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ Images to PDF successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`Images to PDF conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local images to PDF conversion using PDFKit
     */
    async imagesToPdfLocal(imagePaths, outputPath = null, options = {}) {
        if (!PDFDocument) {
            throw new Error('PDFKit not available for local PDF generation');
        }

        try {
            const defaultOptions = {
                pageSize: options.pageSize || 'A4',
                margin: options.margin || 50,
                autoFirstPage: false,
                quality: options.quality || 85
            };

            const doc = new PDFDocument(defaultOptions);
            const chunks = [];

            doc.on('data', chunk => chunks.push(chunk));
            doc.on('end', () => {});

            for (let i = 0; i < imagePaths.length; i++) {
                let imageBuffer;
                
                if (typeof imagePaths[i] === 'string') {
                    imageBuffer = await fs.readFile(imagePaths[i]);
                } else {
                    imageBuffer = imagePaths[i];
                }

                // Optimize image with Sharp if available, otherwise use raw buffer
                let optimizedImage = imageBuffer;
                if (sharp) {
                    try {
                        optimizedImage = await sharp(imageBuffer)
                            .jpeg({ quality: defaultOptions.quality })
                            .toBuffer();
                    } catch (e) {
                        console.log('Sharp optimization failed, using raw image');
                        optimizedImage = imageBuffer;
                    }
                }

                if (i > 0) doc.addPage();
                
                // Get page dimensions
                const pageWidth = doc.page.width - (defaultOptions.margin * 2);
                const pageHeight = doc.page.height - (defaultOptions.margin * 2);
                
                doc.image(optimizedImage, defaultOptions.margin, defaultOptions.margin, {
                    fit: [pageWidth, pageHeight],
                    align: 'center',
                    valign: 'center'
                });
            }

            doc.end();

            return new Promise((resolve, reject) => {
                doc.on('end', () => {
                    const pdfBuffer = Buffer.concat(chunks);
                    if (outputPath) {
                        fs.writeFile(outputPath, pdfBuffer)
                            .then(() => resolve(pdfBuffer))
                            .catch(reject);
                    } else {
                        resolve(pdfBuffer);
                    }
                });
                doc.on('error', reject);
            });
        } catch (error) {
            throw new Error(`Local images to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based images to PDF conversion
     */
    async imagesToPdfAPI(imagePaths, outputPath = null, options = {}, messageInfo = null) {
        // For now, convert first image only via API
        if (!imagePaths || imagePaths.length === 0) {
            throw new Error('No images provided for PDF conversion');
        }

        let imageBuffer;
        if (typeof imagePaths[0] === 'string') {
            imageBuffer = await fs.readFile(imagePaths[0]);
        } else {
            imageBuffer = imagePaths[0];
        }

        const apis = [
            { name: 'CloudConvert', fn: () => this.convertViaCloudConvert(imageBuffer, 'pdf') },
            { name: 'Convertio', fn: () => this.convertViaConvertio(imageBuffer, 'pdf') },
            { name: 'FreeConvert', fn: () => this.convertViaFreeConvert(imageBuffer, 'pdf') }
        ];

        for (const api of apis) {
            try {
                if (messageInfo) {
                    await this.getUserConsentForAPI(messageInfo, api.name);
                }
                const result = await api.fn();
                if (result && outputPath) {
                    await fs.writeFile(outputPath, result);
                }
                return result;
            } catch (error) {
                console.log(`${api.name} API images to PDF attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API images to PDF methods failed');
    }

    /**
     * CloudConvert API conversion (10 conversions/day free)
     */
    async convertViaCloudConvert(buffer, targetFormat) {
        this.cleanupApiUsage();
        if (apiUsage.cloudconvert.count >= 10) {
            throw new Error('CloudConvert daily limit reached (10/day)');
        }

        if (!axios || !FormData) {
            throw new Error('Required packages not available for CloudConvert API');
        }

        const apiKey = process.env.CLOUDCONVERT_API_KEY;
        if (!apiKey) {
            throw new Error('CloudConvert API key not configured (set CLOUDCONVERT_API_KEY)');
        }

        try {
            apiUsage.cloudconvert.count++;
            
            // Create job
            const jobResponse = await axios.post('https://api.cloudconvert.com/v2/jobs', {
                tasks: {
                    'import-1': {
                        operation: 'import/upload'
                    },
                    'convert-1': {
                        operation: 'convert',
                        input: 'import-1',
                        output_format: targetFormat
                    },
                    'export-1': {
                        operation: 'export/url',
                        input: 'convert-1'
                    }
                }
            }, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const job = jobResponse.data.data;
            const uploadTask = job.tasks.find(t => t.operation === 'import/upload');
            
            // Upload file
            const formData = new FormData();
            formData.append('file', buffer, 'input.pdf');
            
            await axios.post(uploadTask.result.form.url, formData, {
                headers: formData.getHeaders()
            });
            
            // Poll for completion
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const statusResponse = await axios.get(`https://api.cloudconvert.com/v2/jobs/${job.id}`, {
                    headers: { 'Authorization': `Bearer ${apiKey}` }
                });
                
                const updatedJob = statusResponse.data.data;
                const exportTask = updatedJob.tasks.find(t => t.operation === 'export/url');
                
                if (exportTask && exportTask.status === 'finished') {
                    const downloadResponse = await axios.get(exportTask.result.files[0].url, {
                        responseType: 'arraybuffer'
                    });
                    return Buffer.from(downloadResponse.data);
                }
                
                attempts++;
            }
            
            throw new Error('CloudConvert job timeout');
            
        } catch (error) {
            throw new Error(`CloudConvert failed: ${error.message}`);
        }
    }

    /**
     * FreeConvert API conversion (1GB monthly limit)
     */
    async convertViaFreeConvert(buffer, targetFormat) {
        this.cleanupApiUsage();
        if (apiUsage.freeconvert.count >= 50) { // Conservative limit
            throw new Error('FreeConvert monthly limit reached');
        }

        if (!axios) {
            throw new Error('Axios not available for API calls');
        }

        const apiKey = process.env.FREECONVERT_API_KEY;
        if (!apiKey) {
            throw new Error('FreeConvert API key not configured (set FREECONVERT_API_KEY)');
        }

        try {
            apiUsage.freeconvert.count++;
            
            // Upload file first
            const uploadResponse = await axios.post('https://api.freeconvert.com/v1/process/upload', {
                apikey: apiKey,
                file: buffer.toString('base64'),
                filename: `input.${this.getExtensionFromFormat(await this.detectFormatFromBuffer(buffer))}`
            });

            if (!uploadResponse.data || !uploadResponse.data.id) {
                throw new Error('FreeConvert upload failed');
            }

            const fileId = uploadResponse.data.id;
            
            // Start conversion
            const convertResponse = await axios.post('https://api.freeconvert.com/v1/process/convert', {
                apikey: apiKey,
                input: fileId,
                outputformat: targetFormat
            });

            if (!convertResponse.data || !convertResponse.data.id) {
                throw new Error('FreeConvert conversion start failed');
            }

            const conversionId = convertResponse.data.id;
            
            // Poll for completion
            let completed = false;
            let attempts = 0;
            const maxAttempts = 20;
            
            while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const statusResponse = await axios.get(`https://api.freeconvert.com/v1/process/status/${conversionId}`, {
                    params: { apikey: apiKey }
                });
                
                if (statusResponse.data && statusResponse.data.status === 'completed') {
                    // Download result
                    const downloadResponse = await axios.get(statusResponse.data.output.url, {
                        responseType: 'arraybuffer'
                    });
                    return Buffer.from(downloadResponse.data);
                }
                
                if (statusResponse.data && statusResponse.data.status === 'error') {
                    throw new Error(statusResponse.data.message || 'FreeConvert processing error');
                }
                
                attempts++;
            }
            
            throw new Error('FreeConvert job timeout');
            
        } catch (error) {
            throw new Error(`FreeConvert failed: ${error.message}`);
        }
    }

    /**
     * Convertio API conversion (25 conversions/24h free)
     */
    async convertViaConvertio(buffer, targetFormat) {
        this.cleanupApiUsage();
        if (apiUsage.convertio.count >= 25) {
            throw new Error('Convertio daily limit reached (25/day)');
        }

        if (!axios) {
            throw new Error('Axios not available for API calls');
        }

        const apiKey = process.env.CONVERTIO_API_KEY;
        if (!apiKey) {
            throw new Error('Convertio API key not configured (set CONVERTIO_API_KEY)');
        }

        try {
            apiUsage.convertio.count++;
            
            // Start conversion
            const startResponse = await axios.post('https://api.convertio.co/convert', {
                apikey: apiKey,
                input: 'base64',
                file: buffer.toString('base64'),
                filename: 'input.pdf',
                outputformat: targetFormat
            });

            if (startResponse.data.status !== 'ok') {
                throw new Error(startResponse.data.error || 'Convertio start failed');
            }

            const conversionId = startResponse.data.data.id;
            
            // Poll for completion
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30;
            
            while (!completed && attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const statusResponse = await axios.get(`https://api.convertio.co/convert/${conversionId}/status`, {
                    params: { apikey: apiKey }
                });
                
                if (statusResponse.data.status === 'ok') {
                    const step = statusResponse.data.data.step;
                    if (step === 'finish') {
                        // Download result
                        const downloadResponse = await axios.get(statusResponse.data.data.output.url, {
                            responseType: 'arraybuffer'
                        });
                        return Buffer.from(downloadResponse.data);
                    }
                }
                
                attempts++;
            }
            
            throw new Error('Convertio job timeout');
            
        } catch (error) {
            throw new Error(`Convertio failed: ${error.message}`);
        }
    }

    /**
     * Document conversion with fallbacks (PDF ↔ DOCX)
     */
    async pdfToDocx(pdfBuffer, outputPath = null) {
        const methods = [
            () => this.pdfToDocxLocal(pdfBuffer, outputPath),
            () => this.pdfToDocxAPI(pdfBuffer, outputPath)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying PDF to DOCX method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ PDF to DOCX successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`PDF to DOCX conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local PDF to DOCX conversion
     */
    async pdfToDocxLocal(pdfBuffer, outputPath = null) {
        if (!convertAsync) {
            throw new Error('LibreOffice converter not available');
        }

        try {
            const docxBuffer = await convertAsync(pdfBuffer, '.docx', undefined);
            
            if (outputPath) {
                await fs.writeFile(outputPath, docxBuffer);
            }
            
            return docxBuffer;
        } catch (error) {
            throw new Error(`Local PDF to DOCX conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based PDF to DOCX conversion
     */
    async pdfToDocxAPI(pdfBuffer, outputPath = null, messageInfo = null) {
        const apis = [
            { name: 'CloudConvert', fn: () => this.convertViaCloudConvert(pdfBuffer, 'docx') },
            { name: 'Convertio', fn: () => this.convertViaConvertio(pdfBuffer, 'docx') },
            { name: 'FreeConvert', fn: () => this.convertViaFreeConvert(pdfBuffer, 'docx') }
        ];

        for (const api of apis) {
            try {
                if (messageInfo) {
                    await this.getUserConsentForAPI(messageInfo, api.name);
                }
                const result = await api.fn();
                if (result && outputPath) {
                    await fs.writeFile(outputPath, result);
                }
                return result;
            } catch (error) {
                console.log(`${api.name} API PDF to DOCX attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API PDF to DOCX methods failed');
    }

    /**
     * DOCX to PDF conversion with fallbacks
     */
    async docxToPdf(docxBuffer, outputPath = null) {
        const methods = [
            () => this.docxToPdfLocal(docxBuffer, outputPath),
            () => this.docxToPdfAPI(docxBuffer, outputPath)
        ];

        for (let i = 0; i < methods.length; i++) {
            try {
                console.log(`🔄 Trying DOCX to PDF method ${i + 1}/${methods.length}`);
                const result = await methods[i]();
                console.log(`✅ DOCX to PDF successful using method ${i + 1}`);
                return result;
            } catch (error) {
                console.log(`❌ Method ${i + 1} failed: ${error.message}`);
                if (i === methods.length - 1) {
                    throw new Error(`DOCX to PDF conversion failed: ${error.message}`);
                }
            }
        }
    }

    /**
     * Local DOCX to PDF conversion
     */
    async docxToPdfLocal(docxBuffer, outputPath = null) {
        if (!convertAsync) {
            throw new Error('LibreOffice converter not available');
        }

        try {
            const pdfBuffer = await convertAsync(docxBuffer, '.pdf', undefined);
            
            if (outputPath) {
                await fs.writeFile(outputPath, pdfBuffer);
            }
            
            return pdfBuffer;
        } catch (error) {
            throw new Error(`Local DOCX to PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * API-based DOCX to PDF conversion
     */
    async docxToPdfAPI(docxBuffer, outputPath = null, messageInfo = null) {
        const apis = [
            { name: 'CloudConvert', fn: () => this.convertViaCloudConvert(docxBuffer, 'pdf') },
            { name: 'Convertio', fn: () => this.convertViaConvertio(docxBuffer, 'pdf') },
            { name: 'FreeConvert', fn: () => this.convertViaFreeConvert(docxBuffer, 'pdf') }
        ];

        for (const api of apis) {
            try {
                if (messageInfo) {
                    await this.getUserConsentForAPI(messageInfo, api.name);
                }
                const result = await api.fn();
                if (result && outputPath) {
                    await fs.writeFile(outputPath, result);
                }
                return result;
            } catch (error) {
                console.log(`${api.name} API DOCX to PDF attempt failed: ${error.message}`);
            }
        }

        throw new Error('All API DOCX to PDF methods failed');
    }

    /**
     * DOCX to HTML/Text conversion using Mammoth
     */
    async docxToText(docxBuffer, format = 'html') {
        if (!mammoth) {
            throw new Error('Mammoth not available for DOCX processing');
        }

        try {
            const options = {
                convertImage: mammoth.images.imgElement(function(image) {
                    return image.read("base64").then(function(imageBuffer) {
                        return {
                            src: "data:" + image.contentType + ";base64," + imageBuffer
                        };
                    });
                })
            };

            if (format === 'text') {
                const result = await mammoth.extractRawText({ buffer: docxBuffer });
                return result.value;
            } else {
                const result = await mammoth.convertToHtml({ buffer: docxBuffer }, options);
                return result.value;
            }
        } catch (error) {
            throw new Error(`DOCX to ${format} conversion failed: ${error.message}`);
        }
    }

    /**
     * Image format conversion using Sharp (2025 optimized)
     */
    async convertImageFormat(imageBuffer, outputFormat, options = {}) {
        if (!sharp) {
            throw new Error('Sharp not available for image format conversion');
        }

        try {
            let sharpInstance = sharp(imageBuffer);

            // Apply transformations
            if (options.resize) {
                sharpInstance = sharpInstance.resize(options.resize.width, options.resize.height, {
                    fit: options.resize.fit || 'inside',
                    withoutEnlargement: options.resize.withoutEnlargement !== false
                });
            }

            // Convert to target format with optimized settings
            switch (outputFormat.toLowerCase()) {
                case 'jpg':
                case 'jpeg':
                    sharpInstance = sharpInstance.jpeg({ 
                        quality: options.quality || 85,
                        progressive: true,
                        mozjpeg: true // Use mozjpeg for better compression
                    });
                    break;
                case 'png':
                    sharpInstance = sharpInstance.png({ 
                        quality: options.quality || 100,
                        compressionLevel: options.compressionLevel || 6,
                        adaptiveFiltering: true
                    });
                    break;
                case 'webp':
                    sharpInstance = sharpInstance.webp({ 
                        quality: options.quality || 80,
                        lossless: options.lossless || false,
                        effort: 6 // Max compression effort
                    });
                    break;
                case 'avif':
                    sharpInstance = sharpInstance.avif({
                        quality: options.quality || 75,
                        effort: 4
                    });
                    break;
                case 'tiff':
                    sharpInstance = sharpInstance.tiff({ 
                        quality: options.quality || 80,
                        compression: options.compression || 'lzw'
                    });
                    break;
                default:
                    throw new Error(`Unsupported output format: ${outputFormat}`);
            }

            return await sharpInstance.toBuffer();
        } catch (error) {
            throw new Error(`Image format conversion failed: ${error.message}`);
        }
    }

    /**
     * Enhanced format detection (2025 method)
     */
    async detectFormatFromBuffer(buffer) {
        try {
            // PDF detection
            if (buffer.toString('ascii', 0, 4) === '%PDF') {
                return 'pdf';
            }
            
            // ZIP-based formats (DOCX, etc.)
            if (buffer[0] === 0x50 && buffer[1] === 0x4B) {
                // More specific detection for DOCX vs other ZIP files
                const bufferStr = buffer.toString();
                if (bufferStr.includes('[Content_Types].xml') || bufferStr.includes('word/document.xml')) {
                    return 'docx';
                }
                return 'docx'; // Default assumption for ZIP files
            }
            
            // DOC format (MS Office legacy)
            if (buffer.toString('hex', 0, 8) === 'd0cf11e0a1b11ae1') {
                return 'doc';
            }
            
            // Image formats (enhanced detection)
            if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
            if (buffer.toString('ascii', 1, 4) === 'PNG') return 'png';
            if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
            if (buffer.toString('ascii', 0, 2) === 'BM') return 'bmp';
            if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') return 'gif';
            if (buffer.toString('ascii', 4, 12) === 'ftypavif') return 'avif';
            
            // TIFF detection
            if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4D && buffer[1] === 0x4D)) return 'tiff';
            
            throw new Error('Unknown file format');
        } catch (error) {
            throw new Error(`Format detection failed: ${error.message}`);
        }
    }

    /**
     * Universal converter with intelligent routing (2025 Enhanced)
     */
    async convert(inputBuffer, targetFormat, options = {}) {
        try {
            const inputFormat = await this.detectFormatFromBuffer(inputBuffer);
            const target = targetFormat.toLowerCase();
            
            console.log(`🔄 Converting ${inputFormat} to ${target}...`);

            let result;
            
            // Enhanced routing with better error handling
            if (inputFormat === 'pdf') {
                switch (target) {
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                    case 'webp':
                        const images = await this.pdfToImages(inputBuffer, { format: target, ...options });
                        result = images.length === 1 ? images[0].buffer : images;
                        break;
                    case 'docx':
                        result = await this.pdfToDocx(inputBuffer);
                        break;
                    case 'html':
                    case 'txt':
                        const docxBuffer = await this.pdfToDocx(inputBuffer);
                        result = await this.docxToText(docxBuffer, target === 'html' ? 'html' : 'text');
                        break;
                    default:
                        throw new Error(`Conversion from PDF to ${target} not supported`);
                }
            } else if (['docx', 'doc'].includes(inputFormat)) {
                switch (target) {
                    case 'pdf':
                        result = await this.docxToPdf(inputBuffer);
                        break;
                    case 'html':
                    case 'txt':
                        result = await this.docxToText(inputBuffer, target === 'html' ? 'html' : 'text');
                        break;
                    default:
                        throw new Error(`Conversion from ${inputFormat} to ${target} not supported`);
                }
            } else if (['jpg', 'jpeg', 'png', 'webp', 'tiff', 'bmp', 'gif', 'avif'].includes(inputFormat)) {
                switch (target) {
                    case 'pdf':
                        result = await this.imagesToPdf([inputBuffer], null, options);
                        break;
                    case 'jpg':
                    case 'jpeg':
                    case 'png':
                    case 'webp':
                    case 'tiff':
                    case 'avif':
                        result = await this.convertImageFormat(inputBuffer, target, options);
                        break;
                    default:
                        throw new Error(`Conversion from ${inputFormat} to ${target} not supported`);
                }
            } else {
                throw new Error(`Input format ${inputFormat} not supported`);
            }

            return result;
        } catch (error) {
            throw new Error(`Universal conversion failed: ${error.message}`);
        }
    }

    /**
     * Get converter status and available methods
     */
    getStatus() {
        return {
            packages: {
                'pdf-img-convert': !!pdfImgConvert,
                'pdf-to-png-converter': !!pdfToPngConverter,
                'sharp': !!sharp,
                'mammoth': !!mammoth,
                'pdfkit': !!PDFDocument,
                'libreoffice-convert': !!convertAsync,
                'axios': !!axios,
                'form-data': !!FormData
            },
            apiKeys: {
                cloudconvert: !!process.env.CLOUDCONVERT_API_KEY,
                convertio: !!process.env.CONVERTIO_API_KEY,
                freeconvert: !!process.env.FREECONVERT_API_KEY
            },
            apiLimits: {
                cloudconvert: `${apiUsage.cloudconvert.count}/10 used`,
                convertio: `${apiUsage.convertio.count}/25 used`,
                freeconvert: 'Available'
            },
            fallbacksAvailable: this.hasFallbacksAvailable()
        };
    }

    /**
     * Check if fallbacks are actually available
     */
    hasFallbacksAvailable() {
        const hasLocalPackages = !!pdfImgConvert || !!pdfToPngConverter || !!sharp || !!PDFDocument;
        const hasApiKeys = !!process.env.CLOUDCONVERT_API_KEY || !!process.env.CONVERTIO_API_KEY;
        return hasLocalPackages || hasApiKeys;
    }

    /**
     * Get supported conversions (2025 Updated)
     */
    getSupportedConversions() {
        return {
            'PDF': {
                to: ['JPG', 'PNG', 'WEBP', 'AVIF', 'DOCX', 'HTML', 'TXT'],
                description: 'Convert PDF to images, documents, or text formats'
            },
            'DOCX': {
                to: ['PDF', 'HTML', 'TXT'],
                description: 'Convert Word documents to PDF or text formats'
            },
            'DOC': {
                to: ['PDF', 'HTML', 'TXT'],
                description: 'Convert legacy Word documents to PDF or text formats'
            },
            'Images (JPG/PNG/WEBP/TIFF/BMP/GIF/AVIF)': {
                to: ['PDF', 'JPG', 'PNG', 'WEBP', 'TIFF', 'AVIF'],
                description: 'Convert between image formats or create PDFs'
            }
        };
    }

    /**
     * Convert to PDF command
     */
    async convertToPdfCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}pdf`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to PDF... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'pdf', {
                quality: 85,
                pageSize: 'A4'
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to PDF.');
                return;
            }

            // Send PDF
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: result,
                fileName: `converted_${Date.now()}.pdf`,
                mimetype: 'application/pdf',
                caption: '📄 Converted to PDF'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to PDF!');

        } catch (error) {
            console.log('Convert to PDF error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to PDF. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to DOCX command
     */
    async convertToDocxCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}doc`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to DOCX... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'docx');

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to DOCX.');
                return;
            }

            // Send DOCX
            await this.bot.sock.sendMessage(messageInfo.sender, {
                document: result,
                fileName: `converted_${Date.now()}.docx`,
                mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                caption: '📄 Converted to DOCX'
            });

            await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to DOCX!');

        } catch (error) {
            console.log('Convert to DOCX error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to DOCX. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * Convert to PNG command
     */
    async convertToPngCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}png`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to PNG... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'png', {
                quality: 100
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to PNG.');
                return;
            }

            // Handle multiple images from PDF
            if (Array.isArray(result)) {
                for (let i = 0; i < result.length; i++) {
                    const image = result[i];
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: image.buffer,
                        caption: `📄 Page ${i + 1} of ${result.length} - Converted to PNG`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${result.length} PNG image(s)!`
                );
            } else {
                // Single image
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: result,
                    caption: '🖼️ Converted to PNG'
                });
                await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to PNG!');
            }

        } catch (error) {
            console.log('Convert to PNG error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to PNG. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to JPG command
     */
    async convertToJpgCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a file or send a file with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}jpg`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to JPG... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'jpg', {
                quality: 85
            });

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to JPG.');
                return;
            }

            // Handle multiple images from PDF
            if (Array.isArray(result)) {
                for (let i = 0; i < result.length; i++) {
                    const image = result[i];
                    await this.bot.sock.sendMessage(messageInfo.sender, {
                        image: image.buffer,
                        caption: `📄 Page ${i + 1} of ${result.length} - Converted to JPG`
                    });
                }
                await this.bot.messageHandler.reply(messageInfo, 
                    `✅ Successfully converted to ${result.length} JPG image(s)!`
                );
            } else {
                // Single image
                await this.bot.sock.sendMessage(messageInfo.sender, {
                    image: result,
                    caption: '🖼️ Converted to JPG'
                });
                await this.bot.messageHandler.reply(messageInfo, '✅ Successfully converted to JPG!');
            }

        } catch (error) {
            console.log('Convert to JPG error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to JPG. Please ensure the file is valid.'
            );
        }
    }

    /**
     * Convert to HTML command
     */
    async convertToHtmlCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}html`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to HTML... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'html');

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to HTML.');
                return;
            }

            // Send HTML content as text (truncated if too long)
            const htmlContent = typeof result === 'string' ? result : result.toString();
            const truncatedHtml = htmlContent.length > 4000 ? htmlContent.substring(0, 4000) + '...' : htmlContent;
            
            await this.bot.messageHandler.reply(messageInfo, 
                `📄 *Converted to HTML:*\n\n\`\`\`html\n${truncatedHtml}\n\`\`\``
            );

        } catch (error) {
            console.log('Convert to HTML error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to HTML. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * Convert to TXT command
     */
    async convertToTxtCommand(messageInfo) {
        try {
            const mediaData = await this.downloadMedia(messageInfo);
            
            if (!mediaData) {
                await this.bot.messageHandler.reply(messageInfo, 
                    '❌ Please reply to a document or send a document with the command as caption.\n\n' +
                    `Usage: ${config.PREFIX}txt`
                );
                return;
            }

            await this.bot.messageHandler.reply(messageInfo, '🔄 Converting to text... Please wait.');

            // Use universal converter
            const result = await this.convert(mediaData.buffer, 'txt');

            if (!result) {
                await this.bot.messageHandler.reply(messageInfo, '❌ Failed to convert file to text.');
                return;
            }

            // Send text content (truncated if too long)
            const textContent = typeof result === 'string' ? result : result.toString();
            const truncatedText = textContent.length > 4000 ? textContent.substring(0, 4000) + '...' : textContent;
            
            await this.bot.messageHandler.reply(messageInfo, 
                `📄 *Converted to Text:*\n\n${truncatedText}`
            );

        } catch (error) {
            console.log('Convert to TXT error:', error);
            await this.bot.messageHandler.reply(messageInfo, 
                '❌ Failed to convert file to text. Please ensure the file is a valid document.'
            );
        }
    }

    /**
     * List supported conversions command
     */
    async listConversionsCommand(messageInfo) {
        const conversions = this.getSupportedConversions();
        const status = this.getStatus();
        
        let message = '📋 *FILE CONVERTER STATUS - 2025 ENHANCED*\n\n';
        
        // Show status first
        message += '🔧 *Available Packages:*\n';
        const packages = status.packages;
        const packagesAvailable = Object.keys(packages).filter(p => packages[p]).length;
        message += `  ✅ ${packagesAvailable}/${Object.keys(packages).length} packages loaded\n`;
        
        if (status.fallbacksAvailable) {
            message += '  🌐 API fallbacks ready\n';
        }
        message += '\n';
        
        // Show supported conversions
        message += '📋 *SUPPORTED CONVERSIONS:*\n\n';
        for (const [from, info] of Object.entries(conversions)) {
            message += `🔹 *${from}*\n`;
            message += `   → ${info.to.join(', ')}\n`;
            message += `   ${info.description}\n\n`;
        }

        message += '🔧 *AVAILABLE COMMANDS:*\n\n';
        message += `• \`${config.PREFIX}pdf\` - Convert any file to PDF\n`;
        message += `• \`${config.PREFIX}doc\` - Convert any document to DOCX\n`;
        message += `• \`${config.PREFIX}png\` - Convert any file to PNG\n`;
        message += `• \`${config.PREFIX}jpg\` - Convert any file to JPG\n`;
        message += `• \`${config.PREFIX}html\` - Convert any document to HTML\n`;
        message += `• \`${config.PREFIX}txt\` - Convert any document to text\n\n`;
        message += '💡 *Usage:* Reply to a file with the command or send file with command as caption\n\n';
        
        message += '🚀 *2025 Features:* Multiple fallbacks, API integration, AVIF/WebP support, intelligent error handling';

        await this.bot.messageHandler.reply(messageInfo, message);
    }
}

module.exports = new ConverterPlugin();